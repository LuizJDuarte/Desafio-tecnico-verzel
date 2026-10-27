import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { canonicalReceipt } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { TransactionRunner } from '../../common/transaction-runner';
import { LotEntity, ReceiptEntity } from '../../database/entities';
import { AuditSigner } from '../audit/audit-signer.service';
import { PseudonymService } from '../audit/pseudonym.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { WalletLedger } from '../wallet/wallet-ledger';

export interface SettlementOutcome {
  lotId: string;
  lotTitle: string;
  sellerId: string;
  winnerId: string | null;
  winnerAlias: string | null;
  amountCents: number | null;
  receiptCode: string | null;
  settledAt: Date;
  winnerWallet: { balanceCents: number; heldCents: number } | null;
  sellerWallet: { balanceCents: number; heldCents: number } | null;
}

/**
 * Liquidação: ao encerrar, debita o vencedor, credita o leiloeiro e emite o comprovante assinado.
 * Lotes sem lances fecham sem vencedor. É idempotente e segura com várias instâncias:
 * - o lote é travado com FOR UPDATE SKIP LOCKED (se outro processo já está liquidando, pula);
 * - dentro do lock confere de novo se ainda está OPEN e se o prazo (talvez prorrogado) já passou.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
    private readonly signer: AuditSigner,
    private readonly pseudonyms: PseudonymService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async settleDueLots(at?: Date): Promise<number> {
    const now = at ?? this.clock.now();
    const due = await this.dataSource
      .getRepository(LotEntity)
      .createQueryBuilder('l')
      .select('l.id', 'id')
      .where("l.state = 'OPEN'")
      .andWhere('l.endsAt <= :now', { now })
      .orderBy('l.endsAt', 'ASC')
      .limit(50)
      .getRawMany<{ id: string }>();

    let settled = 0;
    for (const { id } of due) {
      try {
        if (await this.settleLot(id, now)) settled++;
      } catch (error) {
        this.logger.error(`Falha ao liquidar o lote ${id}`, (error as Error).stack);
      }
    }
    return settled;
  }

  async nextDueAt(): Promise<Date | null> {
    const row = await this.dataSource
      .getRepository(LotEntity)
      .createQueryBuilder('l')
      .select('MIN(l.ends_at)', 'next')
      .where("l.state = 'OPEN'")
      .getRawOne<{ next: Date | string | null }>();
    return row?.next ? new Date(row.next) : null;
  }

  async settleLot(lotId: string, at?: Date): Promise<SettlementOutcome | null> {
    const outcome = await this.tx.run(async (manager) => {
      const lot = await manager.findOne(LotEntity, {
        where: { id: lotId },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      const now = at ?? this.clock.now();
      if (!lot || lot.state !== 'OPEN' || lot.endsAt.getTime() > now.getTime()) return null;

      let result: SettlementOutcome = {
        lotId: lot.id,
        lotTitle: lot.title,
        sellerId: lot.sellerId,
        winnerId: null,
        winnerAlias: null,
        amountCents: null,
        receiptCode: null,
        settledAt: now,
        winnerWallet: null,
        sellerWallet: null,
      };

      if (lot.bidCount > 0 && lot.leaderId && lot.currentPriceCents !== null) {
        const winnerId = lot.leaderId;
        const amount = lot.currentPriceCents;
        const ledger = new WalletLedger(manager, now);
        const wallets = await ledger.lock([winnerId, lot.sellerId]);
        const winnerWallet = wallets.get(winnerId)!;
        const sellerWallet = wallets.get(lot.sellerId)!;
        await ledger.capture(winnerWallet, amount, lot);
        await ledger.credit(sellerWallet, amount, lot);

        const [{ number }] = (await manager.query(`SELECT nextval('receipt_number_seq')::int AS number`)) as Array<{
          number: number;
        }>;
        const fields = {
          code: randomBytes(9).toString('base64url'),
          number,
          lotId: lot.id,
          lotTitle: lot.title,
          winnerAlias: this.pseudonyms.aliasFor(lot.id, winnerId),
          amountCents: amount,
          bidCount: lot.bidCount,
          headHash: lot.headHash,
          closedAt: lot.endsAt.toISOString(),
          issuedAt: now.toISOString(),
        };
        const message = canonicalReceipt(fields);
        await manager.insert(ReceiptEntity, {
          id: randomUUID(),
          ...fields,
          winnerId,
          closedAt: lot.endsAt,
          issuedAt: now,
          payloadHash: this.signer.sha256Hex(message),
          signature: this.signer.sign(message),
          keyId: this.signer.keyId,
        });

        lot.winnerId = winnerId;
        lot.finalPriceCents = amount;
        result = {
          ...result,
          winnerId,
          winnerAlias: fields.winnerAlias,
          amountCents: amount,
          receiptCode: fields.code,
          winnerWallet: { balanceCents: winnerWallet.balanceCents, heldCents: winnerWallet.heldCents },
          sellerWallet: { balanceCents: sellerWallet.balanceCents, heldCents: sellerWallet.heldCents },
        };
      }

      lot.state = 'SETTLED';
      lot.settledAt = now;
      lot.updatedAt = now;
      this.signer.sealHead(lot);
      await manager.update(
        LotEntity,
        { id: lot.id },
        {
          state: lot.state,
          settledAt: lot.settledAt,
          winnerId: lot.winnerId,
          finalPriceCents: lot.finalPriceCents,
          headSignature: lot.headSignature,
          headKeyId: lot.headKeyId,
          updatedAt: lot.updatedAt,
        },
      );
      return result;
    }, 'liquidação');

    if (outcome) this.publish(outcome);
    return outcome;
  }

  private publish(outcome: SettlementOutcome): void {
    const serverTime = this.clock.now().toISOString();
    this.realtime.lotClosed({
      lotId: outcome.lotId,
      hasWinner: outcome.winnerId !== null,
      winnerAlias: outcome.winnerAlias,
      finalPriceCents: outcome.amountCents,
      settledAt: outcome.settledAt.toISOString(),
      serverTime,
    });
    if (outcome.winnerId && outcome.amountCents !== null && outcome.receiptCode) {
      this.realtime.lotWon(outcome.winnerId, {
        lotId: outcome.lotId,
        lotTitle: outcome.lotTitle,
        amountCents: outcome.amountCents,
        receiptCode: outcome.receiptCode,
      });
      if (outcome.winnerWallet) {
        this.realtime.walletUpdated(outcome.winnerId, {
          ...outcome.winnerWallet,
          availableCents: outcome.winnerWallet.balanceCents - outcome.winnerWallet.heldCents,
          reason: 'CAPTURE',
          lotId: outcome.lotId,
        });
      }
      this.realtime.lotSold(outcome.sellerId, {
        lotId: outcome.lotId,
        lotTitle: outcome.lotTitle,
        amountCents: outcome.amountCents,
      });
      if (outcome.sellerWallet) {
        this.realtime.walletUpdated(outcome.sellerId, {
          ...outcome.sellerWallet,
          availableCents: outcome.sellerWallet.balanceCents - outcome.sellerWallet.heldCents,
          reason: 'SALE_CREDIT',
          lotId: outcome.lotId,
        });
      }
    }
  }
}
