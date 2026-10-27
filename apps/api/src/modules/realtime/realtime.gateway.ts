import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SocketEvents, SubscribeAck } from '@arremate/shared';
import { TokenService } from '../auth/token.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tempo real com Socket.IO.
 * - Sala pública "lot:<id>": qualquer espectador (mesmo sem login) acompanha lances, prorrogações e encerramento.
 * - Sala privada "user:<id>": avisos pessoais ("você foi superado", carteira atualizada, "você arrematou").
 * A autenticação do socket reaproveita o mesmo cookie httpOnly da API.
 */
@WebSocketGateway({ serveClient: false })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly tokens: TokenService) {}

  handleConnection(client: Socket): void {
    const user = this.tokens.fromCookieHeader(client.handshake.headers.cookie);
    if (user) {
      client.data.userId = user.id;
      void client.join(`user:${user.id}`);
    }
  }

  @SubscribeMessage(SocketEvents.LOT_SUBSCRIBE)
  subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { lotId?: unknown }): SubscribeAck {
    const lotId = typeof body?.lotId === 'string' ? body.lotId : '';
    if (!UUID_PATTERN.test(lotId)) {
      return { ok: false, serverTime: new Date().toISOString(), error: 'Identificador de lote inválido.' };
    }
    void client.join(`lot:${lotId}`);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  @SubscribeMessage(SocketEvents.LOT_UNSUBSCRIBE)
  unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { lotId?: unknown }): SubscribeAck {
    if (typeof body?.lotId === 'string') void client.leave(`lot:${body.lotId}`);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  emitToLot(lotId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`lot:${lotId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  logEmitFailure(error: unknown): void {
    this.logger.warn(`Falha ao emitir evento em tempo real: ${String(error)}`);
  }
}
