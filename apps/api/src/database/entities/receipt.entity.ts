import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintToNumber } from '../../common/bigint.transformer';

/** Comprovante de arremate, assinado e compartilhável por link (/comprovante/:code). */
@Entity('receipts')
export class ReceiptEntity {
  @PrimaryColumn('uuid')
  id: string;

  /** Código público e imprevisível usado no link de compartilhamento. */
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  /** Numeração sequencial amigável (Comprovante nº 000123). */
  @Column({ type: 'integer', unique: true })
  number: number;

  @Column({ name: 'lot_id', type: 'uuid', unique: true })
  lotId: string;

  @Column({ name: 'winner_id', type: 'uuid' })
  winnerId: string;

  @Column({ name: 'winner_alias', type: 'varchar', length: 16 })
  winnerAlias: string;

  @Column({ name: 'lot_title', type: 'varchar', length: 300 })
  lotTitle: string;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintToNumber })
  amountCents: number;

  @Column({ name: 'bid_count', type: 'integer' })
  bidCount: number;

  @Column({ name: 'head_hash', type: 'char', length: 64 })
  headHash: string;

  @Column({ name: 'closed_at', type: 'timestamptz' })
  closedAt: Date;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash: string;

  @Column({ type: 'varchar', length: 128 })
  signature: string;

  @Column({ name: 'key_id', type: 'varchar', length: 32 })
  keyId: string;
}
