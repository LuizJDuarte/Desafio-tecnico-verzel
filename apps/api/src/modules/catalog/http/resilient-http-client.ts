import { CircuitBreaker } from './circuit-breaker';
import { TokenBucket } from './token-bucket';

export type UpstreamErrorKind =
  'CIRCUIT_OPEN' | 'RATE_LIMITED' | 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'NOT_FOUND' | 'INVALID_RESPONSE' | 'TOO_LARGE';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: UpstreamErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ResilientHttpClientOptions {
  name: string;
  timeoutMs: number;
  /** Retentativas além da primeira chamada (apenas para erros transitórios: rede, timeout, 429, 5xx). */
  retries: number;
  baseBackoffMs: number;
  /** Se o limitador local exigir esperar mais que isso, falha rápido em vez de segurar o usuário. */
  maxWaitForTokenMs: number;
  headers: Record<string, string>;
  breaker: CircuitBreaker;
  bucket: TokenBucket;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Cliente HTTP para APIs de terceiros com: timeout (AbortController), retentativas com backoff
 * exponencial + jitter (respeitando Retry-After), limitador de taxa e circuit breaker.
 * Erros 4xx (exceto 429) não são repetidos: repetir não muda a resposta.
 */
export class ResilientHttpClient {
  private readonly fetchFn: FetchFn;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ResilientHttpClientOptions) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
  }

  get breaker(): CircuitBreaker {
    return this.options.breaker;
  }

  async getJson<T>(url: string): Promise<T> {
    return this.execute(url, async (response) => {
      try {
        return (await response.json()) as T;
      } catch {
        throw new UpstreamError(`${this.options.name}: resposta não é um JSON válido`, 'INVALID_RESPONSE');
      }
    });
  }

  async getBinary(url: string, maxBytes: number): Promise<{ data: Buffer; contentType: string }> {
    return this.execute(url, async (response) => {
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > maxBytes) {
        throw new UpstreamError(`${this.options.name}: arquivo maior que o permitido`, 'TOO_LARGE');
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > maxBytes) {
        throw new UpstreamError(`${this.options.name}: arquivo maior que o permitido`, 'TOO_LARGE');
      }
      return { data, contentType: response.headers.get('content-type') ?? 'application/octet-stream' };
    });
  }

  private async execute<T>(url: string, read: (response: Response) => Promise<T>): Promise<T> {
    const { name, retries, breaker, bucket } = this.options;
    if (!breaker.canRequest()) {
      throw new UpstreamError(`${name}: indisponível no momento (circuito aberto)`, 'CIRCUIT_OPEN');
    }

    let lastError: UpstreamError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const waitMs = bucket.msUntilNextToken();
      if (waitMs > this.options.maxWaitForTokenMs) {
        lastError = new UpstreamError(`${name}: limite local de requisições atingido`, 'RATE_LIMITED');
        break;
      }
      if (waitMs > 0) await this.sleep(waitMs);
      bucket.tryTake();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      let retryAfterMs: number | null = null;
      try {
        const response = await this.fetchFn(url, {
          headers: this.options.headers,
          signal: controller.signal,
          redirect: 'follow',
        });
        if (response.ok) {
          const result = await read(response);
          breaker.recordSuccess();
          return result;
        }
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 404) {
          // O serviço respondeu corretamente: "não existe" não é instabilidade.
          breaker.recordSuccess();
          throw new UpstreamError(`${name}: recurso não encontrado`, 'NOT_FOUND', 404);
        }
        lastError = new UpstreamError(`${name}: HTTP ${response.status}`, 'HTTP', response.status);
        if (response.status !== 429 && response.status < 500) break;
        retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      } catch (error) {
        if (error instanceof UpstreamError) {
          if (error.kind === 'NOT_FOUND' || error.kind === 'TOO_LARGE' || error.kind === 'INVALID_RESPONSE') {
            if (error.kind !== 'NOT_FOUND') breaker.recordFailure(error.message);
            throw error;
          }
          lastError = error;
        } else if (controller.signal.aborted) {
          lastError = new UpstreamError(`${name}: tempo limite de ${this.options.timeoutMs} ms excedido`, 'TIMEOUT');
        } else {
          lastError = new UpstreamError(`${name}: falha de rede (${(error as Error).message})`, 'NETWORK');
        }
      } finally {
        clearTimeout(timer);
      }

      if (attempt < retries) {
        const backoff = this.options.baseBackoffMs * 3 ** attempt + Math.random() * this.options.baseBackoffMs;
        await this.sleep(Math.min(retryAfterMs ?? backoff, 3000));
      }
    }

    const failure = lastError ?? new UpstreamError(`${name}: falha desconhecida`, 'NETWORK');
    breaker.recordFailure(failure.message);
    throw failure;
  }
}
