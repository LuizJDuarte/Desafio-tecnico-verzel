import type { AuditResponse } from '@arremate/shared';
import request from 'supertest';
import { createLot, createTestApp, deposit, placeBid, signUp, TestContext, TestUser } from './support/test-app';

/**
 * Corrida de lances: várias requisições simultâneas no mesmo lote. O lock pessimista na linha do lote
 * serializa as transações; o resultado precisa ser exatamente o de uma execução em fila.
 */
describe('Concorrência', () => {
  let ctx: TestContext;
  let seller: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await ctx.reset();
    seller = await signUp(ctx, 'AUCTIONEER');
  });

  async function bidders(count: number, funds: number): Promise<TestUser[]> {
    const users: TestUser[] = [];
    for (let i = 0; i < count; i++) {
      const user = await signUp(ctx, 'BIDDER', `Licitante ${i}`);
      await deposit(user, funds);
      users.push(user);
    }
    return users;
  }

  async function invariants(lotId: string) {
    const [lot] = await ctx.db.query(`SELECT bid_count, current_price_cents, leader_id FROM lots WHERE id = $1`, [
      lotId,
    ]);
    const wallets = await ctx.db.query(`SELECT user_id, balance_cents, held_cents FROM wallets WHERE held_cents > 0`);
    const audit = (await request(ctx.server).get(`/api/audit/lots/${lotId}`).expect(200)).body as AuditResponse;
    return { lot, wallets, audit };
  }

  it('12 lances simultâneos com o mesmo valor: exatamente 1 é aceito', async () => {
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    const users = await bidders(12, 100_000);

    const responses = await Promise.all(users.map((user) => placeBid(user, lot.id, 10_000)));
    const accepted = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status === 422);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(11);
    expect(new Set(rejected.map((response) => response.body.code))).toEqual(new Set(['BELOW_MINIMUM']));

    const { lot: row, wallets, audit } = await invariants(lot.id);
    expect(row.bid_count).toBe(1);
    expect(wallets).toHaveLength(1);
    expect(Number(wallets[0].held_cents)).toBe(10_000);
    expect(audit.report.verdict).toBe('INTACT');
  });

  it('disputa simultânea com valores crescentes mantém cadeia, liderança e saldos coerentes', async () => {
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    const users = await bidders(10, 1_000_000);

    const responses = await Promise.all(users.map((user, index) => placeBid(user, lot.id, 10_000 + index * 5_000)));
    const accepted = responses.filter((response) => response.status === 201).length;
    expect(accepted).toBeGreaterThanOrEqual(1);
    for (const response of responses.filter((r) => r.status !== 201)) {
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('BELOW_MINIMUM');
    }

    const { lot: row, wallets, audit } = await invariants(lot.id);
    expect(row.bid_count).toBe(accepted);
    // Só o líder tem valor comprometido, e é exatamente o lance atual.
    expect(wallets).toHaveLength(1);
    expect(wallets[0].user_id).toBe(row.leader_id);
    expect(Number(wallets[0].held_cents)).toBe(Number(row.current_price_cents));
    expect(audit.report.verdict).toBe('INTACT');
    expect(audit.bundle.bids.map((bid) => bid.seq)).toEqual(Array.from({ length: accepted }, (_, i) => i + 1));
  });

  it('mesmo licitante em dois lotes ao mesmo tempo, com saldo para apenas um: um só é aceito', async () => {
    const lotA = await createLot(ctx, seller, { externalId: '16568', startingPriceCents: 60_000 });
    const lotB = await createLot(ctx, seller, { externalId: '28560', startingPriceCents: 60_000 });
    const [user] = await bidders(1, 100_000);

    const [a, b] = await Promise.all([placeBid(user, lotA.id, 60_000), placeBid(user, lotB.id, 60_000)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const refused = a.status === 422 ? a : b;
    expect(refused.body.code).toBe('INSUFFICIENT_FUNDS');

    const [walletRow] = await ctx.db.query(`SELECT balance_cents, held_cents FROM wallets WHERE user_id = $1`, [
      user.user.id,
    ]);
    expect(Number(walletRow.held_cents)).toBe(60_000);
    expect(Number(walletRow.balance_cents) - Number(walletRow.held_cents)).toBe(40_000);
  });

  it('dois licitantes trocando de liderança em dois lotes ao mesmo tempo não geram deadlock', async () => {
    const lotA = await createLot(ctx, seller, { externalId: '16568', startingPriceCents: 10_000 });
    const lotB = await createLot(ctx, seller, { externalId: '28560', startingPriceCents: 10_000 });
    const [x, y] = await bidders(2, 1_000_000);
    await placeBid(x, lotA.id, 10_000).expect(201);
    await placeBid(y, lotB.id, 10_000).expect(201);

    // y supera x no lote A enquanto x supera y no lote B (carteiras travadas em ordens opostas).
    for (let round = 0; round < 5; round++) {
      const amount = 20_000 + round * 20_000;
      const [first, second] = await Promise.all([placeBid(y, lotA.id, amount), placeBid(x, lotB.id, amount)]);
      expect([first.status, second.status]).toEqual([201, 201]);
      const [third, fourth] = await Promise.all([
        placeBid(x, lotA.id, amount + 10_000),
        placeBid(y, lotB.id, amount + 10_000),
      ]);
      expect([third.status, fourth.status]).toEqual([201, 201]);
    }
    const held = await ctx.db.query(`SELECT SUM(held_cents)::bigint AS total FROM wallets`);
    const prices = await ctx.db.query(`SELECT SUM(current_price_cents)::bigint AS total FROM lots`);
    expect(held[0].total).toBe(prices[0].total);
  });
});
