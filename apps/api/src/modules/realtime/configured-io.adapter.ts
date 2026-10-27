import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO com CORS controlado pela mesma lista de origens da API. Em produção o front é servido
 * pela própria API (mesma origem), então nenhuma origem externa precisa ser liberada.
 */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: this.allowedOrigins.length > 0 ? { origin: this.allowedOrigins, credentials: true } : undefined,
      pingInterval: 20_000,
      pingTimeout: 20_000,
    });
  }
}
