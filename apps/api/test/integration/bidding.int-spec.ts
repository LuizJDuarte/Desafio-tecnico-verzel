import request from 'supertest';
import type { LotPageDto } from '@arremate/shared';
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

describe('Regras de lance', () => {
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
    ana = await signUp(ctx, 'BIDDER', 'Ana');
    bruno = await signUp(ctx, 'BIDDER', 'Bruno');
    await deposit(ana, 1_000_000);
    await deposit(bruno, 1_000_000);
  });

  describe('só aceita lances em lotes ao vivo', () => {
    it('lote ainda não iniciado', async () => {
      const lot = await createLot(ctx, seller, {
        startNow: false,
        startsAt: new Date(T0.getTime() + 30 * MINUTE).toISOString(),
        endsAt: new Date(T0.getTime() + 90 * MINUTE).toISOString(),
      });
      const response = await placeBid(ana, lot.id, 10_000).expect(422);
      expect(response.body).toMatchObject({ code: 'LOT_NOT_STARTED', details: { startsAt: lot.startsAt } });
      expect(response.body.message).toContain('ainda não começou');
    });

    it('lote encerrado (inclusive exatamente no horário de término)', async () => {
      const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
      ctx.clock.advance(10 * MINUTE);
      const response = await placeBid(ana, lot.id, 10_000).expect(422);
      expect(response.body.code).toBe('LOT_CLOSED');
      expect(response.body.message).toBe('Este lote já foi encerrado e não aceita mais lances.');
    });

    it('lote cancelado', async () => {
      const lot = await createLot(ctx, seller);
      await seller.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(200);
      expect((await placeBid(ana, lot.id, 10_000).expect(422)).body.code).toBe('LOT_CANCELLED');
    });
  });

  it('primeiro lance >= lance inicial (aceita exatamente o mínimo)', async () => {
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    const below = await placeBid(ana, lot.id, 9_999).expect(422);
    expect(below.body).toMatchObject({ code: 'BELOW_MINIMUM', details: { minimumCents: 10_000, isFirstBid: true } });
    expect(below.body.message).toContain('primeiro lance precisa ser de pelo menos R$');
    await placeBid(ana, lot.id, 10_000).expect(201);
  });

  it('lances seguintes >= lance atual + incremento (aceita exatamente o mínimo)', async () => {
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    await placeBid(ana, lot.id, 12_000).expect(201);
    const below = await placeBid(bruno, lot.id, 12_999).expect(422);
    expect(below.body).toMatchObject({ code: 'BELOW_MINIMUM', details: { minimumCents: 13_000, isFirstBid: false } });
    await placeBid(bruno, lot.id, 13_000).expect(201);
  });

  it('o líder não pode cobrir o próprio lance', async () => {
    const lot = await createLot(ctx, seller);
    await placeBid(ana, lot.id, 10_000).expect(201);
    const response = await placeBid(ana, lot.id, 50_000).expect(422);
    expect(response.body).toMatchObject({
      code: 'ALREADY_WINNING',
      message: 'Você já é o líder deste lote. Não é possível cobrir o próprio lance.',
    });
  });

  it('leiloeiro não pode dar lances', async () => {
    const lot = await createLot(ctx, seller);
    const response = await placeBid(seller, lot.id, 10_000).expect(403);
    expect(response.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('saldo comprometido: o lance precisa caber no DISPONÍVEL (total - comprometido)', async () => {
    const carla = await signUp(ctx, 'BIDDER', 'Carla');
    await deposit(carla, 30_000);
    const lot1 = await createLot(ctx, seller, { externalId: '16568', startingPriceCents: 20_000 });
    const lot2 = await createLot(ctx, seller, { externalId: '28560', startingPriceCents: 15_000 });

    await placeBid(carla, lot1.id, 20_000).expect(201);
    expect(await wallet(carla)).toMatchObject({ balanceCents: 30_000, heldCents: 20_000, availableCents: 10_000 });

    const refused = await placeBid(carla, lot2.id, 15_000).expect(422);
    expect(refused.body).toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
      details: { availableCents: 10_000, amountCents: 15_000 },
    });
    expect(refused.body.message).toContain('Saldo insuficiente');
  });

  it('quando superado, o valor volta ao disponível na hora; o novo líder fica com o valor comprometido', async () => {
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    await placeBid(ana, lot.id, 100_000).expect(201);
    expect(await wallet(ana)).toMatchObject({ heldCents: 100_000, availableCents: 900_000 });

    await placeBid(bruno, lot.id, 101_000).expect(201);
    const anaAfter = await wallet(ana);
    const brunoAfter = await wallet(bruno);
    expect(anaAfter).toMatchObject({ balanceCents: 1_000_000, heldCents: 0, availableCents: 1_000_000 });
    expect(brunoAfter).toMatchObject({ heldCents: 101_000, availableCents: 899_000 });
    expect(anaAfter.transactions.map((t) => t.type)).toEqual(['RELEASE', 'HOLD', 'DEPOSIT']);
    expect(brunoAfter.holds).toEqual([expect.objectContaining({ lotId: lot.id, amountCents: 101_000 })]);
  });

  it('informa posição, liderança e "você foi superado" para quem está olhando', async () => {
    const lot = await createLot(ctx, seller);
    await placeBid(ana, lot.id, 10_000).expect(201);
    const brunoBid = await placeBid(bruno, lot.id, 11_000).expect(201);
    expect(brunoBid.body.viewer).toMatchObject({ isLeader: true, position: 1, totalBidders: 2, hasBid: true });

    const anaView = (await ana.agent.get(`/api/lots/${lot.id}`).expect(200)).body as LotPageDto;
    expect(anaView.viewer).toMatchObject({ isLeader: false, position: 2, myMaxBidCents: 10_000, hasBid: true });
    expect(anaView.lot.leaderAlias).not.toBe(anaView.viewer.alias);

    const history = (await request(ctx.server).get(`/api/lots/${lot.id}/bids`).expect(200)).body;
    expect(history.map((bid: { seq: number }) => bid.seq)).toEqual([2, 1]);
    expect(JSON.stringify(history)).not.toContain(ana.user.id);
    expect(JSON.stringify(history)).not.toContain('Ana');
  });

  describe('prorrogação anti-sniping', () => {
    it('lance nos últimos 2 minutos garante 2 minutos a partir do lance', async () => {
      const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
      ctx.clock.advance(10 * MINUTE - 90_000); // faltam 90 s
      const first = await placeBid(ana, lot.id, 10_000).expect(201);
      const expectedEnd = new Date(T0.getTime() + 10 * MINUTE - 90_000 + 2 * MINUTE).toISOString();
      expect(first.body.lot.endsAt).toBe(expectedEnd);
      expect(first.body.bid.extended).toBe(true);
      expect(first.body.lot.extended).toBe(true);

      // depois do fim ORIGINAL, mas antes do novo fim: ainda aceita
      ctx.clock.advance(100_000);
      await placeBid(bruno, lot.id, 11_000).expect(201);
    });

    it('lance antes da janela final não prorroga', async () => {
      const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
      ctx.clock.advance(7 * MINUTE); // faltam 3 min
      const response = await placeBid(ana, lot.id, 10_000).expect(201);
      expect(response.body.lot.endsAt).toBe(lot.endsAt);
      expect(response.body.bid.extended).toBe(false);
    });
  });

  it('valores inválidos são recusados na validação', async () => {
    const lot = await createLot(ctx, seller);
    await placeBid(ana, lot.id, -5).expect(400);
    await placeBid(ana, lot.id, 10.5 as unknown as number).expect(400);
    await ana.agent.post(`/api/lots/${lot.id}/bids`).send({ amountCents: '10000' }).expect(400);
  });
});
