import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { canonicalBid, endsAtAfterBid, MAX_BID_CENTS, minimumNextBidCents, PlaceBidResponse } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { AppException, BidRejectedException, notFound } from '../../common/errors';
import { TransactionRunner } from '../../common/transaction-runner';
import { BidEntity, LotEntity } from '../../database/entities';
import { AuditSigner } from '../audit/audit-signer.service';
import { PseudonymService } from '../audit/pseudonym.service';
import type { AuthUser } from '../auth/auth.types';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { WalletLedger } from '../wallet/wallet-ledger';
import { LotMapper } from './lot.mapper';
import { LotsService } from './lots.service';

/**
 * Motor de lances.
 *
 * Concorrência: cada lance roda numa transação que começa travando a LINHA DO LOTE
 * (SELECT ... FOR UPDATE). Dois lances no mesmo lote são, portanto, serializados: o segundo só lê o
 * lote depois que o primeiro fez commit, já enxergando o novo preço. Lances em lotes diferentes seguem
 * em paralelo. As carteiras envolvidas (quem dá o lance e o líder anterior) são travadas em seguida,
 * sempre em ordem de id, o que impede deadlock.
 *
 * Ordem das validações (define qual mensagem o licitante recebe):
 *   papel -> lote cancelado -> encerrado -> não iniciado -> já está ganhando -> abaixo do mínimo -> saldo.
 */
@Injectable()
export class BiddingService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
    private readonly signer: AuditSigner,
    private readonly pseudonyms: PseudonymService,
    private readonly realtime: RealtimePublisher,
    private readonly lots: LotsService,
    private readonly mapper: LotMapper,
  ) {}

  async placeBid(lotId: string, user: AuthUser, amountCents: number, at?: Date): Promise<PlaceBidResponse> {
    if (user.role !== 'BIDDER') throw new BidRejectedException('ROLE_NOT_ALLOWED');
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_BID_CENTS) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_AMOUNT', 'Valor de lance inválido.');
    }

    const result = await this.tx.run(async (manager) => {
      const lot = await manager.findOne(LotEntity, { where: { id: lotId }, lock: { mode: 'pessimistic_write' } });
      if (!lot) throw notFound('Lote');

      // O relógio é lido DEPOIS de obter o lock: assim a ordem dos horários acompanha a ordem da cadeia.
      let now = at ?? this.clock.now();
      if (lot.lastBidAt && now.getTime() < lot.lastBidAt.getTime()) now = new Date(lot.lastBidAt.getTime());

      // 1) Só lotes ao vivo (entre início e fim) aceitam lances.
      if (lot.state === 'CANCELLED') throw new BidRejectedException('LOT_CANCELLED');
      if (lot.state === 'SETTLED' || now.getTime() >= lot.endsAt.getTime()) {
        throw new BidRejectedException('LOT_CLOSED', { endsAt: lot.endsAt.toISOString() });
      }
      if (now.getTime() < lot.startsAt.getTime()) {
        throw new BidRejectedException('LOT_NOT_STARTED', { startsAt: lot.startsAt.toISOString() });
      }

      // 2) O licitante líder não pode cobrir o próprio lance.
      if (lot.leaderId === user.id) throw new BidRejectedException('ALREADY_WINNING');

      // 3) Primeiro lance >= lance inicial; seguintes >= lance atual + incremento.
      const minimum = minimumNextBidCents(lot);
      if (amountCents < minimum) {
        throw new BidRejectedException('BELOW_MINIMUM', { minimumCents: minimum, isFirstBid: lot.bidCount === 0 });
      }

      // 4) Saldo: o lance só é aceito se couber no DISPONÍVEL (total - comprometido).
      const ledger = new WalletLedger(manager, now);
      const wallets = await ledger.lock(lot.leaderId ? [user.id, lot.leaderId] : [user.id]);
      const bidderWallet = wallets.get(user.id)!;
      if (bidderWallet.availableCents < amountCents) {
        throw new BidRejectedException('INSUFFICIENT_FUNDS', {
          availableCents: bidderWallet.availableCents,
          amountCents,
        });
      }

      // Líder anterior superado: o valor dele volta ao disponível imediatamente (mesma transação).
      const previousLeaderId = lot.leaderId;
      const previousPrice = lot.currentPriceCents;
      let previousLeaderWallet = null;
      if (previousLeaderId && previousPrice !== null) {
        previousLeaderWallet = wallets.get(previousLeaderId)!;
        await ledger.release(
          previousLeaderWallet,
          previousPrice,
          lot,
          `Lance superado em "${lot.title}": valor liberado`,
        );
      }
      await ledger.hold(bidderWallet, amountCents, lot);

      // Prorrogação anti-sniping.
      const endsAtAfter = new Date(
        endsAtAfterBid(lot.endsAt.getTime(), now.getTime(), {
          windowMs: lot.antiSnipingWindowMs,
          extensionMs: lot.antiSnipingExtensionMs,
        }),
      );
      const extended = endsAtAfter.getTime() > lot.endsAt.getTime();

      // Registro encadeado e assinado.
      const alias = this.pseudonyms.aliasFor(lot.id, user.id);
      const fields = {
        lotId: lot.id,
        seq: lot.bidCount + 1,
        bidderAlias: alias,
        amountCents,
        createdAt: now.toISOString(),
        endsAtAfter: endsAtAfter.toISOString(),
        prevHash: lot.headHash,
      };
      const message = canonicalBid(fields);
      const bid = Object.assign(new BidEntity(), {
        id: randomUUID(),
        lotId: lot.id,
        seq: fields.seq,
        bidderId: user.id,
        bidderAlias: alias,
        amountCents,
        createdAt: now,
        endsAtAfter,
        prevHash: lot.headHash,
        hash: this.signer.sha256Hex(message),
        signature: this.signer.sign(message),
        keyId: this.signer.keyId,
      });
      await manager.insert(BidEntity, bid);

      const previousEndsAt = lot.endsAt;
      lot.bidCount = fields.seq;
      lot.currentPriceCents = amountCents;
      lot.leaderId = user.id;
      lot.lastBidAt = now;
      lot.endsAt = endsAtAfter;
      lot.headHash = bid.hash;
      lot.updatedAt = now;
      this.signer.sealHead(lot);
      await manager.update(
        LotEntity,
        { id: lot.id },
        {
          bidCount: lot.bidCount,
          currentPriceCents: lot.currentPriceCents,
          leaderId: lot.leaderId,
          lastBidAt: lot.lastBidAt,
          endsAt: lot.endsAt,
          headHash: lot.headHash,
          headSignature: lot.headSignature,
          headKeyId: lot.headKeyId,
          updatedAt: lot.updatedAt,
        },
      );

      return {
        lot,
        bid,
        now,
        extended,
        previousEndsAt,
        previousLeaderId,
        previousPrice,
        bidderWallet: { ...bidderWallet, availableCents: bidderWallet.availableCents },
        previousLeaderWallet: previousLeaderWallet
          ? { ...previousLeaderWallet, availableCents: previousLeaderWallet.availableCents }
          : null,
      };
    }, 'lance');

    // Publicação em tempo real somente após o commit.
    const { lot, bid, now } = result;
    const bidDto = this.mapper.bid(bid, result.previousEndsAt);
    const minNextBidCents = minimumNextBidCents(lot);
    this.realtime.bidPlaced({
      lotId: lot.id,
      bid: bidDto,
      currentPriceCents: bid.amountCents,
      minNextBidCents,
      bidCount: lot.bidCount,
      endsAt: lot.endsAt.toISOString(),
      extended: result.extended,
      leaderAlias: bid.bidderAlias,
      serverTime: now.toISOString(),
    });
    this.realtime.walletUpdated(user.id, {
      balanceCents: result.bidderWallet.balanceCents,
      heldCents: result.bidderWallet.heldCents,
      availableCents: result.bidderWallet.availableCents,
      reason: 'HOLD',
      lotId: lot.id,
    });
    if (result.previousLeaderId && result.previousPrice !== null && result.previousLeaderWallet) {
      this.realtime.outbid(result.previousLeaderId, {
        lotId: lot.id,
        lotTitle: lot.title,
        currentPriceCents: bid.amountCents,
        minNextBidCents,
        releasedCents: result.previousPrice,
      });
      this.realtime.walletUpdated(result.previousLeaderId, {
        balanceCents: result.previousLeaderWallet.balanceCents,
        heldCents: result.previousLeaderWallet.heldCents,
        availableCents: result.previousLeaderWallet.availableCents,
        reason: 'RELEASE',
        lotId: lot.id,
      });
    }

    return {
      bid: bidDto,
      lot: await this.lots.detailOf(lot, now),
      viewer: await this.lots.viewerFor(lot, user),
      serverTime: now.toISOString(),
    };
  }
}
