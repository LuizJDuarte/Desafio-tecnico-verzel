import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request } from 'express';
import { AppConfig } from '../../config/app-config';
import type { AuthUser, JwtPayload } from './auth.types';

/** Extrai um cookie de um cabeçalho "Cookie" cru (usado no handshake do WebSocket). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Sessão via JWT em cookie httpOnly + SameSite=Lax:
 * - httpOnly: JavaScript da página não lê o token (mitiga roubo por XSS);
 * - SameSite=Lax: o navegador não envia o cookie em POSTs vindos de outros sites (mitiga CSRF);
 * - Secure em produção (HTTPS).
 * Também aceita "Authorization: Bearer <token>" para clientes de API e testes.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  issue(user: AuthUser): string {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return this.jwt.sign(payload);
  }

  verify(token: string | undefined): AuthUser | null {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      if (!payload?.sub || (payload.role !== 'BIDDER' && payload.role !== 'AUCTIONEER')) return null;
      return { id: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }

  fromRequest(request: Request): AuthUser | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return this.verify(header.slice('Bearer '.length).trim());
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return this.verify(cookies?.[this.config.auth.cookieName]);
  }

  fromCookieHeader(cookieHeader: string | undefined): AuthUser | null {
    return this.verify(readCookie(cookieHeader, this.config.auth.cookieName));
  }

  get cookieName(): string {
    return this.config.auth.cookieName;
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.auth.cookieSecure,
      path: '/',
      maxAge: this.config.auth.jwtExpiresInSeconds * 1000,
    };
  }
}
