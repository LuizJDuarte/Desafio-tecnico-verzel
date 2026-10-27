import type { BidDto } from './api-types';

/**
 * Eventos Socket.IO. Salas: "lot:<id>" (público, qualquer espectador) e "user:<id>" (privado).
 * Payloads públicos nunca carregam ids de usuário: só pseudônimos.
 */
export const SocketEvents = {
  LOT_SUBSCRIBE: 'lot:subscribe',
  LOT_UNSUBSCRIBE: 'lot:unsubscribe',
  LOT_BID: 'lot:bid',
  LOT_CLOSED: 'lot:closed',
  LOT_CANCELLED: 'lot:cancelled',
  WALLET_UPDATED: 'wallet:updated',
  OUTBID: 'bid:outbid',
  LOT_WON: 'lot:won',
  LOT_SOLD: 'lot:sold',
} as const;

export interface LotBidEvent {
  lotId: string;
  bid: BidDto;
  currentPriceCents: number;
  minNextBidCents: number;
  bidCount: number;
  endsAt: string;
  extended: boolean;
  leaderAlias: string;
  serverTime: string;
}

export interface LotClosedEvent {
  lotId: string;
  hasWinner: boolean;
  winnerAlias: string | null;
  finalPriceCents: number | null;
  settledAt: string;
  serverTime: string;
}

export interface LotCancelledEvent {
  lotId: string;
  refundedLeader: boolean;
  serverTime: string;
}

export interface WalletUpdatedEvent {
  balanceCents: number;
  heldCents: number;
  availableCents: number;
  reason: 'DEPOSIT' | 'HOLD' | 'RELEASE' | 'CAPTURE' | 'SALE_CREDIT';
  lotId: string | null;
}

export interface OutbidEvent {
  lotId: string;
  lotTitle: string;
  currentPriceCents: number;
  minNextBidCents: number;
  releasedCents: number;
}

export interface LotWonEvent {
  lotId: string;
  lotTitle: string;
  amountCents: number;
  receiptCode: string;
}

export interface LotSoldEvent {
  lotId: string;
  lotTitle: string;
  amountCents: number;
}

export interface SubscribeAck {
  ok: boolean;
  serverTime: string;
  error?: string;
}
