import type { ApiErrorBody } from '@arremate/shared';
import { syncServerClock } from './server-clock';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Cliente HTTP da API (mesma origem: o cookie de sessão httpOnly vai automaticamente).
 * Erros sempre viram ApiError com o código e a mensagem em português vindos do servidor.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...init } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
    );
  }

  if (response.status === 204) return undefined as T;
  const body = parse(await response.text());

  if (!response.ok) {
    const error = body as Partial<ApiErrorBody> | null;
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? 'Algo deu errado no servidor. Tente novamente em instantes.',
      error?.details ?? {},
    );
  }

  if (body && typeof body === 'object' && 'serverTime' in body) {
    syncServerClock((body as { serverTime?: string }).serverTime);
  }
  return body as T;
}
