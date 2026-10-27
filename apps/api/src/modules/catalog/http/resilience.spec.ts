import { CircuitBreaker } from './circuit-breaker';
import { FetchFn, ResilientHttpClient, UpstreamError } from './resilient-http-client';
import { TokenBucket } from './token-bucket';

function makeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function makeClient(
  fetchFn: FetchFn,
  overrides: { retries?: number; breaker?: CircuitBreaker; bucket?: TokenBucket } = {},
) {
  const sleeps: number[] = [];
  const client = new ResilientHttpClient({
    name: 'API de teste',
    timeoutMs: 50,
    retries: overrides.retries ?? 2,
    baseBackoffMs: 10,
    maxWaitForTokenMs: 1000,
    headers: { Accept: 'application/json' },
    breaker: overrides.breaker ?? new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 }),
    bucket: overrides.bucket ?? new TokenBucket(100, 100),
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, sleeps };
}

describe('CircuitBreaker', () => {
  it('abre após N falhas consecutivas, bloqueia, e libera uma chamada de teste depois do tempo', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ failureThreshold: 2, openMs: 1000, now: clock.now });
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure('falha 1');
    expect(breaker.snapshot().state).toBe('CLOSED');
    breaker.recordFailure('falha 2');
    expect(breaker.snapshot().state).toBe('OPEN');
    expect(breaker.canRequest()).toBe(false);

    clock.advance(1000);
    expect(breaker.snapshot().state).toBe('HALF_OPEN');
    expect(breaker.canRequest()).toBe(true); // chamada de teste
    expect(breaker.canRequest()).toBe(false); // só uma por vez
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('volta a abrir se a chamada de teste falhar', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 500, now: clock.now });
    breaker.recordFailure('x');
    clock.advance(500);
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure('de novo');
    expect(breaker.snapshot().state).toBe('OPEN');
  });
});

describe('TokenBucket', () => {
  it('permite rajada até a capacidade e repõe com o tempo', () => {
    const clock = makeClock();
    const bucket = new TokenBucket(2, 1, clock.now);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
    expect(bucket.msUntilNextToken()).toBe(1000);
    clock.advance(1000);
    expect(bucket.tryTake()).toBe(true);
  });
});

describe('ResilientHttpClient', () => {
  it('retorna o JSON na primeira tentativa bem-sucedida', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchFn>>().mockResolvedValue(jsonResponse(200, { ok: 1 }));
    const { client } = makeClient(fetchFn);
    await expect(client.getJson('https://x.test/a')).resolves.toEqual({ ok: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('repete em 5xx e respeita Retry-After em 429', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchFn>>()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { client, sleeps } = makeClient(fetchFn);
    await expect(client.getJson('https://x.test/a')).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps[1]).toBe(2000);
  });

  it('não repete erros 4xx (ex.: 403 de firewall) e conta como falha', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 });
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchFn>>().mockResolvedValue(jsonResponse(403, {}));
    const { client } = makeClient(fetchFn, { breaker });
    await expect(client.getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'HTTP', status: 403 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(breaker.snapshot().consecutiveFailures).toBe(1);
  });

  it('trata 404 como resposta válida (não abre o circuito)', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 30_000 });
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchFn>>().mockResolvedValue(jsonResponse(404, {}));
    const { client } = makeClient(fetchFn, { breaker });
    await expect(client.getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('aplica timeout e, depois de falhas seguidas, abre o circuito e falha rápido', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, openMs: 30_000 });
    const hanging: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const fetchFn = jest.fn(hanging);
    const { client } = makeClient(fetchFn, { breaker, retries: 0 });

    await expect(client.getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await expect(client.getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'TIMEOUT' });
    expect(breaker.snapshot().state).toBe('OPEN');

    await expect(client.getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'CIRCUIT_OPEN' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('erro de rede vira UpstreamError NETWORK após as retentativas', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchFn>>().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = makeClient(fetchFn, { retries: 1 });
    const error = await client.getJson('https://x.test/a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).kind).toBe('NETWORK');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('recusa arquivos maiores que o limite', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchFn>>()
      .mockResolvedValue(new Response(new Uint8Array(10), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const { client } = makeClient(fetchFn);
    await expect(client.getBinary('https://x.test/img', 5)).rejects.toMatchObject({ kind: 'TOO_LARGE' });
  });
});
