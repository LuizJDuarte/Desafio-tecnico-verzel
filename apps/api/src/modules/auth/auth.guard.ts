import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors';
import { UserEntity } from '../../database/entities';
import { AUTH_OPTIONS_KEY, AuthOptions } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';
import { TokenService } from './token.service';

const ROLE_NAMES = { BIDDER: 'licitantes', AUCTIONEER: 'leiloeiros' } as const;

/**
 * Guard global (análogo a um filtro do Spring Security): lê o token, popula request.user e
 * aplica @Authenticated(...roles). Rotas sem decorator são públicas.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const options = this.reflector.getAllAndOverride<AuthOptions | undefined>(AUTH_OPTIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = this.tokens.fromRequest(request);
    request.user = user ?? undefined;

    if (!options?.required) return true;

    if (!user) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Faça login para continuar.');
    }
    // O token pode sobreviver a um reset do banco de demonstração: confirma que o usuário existe.
    const exists = await this.dataSource.getRepository(UserEntity).exists({ where: { id: user.id } });
    if (!exists) {
      request.user = undefined;
      throw new AppException(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
    }
    if (options.roles.length > 0 && !options.roles.includes(user.role)) {
      const allowed = options.roles.map((role) => ROLE_NAMES[role]).join(' ou ');
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN_ROLE', `Esta ação é exclusiva para ${allowed}.`);
    }
    return true;
  }
}
