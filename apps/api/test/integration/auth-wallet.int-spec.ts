import request from 'supertest';
import { createTestApp, deposit, signUp, TestContext, wallet } from './support/test-app';

describe('Autenticação e papéis', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => ctx.reset());

  it('cadastra, define cookie httpOnly e não expõe a senha', async () => {
    const response = await request(ctx.server)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ANA@Teste.com ', password: 'senha-segura-1', role: 'BIDDER' })
      .expect(201);
    expect(response.body.user).toMatchObject({ name: 'Ana', email: 'ana@teste.com', role: 'BIDDER' });
    expect(JSON.stringify(response.body)).not.toContain('senha');
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('arremate_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('recusa e-mail duplicado e dados inválidos com mensagens em português', async () => {
    await signUp(ctx, 'BIDDER');
    const body = { name: 'X', email: 'dup@teste.com', password: 'senha-segura-1', role: 'BIDDER' };
    await request(ctx.server)
      .post('/api/auth/register')
      .send({ ...body, name: 'Fulano' })
      .expect(201);
    const duplicated = await request(ctx.server)
      .post('/api/auth/register')
      .send({ ...body, name: 'Fulano' })
      .expect(409);
    expect(duplicated.body).toMatchObject({ code: 'EMAIL_TAKEN', message: 'Este e-mail já está cadastrado.' });

    const invalid = await request(ctx.server)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'nao-e-email', password: '123', role: 'ADMIN' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.details.errors).toEqual(
      expect.arrayContaining(['Informe um e-mail válido.', 'A senha deve ter entre 8 e 72 caracteres.']),
    );
  });

  it('login, sessão, logout e Bearer token', async () => {
    await request(ctx.server)
      .post('/api/auth/register')
      .send({ name: 'Bruno', email: 'bruno@teste.com', password: 'senha-segura-1', role: 'BIDDER' })
      .expect(201);

    const wrong = await request(ctx.server)
      .post('/api/auth/login')
      .send({ email: 'bruno@teste.com', password: 'errada-123' })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const agent = request.agent(ctx.server);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'bruno@teste.com', password: 'senha-segura-1' })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
    await request(ctx.server).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.get('/api/auth/me').expect(200);
    expect(after.body).toEqual({ user: null });
    const protectedRoute = await agent.get('/api/wallet').expect(401);
    expect(protectedRoute.body.code).toBe('UNAUTHENTICATED');
  });

  it('aplica os papéis: licitante não cria lote, leiloeiro não deposita nem busca como licitante', async () => {
    const bidder = await signUp(ctx, 'BIDDER');
    const seller = await signUp(ctx, 'AUCTIONEER');
    const forbidden = await bidder.agent.post('/api/lots').send({}).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN_ROLE', message: 'Esta ação é exclusiva para leiloeiros.' });
    await seller.agent.post('/api/wallet/deposits').send({ amountCents: 1000 }).expect(403);
    await bidder.agent.get('/api/catalog/search?q=monet').expect(403);
    await seller.agent.get('/api/me/bids').expect(403);
  });

  it('rejeita POST de outra origem (defesa extra contra CSRF)', async () => {
    const bidder = await signUp(ctx, 'BIDDER');
    const response = await bidder.agent
      .post('/api/wallet/deposits')
      .set('Origin', 'https://site-malicioso.com')
      .send({ amountCents: 1000 })
      .expect(403);
    expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});

describe('Carteira', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => ctx.reset());

  it('começa zerada e o depósito simulado aumenta total e disponível, com extrato', async () => {
    const bidder = await signUp(ctx, 'BIDDER');
    expect(await wallet(bidder)).toMatchObject({ balanceCents: 0, heldCents: 0, availableCents: 0 });
    await deposit(bidder, 150_000);
    const after = await wallet(bidder);
    expect(after).toMatchObject({ balanceCents: 150_000, heldCents: 0, availableCents: 150_000 });
    expect(after.transactions[0]).toMatchObject({ type: 'DEPOSIT', amountCents: 150_000 });
  });

  it('valida limites do depósito', async () => {
    const bidder = await signUp(ctx, 'BIDDER');
    const zero = await bidder.agent.post('/api/wallet/deposits').send({ amountCents: 0 }).expect(400);
    expect(zero.body.message).toBe('O depósito mínimo é de R$ 1,00.');
    await bidder.agent.post('/api/wallet/deposits').send({ amountCents: 100_000_001 }).expect(400);
    await bidder.agent.post('/api/wallet/deposits').send({ amountCents: 10.5 }).expect(400);
  });
});
