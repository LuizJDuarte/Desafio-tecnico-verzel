import request from 'supertest';
import type { CatalogSearchResponse, HealthDto, LotPageDto } from '@arremate/shared';
import {
  createLot,
  createTestApp,
  deposit,
  MINUTE,
  placeBid,
  signUp,
  T0,
  TestContext,
  TestUser,
} from './support/test-app';

/**
 * "APIs têm limites e instabilidades": com a API externa fora do ar, vitrine, salas, auditoria e
 * comprovante continuam funcionando, e a busca do leiloeiro degrada com elegância.
 */
describe('Resiliência à queda da API externa', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let ana: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.freeze(T0);
    seller = await signUp(ctx, 'AUCTIONEER');
    ana = await signUp(ctx, 'BIDDER');
    await deposit(ana, 100_000);
  });

  it('com a API no ar, a busca responde ao vivo', async () => {
    const result = (await seller.agent.get('/api/catalog/search?q=monet').expect(200)).body as CatalogSearchResponse;
    expect(result.meta).toMatchObject({ origin: 'live', degraded: false });
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('com a API fora do ar, todo o fluxo de lotes existentes continua funcionando', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
    ctx.catalog.simulateOutage(true);

    await request(ctx.server).get('/api/lots?tab=live').expect(200);
    const page = (await request(ctx.server).get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    expect(page.lot.title).toBe('Water Lilies');
    expect(page.lot.attributes.length).toBeGreaterThan(0);
    await placeBid(ana, lot.id, 10_000).expect(201);

    ctx.clock.advance(10 * MINUTE);
    await ctx.settlement.settleDueLots();
    const after = (await ana.agent.get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    await request(ctx.server).get(`/api/receipts/${after.viewer.receiptCode}`).expect(200);
    const audit = await request(ctx.server).get(`/api/audit/lots/${lot.id}`).expect(200);
    expect(audit.body.report.verdict).toBe('INTACT');
  });

  it('busca já feita: devolve resultados salvos marcados como degradados', async () => {
    await seller.agent.get('/api/catalog/search?q=van gogh').expect(200);
    ctx.clock.advance(60 * MINUTE);
    ctx.catalog.simulateOutage(true);
    const result = (await seller.agent.get('/api/catalog/search?q=van gogh').expect(200)).body as CatalogSearchResponse;
    expect(result.meta).toMatchObject({ origin: 'stale-cache', degraded: true });
    expect(result.items.map((item) => item.title)).toContain('The Bedroom');
  });

  it('busca nunca feita: 503 com mensagem clara (sem derrubar o resto)', async () => {
    ctx.catalog.simulateOutage(true);
    const response = await seller.agent.get('/api/catalog/search?q=degas').expect(503);
    expect(response.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(response.body.message).toContain('Os lotes existentes continuam funcionando');
    const health = (await request(ctx.server).get('/api/health').expect(200)).body as HealthDto;
    expect(health).toMatchObject({ status: 'degraded', database: 'up' });
  });

  it('busca inédita com a API fora do ar procura nas obras já conhecidas pela casa', async () => {
    await seller.agent.get('/api/catalog/search?q=').expect(200);
    ctx.catalog.simulateOutage(true);
    const result = (await seller.agent.get('/api/catalog/search?q=monet').expect(200)).body as CatalogSearchResponse;
    expect(result.meta).toMatchObject({ origin: 'local-fallback', degraded: true });
    expect(result.items.map((item) => item.title)).toEqual(['Stacks of Wheat (End of Summer)', 'Water Lilies']);
    // Curingas do LIKE digitados pelo usuário são tratados como texto.
    await seller.agent.get('/api/catalog/search?q=%25').expect(503);
  });

  it('criar lote com a API fora do ar funciona usando o item salvo na busca', async () => {
    await seller.agent.get('/api/catalog/search?q=bedroom').expect(200);
    ctx.catalog.simulateOutage(true);
    const lot = await createLot(ctx, seller, { externalId: '28560' });
    expect(lot.title).toBe('The Bedroom');
  });
});
