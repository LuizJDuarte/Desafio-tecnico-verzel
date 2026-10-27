import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@arremate/shared';
import { AppException } from './errors';

const DEFAULT_CODES: Partial<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/**
 * Padroniza TODAS as respostas de erro HTTP em { statusCode, code, message, details? }.
 * Erros inesperados viram 500 com mensagem genérica (o detalhe fica só no log do servidor).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception);
    if (body.statusCode >= 500 && exception instanceof AppException) {
      // Falha esperada e tratada (ex.: API externa fora do ar): registra sem stack trace.
      this.logger.warn(`${request.method} ${request.originalUrl} -> ${body.statusCode} ${body.code}`);
    } else if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AppException) {
      return exception.getResponse() as ApiErrorBody;
    }
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.',
      };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const rawMessage =
        typeof raw === 'string' ? raw : ((raw as { message?: string | string[] }).message ?? exception.message);
      const messages = Array.isArray(rawMessage) ? rawMessage : [rawMessage];
      return {
        statusCode,
        code: DEFAULT_CODES[statusCode] ?? `HTTP_${statusCode}`,
        message: statusCode === 404 && messages[0]?.startsWith('Cannot ') ? 'Recurso não encontrado.' : messages[0],
        ...(messages.length > 1 ? { details: { errors: messages } } : {}),
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno inesperado. Tente novamente em instantes.',
    };
  }
}
