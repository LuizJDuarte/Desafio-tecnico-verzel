import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { WalletTransactionType } from '@arremate/shared';
import { bigintToNumber } from '../../common/bigint.transformer';

/**
 * Extrato (ledger) da carteira: cada movimentação vira uma linha imutável com o saldo resultante.
 * DEPOSIT (depósito simulado), HOLD (valor comprometido ao liderar), RELEASE (liberado ao ser superado
 * ou por estorno), CAPTURE (débito do arremate) e SALE_CREDIT (crédito ao leiloeiro).
 */
@Entity('wallet_transactions')
export class WalletTransactionEntity {
  @PrimaryColumn('uuid')
  id: string;

  /** Ordem de inserção: desempata movimentações registradas no mesmo milissegundo. */
  @Column({ type: 'bigint', insert: false, update: false, transformer: bigintToNumber })
  seq: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['DEPOSIT', 'HOLD', 'RELEASE', 'CAPTURE', 'SALE_CREDIT'],
    enumName: 'wallet_transaction_type',
  })
  type: WalletTransactionType;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintToNumber })
  amountCents: number;

  @Column({ name: 'balance_after_cents', type: 'bigint', transformer: bigintToNumber })
  balanceAfterCents: number;

  @Column({ name: 'held_after_cents', type: 'bigint', transformer: bigintToNumber })
  heldAfterCents: number;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  @Column({ type: 'varchar', length: 300 })
  description: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
