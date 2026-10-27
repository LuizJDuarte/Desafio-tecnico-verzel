import type { Request } from 'express';
import type { UserRole } from '@arremate/shared';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
}
