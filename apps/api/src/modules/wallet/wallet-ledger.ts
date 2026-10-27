import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { WalletTransactionType } from '@arremate/shared';
import { AppException } from '../../common/errors';
import { WalletEntity, WalletTransactionEntity } from '../../database/entities';

export interface LedgerLotRef {
  id: string;
  title: string;
}

/**
 * Toda movimentação de dinheiro passa por aqui, SEMPRE dentro de uma transação que já travou
 * (SELECT ... FOR UPDATE) as carteiras envolvidas. Cada operação atualiza o saldo e grava uma linha
 * no extrato com o saldo resultante, o que deixa o histórico da carteira explicável linha a linha.
 */
export class WalletLedger {
  constructor(
    private readonly manager: EntityManager,
    private readonly now: Date,
  ) {}

  /**
   * Trava as carteiras em ORDEM CRESCENTE de id. Ordem global de locks evita deadlock quando duas
   * transações precisam das mesmas carteiras em ordens diferentes (ex.: A supera B no lote 1 enquanto
   * B supera A no lote 2).
   */
  async lock(userIds: string[]): Promise<Map<string, WalletEntity>> {
    const ordered = [...new Set(userIds)].sort();
    const wallets = new Map<string, WalletEntity>();
    for (const userId of ordered) {
      const wallet = await this.manager.findOne(WalletEntity, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new AppException(500, 'WALLET_NOT_FOUND', 'Carteira não encontrada para o usuário.');
      }
      wallets.set(userId, wallet);
    }
    return wallets;
  }

  async deposit(wallet: WalletEntity, amountCents: number): Promise<void> {
    wallet.balanceCents += amountCents;
    await this.persist(wallet, 'DEPOSIT', amountCents, null, 'Depósito simulado');
  }

  /** Licitante passou a liderar: o valor do lance fica comprometido. */
  async hold(wallet: WalletEntity, amountCents: number, lot: LedgerLotRef): Promise<void> {
    wallet.heldCents += amountCents;
    await this.persist(wallet, 'HOLD', amountCents, lot, `Lance comprometido em "${lot.title}"`);
  }

  /** Licitante foi superado (ou o lote foi cancelado): o valor volta ao disponível na hora. */
  async release(wallet: WalletEntity, amountCents: number, lot: LedgerLotRef, reason: string): Promise<void> {
    wallet.heldCents -= amountCents;
    await this.persist(wallet, 'RELEASE', amountCents, lot, reason);
  }

  /** Liquidação: debita o arrematante (sai do total e do comprometido). */
  async capture(wallet: WalletEntity, amountCents: number, lot: LedgerLotRef): Promise<void> {
    wallet.heldCents -= amountCents;
    wallet.balanceCents -= amountCents;
    await this.persist(wallet, 'CAPTURE', amountCents, lot, `Arremate de "${lot.title}"`);
  }

  /** Liquidação: credita o leiloeiro. */
  async credit(wallet: WalletEntity, amountCents: number, lot: LedgerLotRef): Promise<void> {
    wallet.balanceCents += amountCents;
    await this.persist(wallet, 'SALE_CREDIT', amountCents, lot, `Venda de "${lot.title}"`);
  }

  private async persist(
    wallet: WalletEntity,
    type: WalletTransactionType,
    amountCents: number,
    lot: LedgerLotRef | null,
    description: string,
  ): Promise<void> {
    if (wallet.heldCents < 0 || wallet.balanceCents < 0 || wallet.heldCents > wallet.balanceCents) {
      // Nunca deveria acontecer (as regras de lance garantem); o CHECK do banco também barraria.
      throw new AppException(500, 'WALLET_INVARIANT_VIOLATED', 'Operação deixaria a carteira inconsistente.');
    }
    wallet.updatedAt = this.now;
    await this.manager.update(
      WalletEntity,
      { userId: wallet.userId },
      { balanceCents: wallet.balanceCents, heldCents: wallet.heldCents, updatedAt: this.now },
    );
    await this.manager.insert(WalletTransactionEntity, {
      id: randomUUID(),
      userId: wallet.userId,
      type,
      amountCents,
      balanceAfterCents: wallet.balanceCents,
      heldAfterCents: wallet.heldCents,
      lotId: lot?.id ?? null,
      description: description.slice(0, 300),
      createdAt: this.now,
    });
  }
}
