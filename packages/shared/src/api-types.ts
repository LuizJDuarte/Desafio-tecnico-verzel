import type { AuditBundle, AuditReport } from './audit';
import type { LotPhase, LotState } from './lot-rules';

/** Contratos HTTP entre API e front-end (datas sempre em ISO 8601 UTC, dinheiro em centavos). */

export type UserRole = 'BIDDER' | 'AUCTIONEER';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ Carteira */

export type WalletTransactionType = 'DEPOSIT' | 'HOLD' | 'RELEASE' | 'CAPTURE' | 'SALE_CREDIT';

export interface WalletTransactionDto {
  id: string;
  type: WalletTransactionType;
  amountCents: number;
  balanceAfterCents: number;
  heldAfterCents: number;
  lotId: string | null;
  lotTitle: string | null;
  description: string;
  createdAt: string;
}

export interface WalletHoldDto {
  lotId: string;
  lotTitle: string;
  amountCents: number;
  endsAt: string;
}

export interface WalletDto {
  balanceCents: number;
  heldCents: number;
  availableCents: number;
  holds: WalletHoldDto[];
  transactions: WalletTransactionDto[];
}

/* ------------------------------------------------------------------ Catálogo (API externa) */

export interface LotAttribute {
  label: string;
  value: string;
}

export interface CatalogItemDto {
  source: 'artic';
  externalId: string;
  title: string;
  artist: string | null;
  date: string | null;
  medium: string | null;
  dimensions: string | null;
  origin: string | null;
  creditLine: string | null;
  type: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  lqip: string | null;
  altText: string | null;
  isPublicDomain: boolean;
  sourceUrl: string;
  attributes: LotAttribute[];
}

/**
 * live: resposta da API agora | cache: busca recente salva | stale-cache: API fora do ar, busca salva vencida |
 * local-fallback: API fora do ar e busca inédita, procurando nas obras que a casa já conhece.
 */
export type CatalogOrigin = 'live' | 'cache' | 'stale-cache' | 'local-fallback';

export interface CatalogSearchResponse {
  items: CatalogItemDto[];
  page: number;
  totalPages: number;
  total: number;
  meta: {
    origin: CatalogOrigin;
    degraded: boolean;
    message: string | null;
    fetchedAt: string;
  };
}

export interface CatalogStatusDto {
  provider: string;
  circuit: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  openUntil: string | null;
}

/* ------------------------------------------------------------------ Lotes */

export interface LotImageDto {
  url: string | null;
  lqip: string | null;
  alt: string | null;
  /** true quando a imagem foi copiada para o nosso banco (não depende mais da API externa). */
  stored: boolean;
}

export interface LotSummaryDto {
  id: string;
  /** Número do lote no catálogo da casa ("Lote 7"). */
  number: number;
  title: string;
  artist: string | null;
  image: LotImageDto;
  phase: LotPhase;
  startsAt: string;
  endsAt: string;
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number | null;
  minNextBidCents: number;
  bidCount: number;
  leaderAlias: string | null;
  finalPriceCents: number | null;
  hasWinner: boolean;
  extended: boolean;
}

export interface LotDetailDto extends LotSummaryDto {
  state: LotState;
  description: string | null;
  attributes: LotAttribute[];
  source: {
    provider: 'artic';
    providerName: string;
    externalId: string;
    url: string;
  };
  seller: { name: string };
  originalEndsAt: string;
  antiSniping: { windowSeconds: number; extensionSeconds: number };
  cancelledAt: string | null;
  cancelReason: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface LotViewerDto {
  authenticated: boolean;
  role: UserRole | null;
  isSeller: boolean;
  alias: string | null;
  isLeader: boolean;
  hasBid: boolean;
  myMaxBidCents: number | null;
  position: number | null;
  totalBidders: number;
  availableCents: number | null;
  receiptCode: string | null;
}

export interface LotPageDto {
  lot: LotDetailDto;
  viewer: LotViewerDto;
  serverTime: string;
}

export interface BidDto {
  seq: number;
  bidderAlias: string;
  amountCents: number;
  createdAt: string;
  endsAtAfter: string;
  extended: boolean;
  hash: string;
}

export interface PlaceBidResponse {
  bid: BidDto;
  lot: LotDetailDto;
  viewer: LotViewerDto;
  serverTime: string;
}

export type ShowcaseTab = 'live' | 'scheduled' | 'closed';
export type ShowcaseSort = 'relevance' | 'ending' | 'newest' | 'price_asc' | 'price_desc';

export interface ShowcaseResponse extends Paginated<LotSummaryDto> {
  counts: Record<ShowcaseTab, number>;
  serverTime: string;
}

export interface CreateLotRequest {
  externalId: string;
  title?: string;
  description?: string;
  startingPriceCents: number;
  minIncrementCents: number;
  startNow?: boolean;
  startsAt?: string;
  endsAt: string;
}

export type AuctioneerLotResult = 'SCHEDULED' | 'LIVE' | 'AWAITING_SETTLEMENT' | 'SOLD' | 'UNSOLD' | 'CANCELLED';

export interface AuctioneerLotDto extends LotSummaryDto {
  state: LotState;
  result: AuctioneerLotResult;
  winnerAlias: string | null;
  canCancel: boolean;
  cancelRefundsLeader: boolean;
  receiptCode: string | null;
}

export interface AuctioneerDashboardDto {
  lots: AuctioneerLotDto[];
  summary: {
    totalReceivedCents: number;
    soldCount: number;
    unsoldCount: number;
    liveCount: number;
    scheduledCount: number;
    cancelledCount: number;
  };
  serverTime: string;
}

/* ------------------------------------------------------------------ Meus arremates */

export type MyBidStatus = 'LEADING' | 'OUTBID' | 'WON' | 'LOST' | 'CANCELLED' | 'SCHEDULED';

export interface MyBidDto {
  lot: LotSummaryDto;
  myAlias: string;
  myMaxBidCents: number;
  myBidCount: number;
  lastBidAt: string;
  status: MyBidStatus;
  receiptCode: string | null;
}

export interface MyBidsResponse {
  items: MyBidDto[];
  serverTime: string;
}

/* ------------------------------------------------------------------ Auditoria e comprovante */

export interface PublicKeyDto {
  algorithm: 'Ed25519';
  keyId: string;
  /** Chave pública crua (32 bytes) em base64url. */
  publicKey: string;
  publicKeyPem: string;
}

export interface AuditLotInfoDto {
  id: string;
  number: number;
  title: string;
  artist: string | null;
  image: LotImageDto;
  phase: LotPhase;
}

export interface AuditResponse {
  lot: AuditLotInfoDto;
  bundle: AuditBundle;
  /** Relatório do servidor (inclui verificações que exigem dados privados, como o vínculo dos pseudônimos). */
  report: AuditReport;
  publicKey: PublicKeyDto;
  verifiedAt: string;
}

export interface ReceiptDto {
  code: string;
  number: number;
  lot: AuditLotInfoDto & { source: LotDetailDto['source']; attributes: LotAttribute[] };
  sellerName: string;
  winnerAlias: string;
  amountCents: number;
  bidCount: number;
  headHash: string;
  closedAt: string;
  issuedAt: string;
  payloadHash: string;
  signature: string;
  keyId: string;
  /** O visitante autenticado é o arrematante? (permite exibir "este comprovante é seu"). */
  viewerIsWinner: boolean;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  time: string;
  database: 'up' | 'down';
  catalog: CatalogStatusDto;
  version: string;
}
