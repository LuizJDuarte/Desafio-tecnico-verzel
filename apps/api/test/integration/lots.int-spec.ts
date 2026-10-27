import request from 'supertest';
import type { ShowcaseResponse } from '@arremate/shared';
import { createLot, createTestApp, MINUTE, signUp, T0, TestContext, TestUser } from './support/test-app';

describe('Lotes: criação, vitrine e painel', () => {
  let ctx: TestContext;
  let seller: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.freeze(T0);
    seller = await signUp(ctx, 'AUCTIONEER', 'Galeria Teste');
  });

  it('cria o lote a partir do item do catálogo, guardando snapshot e atributos', async () => {
    const lot = await createLot(ctx, seller, { externalId: '28560', description: 'Descrição do leiloeiro' });
    expect(lot).toMatchObject({
      title: 'The Bedroom',
      artist: 'Vincent van Gogh',
      phase: 'LIVE',
      state: 'OPEN',
      startingPriceCents: 10_000,
      minNextBidCents: 10_000,
      description: 'Descrição do leiloeiro',
      seller: { name: 'Galeria Teste' },
      source: { provider: 'artic', externalId: '28560', url: 'https://www.artic.edu/artworks/28560' },
      antiSniping: { windowSeconds: 120, extensionSeconds: 120 },
    });
    expect(lot.attributes).toEqual(expect.arrayContaining([{ label: 'Técnica', value: 'Oil on canvas' }]));
    expect(lot.startsAt).toBe(T0.toISOString());
  });

  it('valida agenda, valores e item', async () => {
    const past = await seller.agent
      .post('/api/lots')
      .send({
        externalId: '16568',
        startingPriceCents: 10_000,
        minIncrementCents: 1_000,
        startsAt: new Date(T0.getTime() - 10 * MINUTE).toISOString(),
        endsAt: new Date(T0.getTime() + 60 * MINUTE).toISOString(),
      })
      .expect(400);
    expect(past.body.message).toBe('A data de início não pode estar no passado.');

    const short = await seller.agent
      .post('/api/lots')
      .send({
        externalId: '16568',
        startingPriceCents: 10_000,
        minIncrementCents: 1_000,
        startNow: true,
        endsAt: new Date(T0.getTime() + 30_000).toISOString(),
      })
      .expect(400);
    expect(short.body.message).toContain('pelo menos 1 minuto');

    const cheap = await seller.agent
      .post('/api/lots')
      .send({
        externalId: '16568',
        startingPriceCents: 50,
        minIncrementCents: 1_000,
        startNow: true,
        endsAt: new Date(T0.getTime() + 60 * MINUTE).toISOString(),
      })
      .expect(400);
    expect(cheap.body.message).toBe('O lance inicial mínimo é R$ 1,00.');

    const missing = await seller.agent
      .post('/api/lots')
      .send({
        externalId: '123456',
        startingPriceCents: 10_000,
        minIncrementCents: 1_000,
        startNow: true,
        endsAt: new Date(T0.getTime() + 60 * MINUTE).toISOString(),
      })
      .expect(404);
    expect(missing.body.code).toBe('CATALOG_ITEM_NOT_FOUND');
  });

  it('vitrine separa ao vivo, agendados e encerrados; cancelados não aparecem', async () => {
    const live = await createLot(ctx, seller, { externalId: '16568' });
    const scheduled = await createLot(ctx, seller, {
      externalId: '28560',
      startNow: false,
      startsAt: new Date(T0.getTime() + 60 * MINUTE).toISOString(),
      endsAt: new Date(T0.getTime() + 120 * MINUTE).toISOString(),
    });
    const ending = await createLot(ctx, seller, {
      externalId: '24645',
      endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString(),
    });
    const cancelled = await createLot(ctx, seller, { externalId: '14655' });
    await seller.agent.post(`/api/lots/${cancelled.id}/cancel`).send({}).expect(200);

    ctx.clock.advance(10 * MINUTE); // "ending" passa do prazo (encerrado, mesmo antes da liquidação)

    const tab = async (name: string) =>
      (await request(ctx.server).get(`/api/lots?tab=${name}`).expect(200)).body as ShowcaseResponse;
    const liveTab = await tab('live');
    const scheduledTab = await tab('scheduled');
    const closedTab = await tab('closed');

    expect(liveTab.items.map((lot) => lot.id)).toEqual([live.id]);
    expect(scheduledTab.items.map((lot) => lot.id)).toEqual([scheduled.id]);
    expect(closedTab.items.map((lot) => lot.id)).toEqual([ending.id]);
    expect(closedTab.items[0].phase).toBe('CLOSED');
    expect(liveTab.counts).toEqual({ live: 1, scheduled: 1, closed: 1 });
    const all = [...liveTab.items, ...scheduledTab.items, ...closedTab.items].map((lot) => lot.id);
    expect(all).not.toContain(cancelled.id);
  });

  it('busca por título ou artista e ordena por preço', async () => {
    await createLot(ctx, seller, { externalId: '16568', startingPriceCents: 50_000 }); // Monet
    await createLot(ctx, seller, { externalId: '64818', startingPriceCents: 20_000 }); // Monet
    await createLot(ctx, seller, { externalId: '28560', startingPriceCents: 90_000 }); // Van Gogh

    const monet = (await request(ctx.server).get('/api/lots?tab=live&q=monet&sort=price_asc').expect(200))
      .body as ShowcaseResponse;
    expect(monet.items.map((lot) => lot.startingPriceCents)).toEqual([20_000, 50_000]);
    expect(monet.counts.live).toBe(2);

    const bedroom = (await request(ctx.server).get('/api/lots?tab=live&q=BEDROOM').expect(200))
      .body as ShowcaseResponse;
    expect(bedroom.items.map((lot) => lot.title)).toEqual(['The Bedroom']);

    const noMatch = (await request(ctx.server).get('/api/lots?tab=live&q=%25').expect(200)).body as ShowcaseResponse;
    expect(noMatch.items).toEqual([]);
  });

  it('sala do lote é pública e informa que o visitante não está logado', async () => {
    const lot = await createLot(ctx, seller);
    const page = await request(ctx.server).get(`/api/lots/${lot.id}`).expect(200);
    expect(page.body.lot.id).toBe(lot.id);
    expect(page.body.viewer).toMatchObject({ authenticated: false, isLeader: false, totalBidders: 0 });
    await request(ctx.server).get('/api/lots/00000000-0000-4000-8000-000000000000').expect(404);
    await request(ctx.server).get('/api/lots/nao-e-uuid').expect(400);
  });
});
