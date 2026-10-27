import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WALLET_LIMITS, WalletDto, WalletTransactionDto, formatBRL } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { AppException } from '../../common/errors';
import { TransactionRunner } from '../../common/transaction-runner';
import { LotEntity, WalletEntity, WalletTransactionEntity } from '../../database/entities';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { WalletLedger } from './wallet-ledger';

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
    private readonly realtime: RealtimePublisher,
  ) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const wallet = await this.dataSource.getRepository(WalletEntity).findOneBy({ userId });
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, 'WALLET_NOT_FOUND', 'Carteira não encontrada.');
    }

    // Comprometido = lotes ainda não liquidados em que o usuário lidera.
    const holds = await this.dataSource
      .getRepository(LotEntity)
      .createQueryBuilder('l')
      .select(['l.id', 'l.title', 'l.currentPriceCents', 'l.endsAt'])
      .where('l.leaderId = :userId', { userId })
      .andWhere("l.state = 'OPEN'")
      .orderBy('l.endsAt', 'ASC')
      .getMany();

    const transactions = await this.dataSource
      .getRepository(WalletTransactionEntity)
      .createQueryBuilder('t')
      .leftJoin(LotEntity, 'l', 'l.id = t.lotId')
      .addSelect('l.title', 'lot_title')
      .where('t.userId = :userId', { userId })
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.seq', 'DESC')
      .limit(100)
      .getRawAndEntities();
    const lotTitles = new Map(
      (transactions.raw as Array<{ t_id: string; lot_title: string | null }>).map((row) => [row.t_id, row.lot_title]),
    );

    return {
      balanceCents: wallet.balanceCents,
      heldCents: wallet.heldCents,
      availableCents: wallet.availableCents,
      holds: holds.map((lot) => ({
        lotId: lot.id,
        lotTitle: lot.title,
        amountCents: lot.currentPriceCents ?? 0,
        endsAt: lot.endsAt.toISOString(),
      })),
      transactions: transactions.entities.map((entry): WalletTransactionDto => ({
        id: entry.id,
        type: entry.type,
        amountCents: entry.amountCents,
        balanceAfterCents: entry.balanceAfterCents,
        heldAfterCents: entry.heldAfterCents,
        lotId: entry.lotId,
        lotTitle: lotTitles.get(entry.id) ?? null,
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** Depósito simulado (não há meio de pagamento real no desafio). */
  async deposit(userId: string, amountCents: number, at?: Date): Promise<WalletDto> {
    if (!Number.isSafeInteger(amountCents) || amountCents < WALLET_LIMITS.minDepositCents) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_AMOUNT',
        `O depósito mínimo é de ${formatBRL(WALLET_LIMITS.minDepositCents)}.`,
      );
    }
    if (amountCents > WALLET_LIMITS.maxDepositCents) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_AMOUNT',
        `O depósito máximo por operação é de ${formatBRL(WALLET_LIMITS.maxDepositCents)}.`,
      );
    }
    const now = at ?? this.clock.now();
    const wallet = await this.tx.run(async (manager) => {
      const ledger = new WalletLedger(manager, now);
      const locked = (await ledger.lock([userId])).get(userId)!;
      await ledger.deposit(locked, amountCents);
      return locked;
    }, 'depósito');

    this.realtime.walletUpdated(userId, {
      balanceCents: wallet.balanceCents,
      heldCents: wallet.heldCents,
      availableCents: wallet.availableCents,
      reason: 'DEPOSIT',
      lotId: null,
    });
    return this.getWallet(userId);
  }
}
