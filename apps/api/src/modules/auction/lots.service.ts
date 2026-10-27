import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import {
  AuctioneerDashboardDto,
  AuctioneerLotDto,
  AuctioneerLotResult,
  BidDto,
  computeLotPhase,
  LOT_LIMITS,
  LotDetailDto,
  LotPageDto,
  LotViewerDto,
  MyBidDto,
  MyBidsResponse,
  MyBidStatus,
  ShowcaseResponse,
  ShowcaseSort,
  ShowcaseTab,
} from '@arremate/shared';
import { Clock } from '../../common/clock';
import { AppException, notFound } from '../../common/errors';
import { TransactionRunner } from '../../common/transaction-runner';
import { AppConfig } from '../../config/app-config';
import { BidEntity, LotEntity, ReceiptEntity, UserEntity, WalletEntity } from '../../database/entities';
import { AuditSigner } from '../audit/audit-signer.service';
import { PseudonymService } from '../audit/pseudonym.service';
import type { AuthUser } from '../auth/auth.types';
import { CatalogService } from '../catalog/catalog.service';
import { ImagesService } from '../images/images.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { WalletLedger } from '../wallet/wallet-ledger';
import { LOT_SUMMARY_COLUMNS, LotMapper } from './lot.mapper';
import { SettlementScheduler } from './settlement.scheduler';
import { SettlementService } from './settlement.service';

export interface CreateLotInput {
  externalId: string;
  title?: string;
  description?: string;
  startingPriceCents: number;
  minIncrementCents: number;
  startNow?: boolean;
  startsAt?: string;
  endsAt: string;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const badRequest = (code: string, message: string) => new AppException(HttpStatus.BAD_REQUEST, code, message);

@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly catalog: CatalogService,
    private readonly images: ImagesService,
    private readonly signer: AuditSigner,
    private readonly pseudonyms: PseudonymService,
    private readonly mapper: LotMapper,
    private readonly settlement: SettlementService,
    private readonly scheduler: SettlementScheduler,
    private readonly realtime: RealtimePublisher,
  ) {}

  /* --------------------------------------------------------------------------------- criação */

  async create(sellerId: string, input: CreateLotInput, at?: Date): Promise<LotDetailDto> {
    const now = at ?? this.clock.now();
    const { startsAt, endsAt } = this.validateSchedule(input, now);

    // O item vem SEMPRE do catálogo (servidor), nunca de dados enviados pelo navegador.
    const item = await this.catalog.getItem(input.externalId);
    const imageId = await this.images.storeFromUrl(item.imageUrl);

    const lot = Object.assign(new LotEntity(), {
      id: randomUUID(),
      sellerId,
      source: item.source,
      externalId: item.externalId,
      title: (input.title?.trim() || item.title).slice(0, 300),
      artist: item.artist?.slice(0, 300) ?? null,
      description: input.description?.trim() || null,
      attributes: item.attributes,
      itemSnapshot: item,
      imageId,
      imageRemoteUrl: item.imageUrl,
      imageLqip: item.lqip,
      imageAlt: item.altText,
      startingPriceCents: input.startingPriceCents,
      minIncrementCents: input.minIncrementCents,
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
      antiSnipingWindowMs: this.config.antiSniping.windowMs,
      antiSnipingExtensionMs: this.config.antiSniping.extensionMs,
      state: 'OPEN' as const,
      bidCount: 0,
      currentPriceCents: null,
      leaderId: null,
      lastBidAt: null,
      cancelledAt: null,
      cancelReason: null,
      settledAt: null,
      winnerId: null,
      finalPriceCents: null,
      createdAt: now,
      updatedAt: now,
    });
    // Gênese assinada: a partir daqui título, valores e datas originais não podem mudar sem ser detectado.
    this.signer.sealGenesis(lot);
    lot.headHash = lot.genesisHash;
    this.signer.sealHead(lot);

    await this.dataSource.getRepository(LotEntity).insert(lot);
    const [{ number }] = (await this.dataSource.query(`SELECT number FROM lots WHERE id = $1`, [lot.id])) as Array<{
      number: number;
    }>;
    lot.number = number;
    this.scheduler.notifyEndsAt(lot.endsAt);
    const seller = await this.dataSource.getRepository(UserEntity).findOneBy({ id: sellerId });
    return this.mapper.detail(lot, seller?.name ?? 'Leiloeiro', now);
  }

  private validateSchedule(input: CreateLotInput, now: Date): { startsAt: Date; endsAt: Date } {
    let startsAt: Date;
    if (input.startNow) {
      startsAt = now;
    } else {
      if (!input.startsAt) throw badRequest('INVALID_SCHEDULE', 'Informe a data de início ou escolha "começar agora".');
      startsAt = new Date(input.startsAt);
      if (startsAt.getTime() < now.getTime() - LOT_LIMITS.startGraceMs) {
        throw badRequest('INVALID_SCHEDULE', 'A data de início não pode estar no passado.');
      }
      if (startsAt.getTime() < now.getTime()) startsAt = now;
    }
    if (startsAt.getTime() - now.getTime() > LOT_LIMITS.maxStartAheadMs) {
      throw badRequest('INVALID_SCHEDULE', 'O lote pode ser agendado para começar em no máximo 180 dias.');
    }
    const endsAt = new Date(input.endsAt);
    const duration = endsAt.getTime() - startsAt.getTime();
    if (Number.isNaN(duration) || duration < LOT_LIMITS.minDurationMs) {
      throw badRequest('INVALID_SCHEDULE', 'O encerramento precisa ser pelo menos 1 minuto depois do início.');
    }
    if (duration > LOT_LIMITS.maxDurationMs) {
      throw badRequest('INVALID_SCHEDULE', 'Um lote pode durar no máximo 60 dias.');
    }
    return { startsAt, endsAt };
  }

  /* ---------------------------------------------------------------------------- cancelamento */

  /**
   * Cancela um lote ainda não encerrado. Sem lances: requisito base. Com lances (opcional do desafio):
   * o valor comprometido do licitante líder é liberado na mesma transação (estorno automático).
   */
  async cancel(lotId: string, sellerId: string, reason?: string, at?: Date): Promise<LotDetailDto> {
    const outcome = await this.tx.run(async (manager) => {
      const lot = await manager.findOne(LotEntity, { where: { id: lotId }, lock: { mode: 'pessimistic_write' } });
      if (!lot) throw notFound('Lote');
      if (lot.sellerId !== sellerId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'NOT_LOT_OWNER',
          'Apenas o leiloeiro responsável pode cancelar este lote.',
        );
      }
      const now = at ?? this.clock.now();
      if (lot.state === 'CANCELLED') {
        throw new AppException(HttpStatus.CONFLICT, 'LOT_ALREADY_CANCELLED', 'Este lote já foi cancelado.');
      }
      if (lot.state === 'SETTLED' || now.getTime() >= lot.endsAt.getTime()) {
        throw new AppException(HttpStatus.CONFLICT, 'LOT_ALREADY_CLOSED', 'Lotes encerrados não podem ser cancelados.');
      }

      let refunded: { userId: string; wallet: WalletEntity } | null = null;
      if (lot.bidCount > 0 && lot.leaderId && lot.currentPriceCents !== null) {
        const ledger = new WalletLedger(manager, now);
        const wallet = (await ledger.lock([lot.leaderId])).get(lot.leaderId)!;
        await ledger.release(
          wallet,
          lot.currentPriceCents,
          lot,
          `Estorno automático: lote "${lot.title}" cancelado pelo leiloeiro`,
        );
        refunded = { userId: lot.leaderId, wallet };
      }

      lot.state = 'CANCELLED';
      lot.cancelledAt = now;
      lot.cancelReason = reason?.trim().slice(0, 300) || null;
      lot.updatedAt = now;
      this.signer.sealHead(lot);
      await manager.update(
        LotEntity,
        { id: lot.id },
        {
          state: lot.state,
          cancelledAt: lot.cancelledAt,
          cancelReason: lot.cancelReason,
          headSignature: lot.headSignature,
          headKeyId: lot.headKeyId,
          updatedAt: now,
        },
      );
      return { lot, refunded, now };
    }, 'cancelamento');

    this.realtime.lotCancelled({
      lotId,
      refundedLeader: outcome.refunded !== null,
      serverTime: outcome.now.toISOString(),
    });
    if (outcome.refunded) {
      const { wallet, userId } = outcome.refunded;
      this.realtime.walletUpdated(userId, {
        balanceCents: wallet.balanceCents,
        heldCents: wallet.heldCents,
        availableCents: wallet.availableCents,
        reason: 'RELEASE',
        lotId,
      });
    }
    const seller = await this.dataSource.getRepository(UserEntity).findOneBy({ id: sellerId });
    return this.mapper.detail(outcome.lot, seller?.name ?? 'Leiloeiro', outcome.now);
  }

  /* --------------------------------------------------------------------------------- vitrine */

  async showcase(params: {
    tab: ShowcaseTab;
    q?: string;
    sort?: ShowcaseSort;
    page: number;
    pageSize: number;
  }): Promise<ShowcaseResponse> {
    const now = this.clock.now();
    const repo = this.dataSource.getRepository(LotEntity);
    const search = params.q?.trim();

    // Lotes cancelados nunca aparecem na vitrine.
    const base = () => {
      const qb = repo.createQueryBuilder('l').where("l.state <> 'CANCELLED'");
      if (search) {
        // Busca por título, artista ou número do lote ("7" ou "lote 7").
        const lotNumber = /^(lote\s*)?(\d{1,9})$/i.exec(search)?.[2];
        qb.andWhere(
          `(l.title ILIKE :search OR l.artist ILIKE :search${lotNumber ? ' OR l.number = :lotNumber' : ''})`,
          { search: `%${escapeLike(search)}%`, lotNumber: lotNumber ? Number(lotNumber) : undefined },
        );
      }
      return qb;
    };

    const listQuery = base().select(LOT_SUMMARY_COLUMNS.map((column) => `l.${column}`));
    const countQuery = base();
    for (const qb of [listQuery, countQuery]) {
      if (params.tab === 'live') {
        qb.andWhere("l.state = 'OPEN' AND l.startsAt <= :now AND l.endsAt > :now", { now });
      } else if (params.tab === 'scheduled') {
        qb.andWhere("l.state = 'OPEN' AND l.startsAt > :now", { now });
      } else {
        qb.andWhere("(l.state = 'SETTLED' OR (l.state = 'OPEN' AND l.endsAt <= :now))", { now });
      }
    }

    const sort = params.sort ?? 'relevance';
    if (sort === 'price_asc' || sort === 'price_desc') {
      listQuery
        .addSelect('COALESCE(l.current_price_cents, l.starting_price_cents)', 'display_price')
        .orderBy('display_price', sort === 'price_asc' ? 'ASC' : 'DESC');
    } else if (sort === 'newest') {
      listQuery.orderBy('l.createdAt', 'DESC');
    } else if (sort === 'ending' || params.tab === 'live') {
      listQuery.orderBy('l.endsAt', 'ASC');
    } else if (params.tab === 'scheduled') {
      listQuery.orderBy('l.startsAt', 'ASC');
    } else {
      listQuery.orderBy('l.endsAt', 'DESC');
    }
    listQuery.addOrderBy('l.id', 'ASC');

    const [lots, total, counts] = await Promise.all([
      listQuery
        .offset((params.page - 1) * params.pageSize)
        .limit(params.pageSize)
        .getMany(),
      countQuery.getCount(),
      base()
        .select(`COUNT(*) FILTER (WHERE l.state = 'OPEN' AND l.starts_at <= :now AND l.ends_at > :now)`, 'live')
        .addSelect(`COUNT(*) FILTER (WHERE l.state = 'OPEN' AND l.starts_at > :now)`, 'scheduled')
        .addSelect(`COUNT(*) FILTER (WHERE l.state = 'SETTLED' OR (l.state = 'OPEN' AND l.ends_at <= :now))`, 'closed')
        .setParameter('now', now)
        .getRawOne<{ live: string; scheduled: string; closed: string }>(),
    ]);

    return {
      items: lots.map((lot) => this.mapper.summary(lot, now)),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      counts: {
        live: Number(counts?.live ?? 0),
        scheduled: Number(counts?.scheduled ?? 0),
        closed: Number(counts?.closed ?? 0),
      },
      serverTime: now.toISOString(),
    };
  }

  /* --------------------------------------------------------------------------- sala do lote */

  async page(lotId: string, user?: AuthUser): Promise<LotPageDto> {
    let lot = await this.findLot(lotId);
    if (lot.state === 'OPEN' && lot.endsAt.getTime() <= this.clock.now().getTime()) {
      // Liquidação "preguiçosa": cobre o caso de o servidor ter hibernado durante o encerramento.
      await this.settlement
        .settleLot(lot.id)
        .catch((error: Error) => this.logger.warn(`Liquidação sob demanda do lote ${lot.id} falhou: ${error.message}`));
      lot = await this.findLot(lotId);
    }
    const now = this.clock.now();
    return {
      lot: await this.detailOf(lot, now),
      viewer: await this.viewerFor(lot, user),
      serverTime: now.toISOString(),
    };
  }

  async detailOf(lot: LotEntity, now: Date): Promise<LotDetailDto> {
    const seller = await this.dataSource.getRepository(UserEntity).findOneBy({ id: lot.sellerId });
    return this.mapper.detail(lot, seller?.name ?? 'Leiloeiro', now);
  }

  async findLot(lotId: string): Promise<LotEntity> {
    const lot = await this.dataSource.getRepository(LotEntity).findOneBy({ id: lotId });
    if (!lot) throw notFound('Lote');
    return lot;
  }

  /** Dados da sala que dependem de quem está olhando: posição, liderança, saldo disponível, comprovante. */
  async viewerFor(lot: LotEntity, user: AuthUser | undefined): Promise<LotViewerDto> {
    const stats = (await this.dataSource.query(
      `SELECT bidder_id, MAX(amount_cents)::bigint AS max_amount
         FROM bids WHERE lot_id = $1
        GROUP BY bidder_id
        ORDER BY max_amount DESC`,
      [lot.id],
    )) as Array<{ bidder_id: string; max_amount: string }>;

    if (!user) {
      return {
        authenticated: false,
        role: null,
        isSeller: false,
        alias: null,
        isLeader: false,
        hasBid: false,
        myMaxBidCents: null,
        position: null,
        totalBidders: stats.length,
        availableCents: null,
        receiptCode: null,
      };
    }

    const index = stats.findIndex((row) => row.bidder_id === user.id);
    const isSeller = lot.sellerId === user.id;
    const wallet =
      user.role === 'BIDDER' ? await this.dataSource.getRepository(WalletEntity).findOneBy({ userId: user.id }) : null;
    let receiptCode: string | null = null;
    if (lot.state === 'SETTLED' && lot.winnerId && (lot.winnerId === user.id || isSeller)) {
      const receipt = await this.dataSource.getRepository(ReceiptEntity).findOne({
        select: { code: true },
        where: { lotId: lot.id },
      });
      receiptCode = receipt?.code ?? null;
    }
    return {
      authenticated: true,
      role: user.role,
      isSeller,
      alias: user.role === 'BIDDER' ? this.pseudonyms.aliasFor(lot.id, user.id) : null,
      isLeader: lot.leaderId === user.id,
      hasBid: index >= 0,
      myMaxBidCents: index >= 0 ? Number(stats[index].max_amount) : null,
      position: index >= 0 ? index + 1 : null,
      totalBidders: stats.length,
      availableCents: wallet ? wallet.availableCents : null,
      receiptCode,
    };
  }

  /** Histórico público de lances (mais recente primeiro), sem dados pessoais. */
  async bids(lotId: string): Promise<BidDto[]> {
    const lot = await this.dataSource.getRepository(LotEntity).findOne({
      select: { id: true, originalEndsAt: true },
      where: { id: lotId },
    });
    if (!lot) throw notFound('Lote');
    const rows = await this.dataSource.getRepository(BidEntity).find({ where: { lotId }, order: { seq: 'ASC' } });
    let previousEndsAt = lot.originalEndsAt;
    const result = rows.map((bid) => {
      const dto = this.mapper.bid(bid, previousEndsAt);
      previousEndsAt = bid.endsAtAfter;
      return dto;
    });
    return result.reverse();
  }

  /* ------------------------------------------------------------------------ painel leiloeiro */

  async dashboard(sellerId: string): Promise<AuctioneerDashboardDto> {
    const now = this.clock.now();
    const lots = await this.dataSource.getRepository(LotEntity).find({
      select: [...LOT_SUMMARY_COLUMNS, 'cancelledAt'],
      where: { sellerId },
      order: { createdAt: 'DESC' },
    });
    const receipts = lots.length
      ? await this.dataSource.getRepository(ReceiptEntity).find({
          select: { lotId: true, code: true },
          where: { lotId: In(lots.map((lot) => lot.id)) },
        })
      : [];
    const receiptByLot = new Map(receipts.map((receipt) => [receipt.lotId, receipt.code]));

    const items: AuctioneerLotDto[] = lots.map((lot) => {
      const summary = this.mapper.summary(lot, now);
      const open = lot.state === 'OPEN' && now.getTime() < lot.endsAt.getTime();
      let result: AuctioneerLotResult;
      if (lot.state === 'CANCELLED') result = 'CANCELLED';
      else if (lot.state === 'SETTLED') result = lot.winnerId ? 'SOLD' : 'UNSOLD';
      else if (summary.phase === 'SCHEDULED') result = 'SCHEDULED';
      else if (summary.phase === 'LIVE') result = 'LIVE';
      else result = 'AWAITING_SETTLEMENT';
      return {
        ...summary,
        state: lot.state,
        result,
        winnerAlias: lot.winnerId ? this.pseudonyms.aliasFor(lot.id, lot.winnerId) : null,
        canCancel: open,
        cancelRefundsLeader: open && lot.bidCount > 0,
        receiptCode: receiptByLot.get(lot.id) ?? null,
      };
    });

    const count = (result: AuctioneerLotResult) => items.filter((lot) => lot.result === result).length;
    return {
      lots: items,
      summary: {
        totalReceivedCents: items
          .filter((lot) => lot.result === 'SOLD')
          .reduce((sum, lot) => sum + (lot.finalPriceCents ?? 0), 0),
        soldCount: count('SOLD'),
        unsoldCount: count('UNSOLD'),
        liveCount: count('LIVE'),
        scheduledCount: count('SCHEDULED'),
        cancelledCount: count('CANCELLED'),
      },
      serverTime: now.toISOString(),
    };
  }

  /* -------------------------------------------------------------------------- meus arremates */

  async myBids(userId: string): Promise<MyBidsResponse> {
    const now = this.clock.now();
    const rows = (await this.dataSource.query(
      `SELECT lot_id,
              MAX(amount_cents)::bigint AS max_amount,
              COUNT(*)::int AS bid_count,
              MAX(created_at) AS last_bid_at
         FROM bids
        WHERE bidder_id = $1
        GROUP BY lot_id
        ORDER BY MAX(created_at) DESC`,
      [userId],
    )) as Array<{ lot_id: string; max_amount: string; bid_count: number; last_bid_at: Date }>;
    if (rows.length === 0) return { items: [], serverTime: now.toISOString() };

    const lotIds = rows.map((row) => row.lot_id);
    const lots = await this.dataSource.getRepository(LotEntity).find({
      select: LOT_SUMMARY_COLUMNS,
      where: { id: In(lotIds) },
    });
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const receipts = await this.dataSource.getRepository(ReceiptEntity).find({
      select: { lotId: true, code: true },
      where: { lotId: In(lotIds), winnerId: userId },
    });
    const receiptByLot = new Map(receipts.map((receipt) => [receipt.lotId, receipt.code]));

    const items: MyBidDto[] = [];
    for (const row of rows) {
      const lot = lotById.get(row.lot_id);
      if (!lot) continue;
      const phase = computeLotPhase(lot, now);
      let status: MyBidStatus;
      if (lot.state === 'CANCELLED') status = 'CANCELLED';
      else if (lot.state === 'SETTLED') status = lot.winnerId === userId ? 'WON' : 'LOST';
      else if (phase === 'CLOSED') status = lot.leaderId === userId ? 'WON' : 'LOST';
      else status = lot.leaderId === userId ? 'LEADING' : 'OUTBID';
      items.push({
        lot: this.mapper.summary(lot, now),
        myAlias: this.pseudonyms.aliasFor(lot.id, userId),
        myMaxBidCents: Number(row.max_amount),
        myBidCount: row.bid_count,
        lastBidAt: new Date(row.last_bid_at).toISOString(),
        status,
        receiptCode: receiptByLot.get(lot.id) ?? null,
      });
    }
    return { items, serverTime: now.toISOString() };
  }
}
