import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { CatalogItemDto, LotAttribute, LotState } from '@arremate/shared';
import { bigintToNumber } from '../../common/bigint.transformer';

/**
 * Lote. Guarda um SNAPSHOT completo do item da API externa (título, atributos, imagem), para que
 * vitrine, sala, auditoria e comprovante funcionem mesmo se a API do museu cair.
 */
@Entity('lots')
export class LotEntity {
  @PrimaryColumn('uuid')
  id: string;

  /** Número sequencial do lote, como nos catálogos de leilão ("Lote 7"). Gerado pelo banco. */
  @Column({ type: 'integer', insert: false, update: false })
  number: number;

  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId: string;

  @Column({ type: 'varchar', length: 20 })
  source: string;

  @Column({ name: 'external_id', type: 'varchar', length: 64 })
  externalId: string;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  artist: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  attributes: LotAttribute[];

  @Column({ name: 'item_snapshot', type: 'jsonb' })
  itemSnapshot: CatalogItemDto;

  @Column({ name: 'image_id', type: 'uuid', nullable: true })
  imageId: string | null;

  @Column({ name: 'image_remote_url', type: 'text', nullable: true })
  imageRemoteUrl: string | null;

  @Column({ name: 'image_lqip', type: 'text', nullable: true })
  imageLqip: string | null;

  @Column({ name: 'image_alt', type: 'text', nullable: true })
  imageAlt: string | null;

  @Column({ name: 'starting_price_cents', type: 'bigint', transformer: bigintToNumber })
  startingPriceCents: number;

  @Column({ name: 'min_increment_cents', type: 'bigint', transformer: bigintToNumber })
  minIncrementCents: number;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  /** Fim originalmente agendado (imutável, faz parte da gênese assinada). */
  @Column({ name: 'original_ends_at', type: 'timestamptz' })
  originalEndsAt: Date;

  /** Fim atual (pode ser estendido pela prorrogação anti-sniping). */
  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'anti_sniping_window_ms', type: 'integer' })
  antiSnipingWindowMs: number;

  @Column({ name: 'anti_sniping_extension_ms', type: 'integer' })
  antiSnipingExtensionMs: number;

  @Column({ type: 'enum', enum: ['OPEN', 'CANCELLED', 'SETTLED'], enumName: 'lot_state' })
  state: LotState;

  @Column({ name: 'bid_count', type: 'integer' })
  bidCount: number;

  @Column({ name: 'current_price_cents', type: 'bigint', nullable: true, transformer: bigintToNumber })
  currentPriceCents: number | null;

  @Column({ name: 'leader_id', type: 'uuid', nullable: true })
  leaderId: string | null;

  @Column({ name: 'last_bid_at', type: 'timestamptz', nullable: true })
  lastBidAt: Date | null;

  @Column({ name: 'genesis_hash', type: 'char', length: 64 })
  genesisHash: string;

  @Column({ name: 'genesis_signature', type: 'varchar', length: 128 })
  genesisSignature: string;

  @Column({ name: 'genesis_key_id', type: 'varchar', length: 32 })
  genesisKeyId: string;

  @Column({ name: 'head_hash', type: 'char', length: 64 })
  headHash: string;

  @Column({ name: 'head_signature', type: 'varchar', length: 128 })
  headSignature: string;

  @Column({ name: 'head_key_id', type: 'varchar', length: 32 })
  headKeyId: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 300, nullable: true })
  cancelReason: string | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  @Column({ name: 'winner_id', type: 'uuid', nullable: true })
  winnerId: string | null;

  @Column({ name: 'final_price_cents', type: 'bigint', nullable: true, transformer: bigintToNumber })
  finalPriceCents: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
