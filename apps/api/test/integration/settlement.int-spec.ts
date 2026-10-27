import request from 'supertest';
import type { AuctioneerDashboardDto, LotPageDto, MyBidsResponse, ReceiptDto } from '@arremate/shared';
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
  wallet,
} from './support/test-app';

describe('Liquidação e comprovante', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.freeze(T0);
    seller = await signUp(ctx, 'AUCTIONEER', 'Galeria Teste');
    ana = await signUp(ctx, 'BIDDER', 'Ana Souza');
    bruno = await signUp(ctx, 'BIDDER', 'Bruno Lima');
    await deposit(ana, 500_000);
    await deposit(bruno, 500_000);
  });

  it('ao encerrar: debita o vencedor, credita o leiloeiro e emite comprovante', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
    await placeBid(ana, lot.id, 100_000).expect(201);
    await placeBid(bruno, lot.id, 150_000).expect(201);

    ctx.clock.advance(10 * MINUTE);
    expect(await ctx.settlement.settleDueLots()).toBe(1);

    expect(await wallet(bruno)).toMatchObject({ balanceCents: 350_000, heldCents: 0, availableCents: 350_000 });
    expect(await wallet(ana)).toMatchObject({ balanceCents: 500_000, heldCents: 0 });
    const sellerWallet = await wallet(seller);
    expect(sellerWallet.balanceCents).toBe(150_000);
    expect(sellerWallet.transactions[0]).toMatchObject({ type: 'SALE_CREDIT', amountCents: 150_000 });

    const page = (await bruno.agent.get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    expect(page.lot).toMatchObject({ phase: 'CLOSED', state: 'SETTLED', hasWinner: true, finalPriceCents: 150_000 });
    expect(page.viewer.receiptCode).toBeTruthy();

    const receipt = (await request(ctx.server).get(`/api/receipts/${page.viewer.receiptCode}`).expect(200))
      .body as ReceiptDto;
    expect(receipt).toMatchObject({ number: 1, amountCents: 150_000, bidCount: 2, viewerIsWinner: false });
    expect(receipt.winnerAlias).toBe(page.lot.leaderAlias);
    // Privacidade: o comprovante público não carrega nome, e-mail nem id do arrematante.
    const serialized = JSON.stringify(receipt);
    for (const secret of [bruno.user.id, bruno.user.email, 'Bruno']) expect(serialized).not.toContain(secret);

    const asWinner = (await bruno.agent.get(`/api/receipts/${page.viewer.receiptCode}`).expect(200)).body as ReceiptDto;
    expect(asWinner.viewerIsWinner).toBe(true);
  });

  it('lote sem lances fecha sem vencedor e sem comprovante', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString() });
    ctx.clock.advance(5 * MINUTE);
    await ctx.settlement.settleDueLots();
    const page = (await seller.agent.get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    expect(page.lot).toMatchObject({ state: 'SETTLED', hasWinner: false, finalPriceCents: null });
    const [{ count }] = await ctx.db.query(`SELECT COUNT(*)::int AS count FROM receipts`);
    expect(count).toBe(0);
  });

  it('é idempotente: liquidar de novo não cobra duas vezes', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString() });
    await placeBid(ana, lot.id, 20_000).expect(201);
    ctx.clock.advance(5 * MINUTE);
    await Promise.all([
      ctx.settlement.settleLot(lot.id),
      ctx.settlement.settleLot(lot.id),
      ctx.settlement.settleDueLots(),
    ]);
    await ctx.settlement.settleDueLots();
    expect((await wallet(ana)).balanceCents).toBe(480_000);
    expect((await wallet(seller)).balanceCents).toBe(20_000);
  });

  it('não liquida antes do prazo prorrogado', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
    ctx.clock.advance(10 * MINUTE - 30_000);
    await placeBid(ana, lot.id, 20_000).expect(201); // prorroga para +2 min a partir daqui
    ctx.clock.advance(60_000); // passou do fim original
    expect(await ctx.settlement.settleDueLots()).toBe(0);
    ctx.clock.advance(60_000);
    expect(await ctx.settlement.settleDueLots()).toBe(1);
  });

  it('liquidação sob demanda: abrir a sala depois do prazo já encerra o lote', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString() });
    await placeBid(ana, lot.id, 20_000).expect(201);
    ctx.clock.advance(6 * MINUTE);
    const page = (await request(ctx.server).get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    expect(page.lot.state).toBe('SETTLED');
  });

  it('painel do leiloeiro mostra resultado de cada lote e total recebido', async () => {
    const sold = await createLot(ctx, seller, {
      externalId: '16568',
      endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString(),
    });
    const unsold = await createLot(ctx, seller, {
      externalId: '28560',
      endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString(),
    });
    const live = await createLot(ctx, seller, {
      externalId: '24645',
      endsAt: new Date(T0.getTime() + 60 * MINUTE).toISOString(),
    });
    await placeBid(ana, sold.id, 30_000).expect(201);
    await placeBid(bruno, live.id, 15_000).expect(201);
    ctx.clock.advance(5 * MINUTE);
    await ctx.settlement.settleDueLots();

    const dashboard = (await seller.agent.get('/api/auctioneer/dashboard').expect(200)).body as AuctioneerDashboardDto;
    const byId = new Map(dashboard.lots.map((lot) => [lot.id, lot]));
    expect(byId.get(sold.id)).toMatchObject({ result: 'SOLD', finalPriceCents: 30_000, canCancel: false });
    expect(byId.get(sold.id)?.winnerAlias).toMatch(/^[0-9A-F]{6}$/);
    expect(byId.get(unsold.id)).toMatchObject({ result: 'UNSOLD', winnerAlias: null });
    expect(byId.get(live.id)).toMatchObject({ result: 'LIVE', canCancel: true, cancelRefundsLeader: true });
    expect(dashboard.summary).toMatchObject({ totalReceivedCents: 30_000, soldCount: 1, unsoldCount: 1, liveCount: 1 });
  });

  it('meus arremates: lotes com lance, situação e comprovante', async () => {
    const won = await createLot(ctx, seller, {
      externalId: '16568',
      endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString(),
    });
    const lost = await createLot(ctx, seller, {
      externalId: '28560',
      endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString(),
    });
    const leading = await createLot(ctx, seller, { externalId: '24645' });
    const outbid = await createLot(ctx, seller, { externalId: '14655' });
    await placeBid(ana, won.id, 10_000).expect(201);
    await placeBid(ana, lost.id, 10_000).expect(201);
    await placeBid(bruno, lost.id, 11_000).expect(201);
    await placeBid(ana, leading.id, 10_000).expect(201);
    await placeBid(ana, outbid.id, 10_000).expect(201);
    await placeBid(bruno, outbid.id, 11_000).expect(201);
    ctx.clock.advance(5 * MINUTE);
    await ctx.settlement.settleDueLots();

    const mine = (await ana.agent.get('/api/me/bids').expect(200)).body as MyBidsResponse;
    const status = Object.fromEntries(mine.items.map((item) => [item.lot.id, item.status]));
    expect(status).toEqual({ [won.id]: 'WON', [lost.id]: 'LOST', [leading.id]: 'LEADING', [outbid.id]: 'OUTBID' });
    expect(mine.items.find((item) => item.lot.id === won.id)?.receiptCode).toBeTruthy();
    expect(mine.items.find((item) => item.lot.id === lost.id)?.receiptCode).toBeNull();
  });
});

describe('Cancelamento', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.freeze(T0);
    seller = await signUp(ctx, 'AUCTIONEER');
    ana = await signUp(ctx, 'BIDDER');
    bruno = await signUp(ctx, 'BIDDER');
    await deposit(ana, 100_000);
    await deposit(bruno, 100_000);
  });

  it('cancela lote sem lances (requisito base)', async () => {
    const lot = await createLot(ctx, seller);
    const response = await seller.agent
      .post(`/api/lots/${lot.id}/cancel`)
      .send({ reason: 'Erro no cadastro' })
      .expect(200);
    expect(response.body).toMatchObject({ state: 'CANCELLED', phase: 'CANCELLED', cancelReason: 'Erro no cadastro' });
  });

  it('cancela lote com lances e estorna automaticamente o valor comprometido do líder (opcional)', async () => {
    const lot = await createLot(ctx, seller);
    await placeBid(ana, lot.id, 20_000).expect(201);
    await placeBid(bruno, lot.id, 30_000).expect(201);
    expect((await wallet(bruno)).heldCents).toBe(30_000);

    await seller.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(200);
    const brunoWallet = await wallet(bruno);
    expect(brunoWallet).toMatchObject({ balanceCents: 100_000, heldCents: 0, availableCents: 100_000 });
    expect(brunoWallet.transactions[0]).toMatchObject({ type: 'RELEASE', amountCents: 30_000 });
    expect(brunoWallet.transactions[0].description).toContain('Estorno automático');
    expect((await wallet(ana)).availableCents).toBe(100_000);
  });

  it('só o dono cancela; lote encerrado não pode ser cancelado', async () => {
    const other = await signUp(ctx, 'AUCTIONEER');
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString() });
    expect((await other.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(403)).body.code).toBe('NOT_LOT_OWNER');
    await ana.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(403);
    ctx.clock.advance(5 * MINUTE);
    expect((await seller.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(409)).body.code).toBe(
      'LOT_ALREADY_CLOSED',
    );
  });
});
