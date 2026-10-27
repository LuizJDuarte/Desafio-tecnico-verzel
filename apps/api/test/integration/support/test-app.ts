import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { CreateLotRequest, LotDetailDto, UserDto, UserRole } from '@arremate/shared';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/bootstrap';
import { Clock } from '../../../src/common/clock';
import { loadConfig } from '../../../src/config/app-config';
import { SettlementService } from '../../../src/modules/auction/settlement.service';
import { FakeCatalogProvider } from '../../../src/modules/catalog/providers/fake-catalog.provider';
import { TEST_DATABASE_URL } from '../global-setup';

export type Agent = ReturnType<typeof request.agent>;

export interface TestContext {
  app: NestExpressApplication;
  server: Server;
  baseUrl: string;
  clock: Clock;
  catalog: FakeCatalogProvider;
  db: DataSource;
  settlement: SettlementService;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** Sobe a aplicação real (mesma configuração HTTP da produção) contra o PostgreSQL de testes. */
export async function createTestApp(): Promise<TestContext> {
  Logger.overrideLogger(['error']);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    CATALOG_PROVIDER: 'fake',
    IMAGE_DOWNLOAD_ENABLED: 'false',
    SCHEDULER_ENABLED: 'false',
    RATE_LIMIT_ENABLED: 'false',
    SWAGGER_ENABLED: 'false',
    WEB_DIST_PATH: '/caminho/inexistente',
  });
  const catalog = new FakeCatalogProvider();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, { catalogProvider: catalog })],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const { port } = server.address() as AddressInfo;
  const db = app.get(DataSource);
  const clock = app.get(Clock);

  return {
    app,
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    clock,
    catalog,
    db,
    settlement: app.get(SettlementService),
    async reset() {
      await db.query(
        'TRUNCATE wallet_transactions, receipts, bids, lots, lot_images, wallets, users, api_cache RESTART IDENTITY CASCADE',
      );
      await db.query('ALTER SEQUENCE receipt_number_seq RESTART WITH 1');
      clock.unfreeze();
      catalog.simulateOutage(false);
    },
    async close() {
      await app.close();
    },
  };
}

export interface TestUser {
  agent: Agent;
  user: UserDto;
  cookie: string;
}

export async function signUp(ctx: TestContext, role: UserRole, name = 'Pessoa de Teste'): Promise<TestUser> {
  const agent = request.agent(ctx.server);
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@teste.com`;
  const response = await agent
    .post('/api/auth/register')
    .send({ name, email, password: 'senha-super-segura', role })
    .expect(201);
  const setCookie = response.headers['set-cookie'] as unknown as string[];
  return { agent, user: response.body.user as UserDto, cookie: setCookie[0].split(';')[0] };
}

export async function deposit(user: TestUser, amountCents: number): Promise<void> {
  await user.agent.post('/api/wallet/deposits').send({ amountCents }).expect(201);
}

export async function createLot(
  ctx: TestContext,
  seller: TestUser,
  overrides: Partial<CreateLotRequest> = {},
): Promise<LotDetailDto> {
  const now = ctx.clock.now().getTime();
  const response = await seller.agent.post('/api/lots').send({
    externalId: '16568',
    startingPriceCents: 10_000,
    minIncrementCents: 1_000,
    startNow: true,
    endsAt: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  });
  if (response.status !== 201) throw new Error(`Falha ao criar lote: ${JSON.stringify(response.body)}`);
  return response.body as LotDetailDto;
}

export function placeBid(user: TestUser, lotId: string, amountCents: number) {
  return user.agent.post(`/api/lots/${lotId}/bids`).send({ amountCents });
}

export async function wallet(user: TestUser) {
  return (await user.agent.get('/api/wallet').expect(200)).body as {
    balanceCents: number;
    heldCents: number;
    availableCents: number;
    holds: Array<{ lotId: string; amountCents: number }>;
    transactions: Array<{ type: string; amountCents: number; description: string; lotId: string | null }>;
  };
}

export const MINUTE = 60_000;
export const T0 = new Date('2026-11-02T12:00:00.000Z');
