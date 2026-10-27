import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintToNumber } from '../../common/bigint.transformer';

/**
 * Carteira do usuário.
 * - balance_cents: saldo total.
 * - held_cents: saldo comprometido (soma dos lotes em que o licitante está liderando).
 * - disponível = balance - held (calculado, nunca armazenado, para não haver duas fontes da verdade).
 * O banco garante held <= balance e ambos >= 0 (CHECK), mesmo que um bug passe pela aplicação.
 */
@Entity('wallets')
export class WalletEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'balance_cents', type: 'bigint', transformer: bigintToNumber })
  balanceCents: number;

  @Column({ name: 'held_cents', type: 'bigint', transformer: bigintToNumber })
  heldCents: number;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  get availableCents(): number {
    return this.balanceCents - this.heldCents;
  }
}
