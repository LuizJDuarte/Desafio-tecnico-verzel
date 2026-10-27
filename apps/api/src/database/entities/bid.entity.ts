import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintToNumber } from '../../common/bigint.transformer';

/**
 * Lance: registro append-only e encadeado (prev_hash -> hash) com assinatura Ed25519.
 * bidder_id é privado (nunca sai da API); publicamente o licitante é identificado por bidder_alias,
 * um pseudônimo por lote derivado com HMAC (não dá para descobrir quem é, nem cruzar lotes).
 */
@Entity('bids')
export class BidEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @Column({ type: 'integer' })
  seq: number;

  @Column({ name: 'bidder_id', type: 'uuid' })
  bidderId: string;

  @Column({ name: 'bidder_alias', type: 'varchar', length: 16 })
  bidderAlias: string;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintToNumber })
  amountCents: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'ends_at_after', type: 'timestamptz' })
  endsAtAfter: Date;

  @Column({ name: 'prev_hash', type: 'char', length: 64 })
  prevHash: string;

  @Column({ type: 'char', length: 64 })
  hash: string;

  @Column({ type: 'varchar', length: 128 })
  signature: string;

  @Column({ name: 'key_id', type: 'varchar', length: 32 })
  keyId: string;
}
