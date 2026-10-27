import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorBody, BidRejectionCode, BidRejectionDetails, bidRejectionMessage } from '@arremate/shared';

/**
 * Erro de aplicação com código estável (para o front decidir o que mostrar) e mensagem em português.
 * Formato de resposta: { statusCode, code, message, details? }.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    const body: ApiErrorBody = { statusCode: status, code, message, ...(details ? { details } : {}) };
    super(body, status);
  }
}

/** Lance recusado por regra de negócio: 422, ou 403 quando o papel do usuário não permite lances. */
export class BidRejectedException extends AppException {
  constructor(
    readonly reason: BidRejectionCode,
    details: BidRejectionDetails = {},
  ) {
    super(
      reason === 'ROLE_NOT_ALLOWED' ? HttpStatus.FORBIDDEN : HttpStatus.UNPROCESSABLE_ENTITY,
      reason,
      bidRejectionMessage(reason, details),
      details as Record<string, unknown>,
    );
  }
}

export const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} não encontrado(a).`);
