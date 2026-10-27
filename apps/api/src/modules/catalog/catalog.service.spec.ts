import { Clock } from '../../common/clock';
import { AppException } from '../../common/errors';
import { loadConfig } from '../../config/app-config';
import { ApiCacheService, CachedValue } from './api-cache.service';
import { CatalogService } from './catalog.service';
import { FakeCatalogProvider } from './providers/fake-catalog.provider';

class InMemoryCache {
  readonly store = new Map<string, CachedValue<unknown>>();
  async get<T>(key: string): Promise<CachedValue<T> | null> {
    return (this.store.get(key) as CachedValue<T>) ?? null;
  }
  async set(key: string, payload: unknown, fetchedAt: Date): Promise<void> {
    this.store.set(key, { payload, fetchedAt });
  }
  async searchItems<T>(prefix: string, query: string, page: number, pageSize: number) {
    const needle = query.toLowerCase();
    const matches = [...this.store.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value.payload as { title: string; artist: string | null })
      .filter((item) => !needle || `${item.title} ${item.artist ?? ''}`.toLowerCase().includes(needle));
    return { items: matches.slice((page - 1) * pageSize, page * pageSize) as T[], total: matches.length };
  }
}

function setup() {
  const clock = new Clock(loadConfig({ NODE_ENV: 'test' }));
  clock.freeze(new Date('2026-10-27T12:00:00Z'));
  const provider = new FakeCatalogProvider();
  const cache = new InMemoryCache();
  const service = new CatalogService(provider, cache as unknown as ApiCacheService, clock);
  return { clock, provider, cache, service };
}

describe('CatalogService (stale-if-error)', () => {
  it('consulta a API e grava no cache (busca e itens individuais)', async () => {
    const { service, cache } = setup();
    const result = await service.search('monet', 1);
    expect(result.meta.origin).toBe('live');
    expect(result.items.map((item) => item.title)).toEqual(['Water Lilies', 'Stacks of Wheat (End of Summer)']);
    expect(cache.store.has('artic:item:v1:16568')).toBe(true);
  });

  it('usa o cache fresco sem chamar a API', async () => {
    const { service, provider } = setup();
    await service.search('monet', 1);
    const calls = provider.callCount;
    const again = await service.search('  MONET ', 1);
    expect(again.meta.origin).toBe('cache');
    expect(provider.callCount).toBe(calls);
  });

  it('com a API fora do ar, devolve o último resultado salvo marcado como degradado', async () => {
    const { service, provider, clock } = setup();
    await service.search('monet', 1);
    clock.advance(60 * 60_000); // cache vence
    provider.simulateOutage(true);
    const result = await service.search('monet', 1);
    expect(result.meta.origin).toBe('stale-cache');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.message).toContain('instável');
    expect(result.items).toHaveLength(2);
  });

  it('sem cache e com a API fora do ar, responde 503 com mensagem clara', async () => {
    const { service, provider } = setup();
    provider.simulateOutage(true);
    const error = await service.search('degas', 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('CATALOG_UNAVAILABLE');
    expect((error as AppException).getStatus()).toBe(503);
  });

  it('busca inédita com a API fora do ar procura nas obras que a casa já conhece', async () => {
    const { service, provider } = setup();
    await service.search('', 1); // grava cada obra individualmente no cache
    provider.simulateOutage(true);
    const result = await service.search('van gogh', 1);
    expect(result.meta).toMatchObject({ origin: 'local-fallback', degraded: true });
    expect(result.meta.message).toContain('fora do ar');
    expect(result.items.map((item) => item.title)).toContain('The Bedroom');
  });

  it('detalhe do item usa o cache gravado pela busca quando a API cai', async () => {
    const { service, provider, clock } = setup();
    await service.search('bedroom', 1);
    clock.advance(48 * 60 * 60_000);
    provider.simulateOutage(true);
    await expect(service.getItem('28560')).resolves.toMatchObject({ title: 'The Bedroom' });
  });

  it('item inexistente responde 404', async () => {
    const { service } = setup();
    const error = await service.getItem('123456').catch((e: unknown) => e);
    expect((error as AppException).code).toBe('CATALOG_ITEM_NOT_FOUND');
  });
});
