import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@arremate/shared';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

export const AUTH_OPTIONS_KEY = 'arremate:auth';

export interface AuthOptions {
  required: boolean;
  roles: UserRole[];
}

/** Rota exige login; opcionalmente restrita a papéis (ex.: @Authenticated('AUCTIONEER')). */
export const Authenticated = (...roles: UserRole[]) =>
  SetMetadata(AUTH_OPTIONS_KEY, { required: true, roles } satisfies AuthOptions);

/** Rota pública que usa o usuário se ele estiver logado (ex.: sala do lote mostra "você está ganhando"). */
export const OptionalAuth = () => SetMetadata(AUTH_OPTIONS_KEY, { required: false, roles: [] } satisfies AuthOptions);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});
