import { Injectable } from '@nestjs/common';
import {
  LotBidEvent,
  LotCancelledEvent,
  LotClosedEvent,
  LotSoldEvent,
  LotWonEvent,
  OutbidEvent,
  SocketEvents,
  WalletUpdatedEvent,
} from '@arremate/shared';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Fachada tipada para publicar eventos. Os serviços de domínio só publicam DEPOIS do commit da
 * transação: nenhum cliente recebe um lance que acabou sendo desfeito por rollback.
 * Falha de publicação nunca derruba a operação (o estado já está salvo; o cliente ressincroniza).
 */
@Injectable()
export class RealtimePublisher {
  constructor(private readonly gateway: RealtimeGateway) {}

  bidPlaced(event: LotBidEvent): void {
    this.safe(() => this.gateway.emitToLot(event.lotId, SocketEvents.LOT_BID, event));
  }

  lotClosed(event: LotClosedEvent): void {
    this.safe(() => this.gateway.emitToLot(event.lotId, SocketEvents.LOT_CLOSED, event));
  }

  lotCancelled(event: LotCancelledEvent): void {
    this.safe(() => this.gateway.emitToLot(event.lotId, SocketEvents.LOT_CANCELLED, event));
  }

  outbid(userId: string, event: OutbidEvent): void {
    this.safe(() => this.gateway.emitToUser(userId, SocketEvents.OUTBID, event));
  }

  walletUpdated(userId: string, event: WalletUpdatedEvent): void {
    this.safe(() => this.gateway.emitToUser(userId, SocketEvents.WALLET_UPDATED, event));
  }

  lotWon(userId: string, event: LotWonEvent): void {
    this.safe(() => this.gateway.emitToUser(userId, SocketEvents.LOT_WON, event));
  }

  lotSold(userId: string, event: LotSoldEvent): void {
    this.safe(() => this.gateway.emitToUser(userId, SocketEvents.LOT_SOLD, event));
  }

  private safe(emit: () => void): void {
    try {
      emit();
    } catch (error) {
      this.gateway.logEmitFailure(error);
    }
  }
}
