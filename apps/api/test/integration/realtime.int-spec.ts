import { io, Socket } from 'socket.io-client';
import {
  LotBidEvent,
  LotCancelledEvent,
  LotClosedEvent,
  LotWonEvent,
  OutbidEvent,
  SocketEvents,
  SubscribeAck,
  WalletUpdatedEvent,
} from '@arremate/shared';
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

function connect(ctx: TestContext, cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(ctx.baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: cookie ? { cookie } : undefined,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function nextEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Evento ${event} não chegou`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function subscribe(socket: Socket, lotId: string): Promise<SubscribeAck> {
  return socket.emitWithAck(SocketEvents.LOT_SUBSCRIBE, { lotId });
}

describe('Tempo real (Socket.IO)', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let ana: TestUser;
  let bruno: TestUser;
  const sockets: Socket[] = [];

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
    await deposit(ana, 100_000);
    await deposit(bruno, 100_000);
  });
  afterEach(() => {
    while (sockets.length) sockets.pop()?.disconnect();
  });

  it('espectador anônimo recebe cada lance sem dados pessoais', async () => {
    const lot = await createLot(ctx, seller);
    const spectator = await connect(ctx);
    sockets.push(spectator);
    expect(await subscribe(spectator, lot.id)).toMatchObject({ ok: true });

    const received = nextEvent<LotBidEvent>(spectator, SocketEvents.LOT_BID);
    await placeBid(ana, lot.id, 10_000).expect(201);
    const event = await received;
    expect(event).toMatchObject({ lotId: lot.id, currentPriceCents: 10_000, minNextBidCents: 11_000, bidCount: 1 });
    expect(event.bid.bidderAlias).toMatch(/^[0-9A-F]{6}$/);
    expect(JSON.stringify(event)).not.toContain(ana.user.id);
  });

  it('licitante superado recebe "você foi superado" e a carteira atualizada na hora', async () => {
    const lot = await createLot(ctx, seller);
    await placeBid(ana, lot.id, 10_000).expect(201);
    const anaSocket = await connect(ctx, ana.cookie);
    sockets.push(anaSocket);

    const outbid = nextEvent<OutbidEvent>(anaSocket, SocketEvents.OUTBID);
    const walletUpdate = nextEvent<WalletUpdatedEvent>(anaSocket, SocketEvents.WALLET_UPDATED);
    await placeBid(bruno, lot.id, 12_000).expect(201);

    expect(await outbid).toMatchObject({ lotId: lot.id, currentPriceCents: 12_000, releasedCents: 10_000 });
    expect(await walletUpdate).toMatchObject({ heldCents: 0, availableCents: 100_000, reason: 'RELEASE' });
  });

  it('encerramento avisa a sala e o arrematante', async () => {
    const lot = await createLot(ctx, seller, { endsAt: new Date(T0.getTime() + 5 * MINUTE).toISOString() });
    await placeBid(bruno, lot.id, 10_000).expect(201);
    const spectator = await connect(ctx);
    const brunoSocket = await connect(ctx, bruno.cookie);
    sockets.push(spectator, brunoSocket);
    await subscribe(spectator, lot.id);

    const closed = nextEvent<LotClosedEvent>(spectator, SocketEvents.LOT_CLOSED);
    const won = nextEvent<LotWonEvent>(brunoSocket, SocketEvents.LOT_WON);
    ctx.clock.advance(5 * MINUTE);
    await ctx.settlement.settleDueLots();

    expect(await closed).toMatchObject({ lotId: lot.id, hasWinner: true, finalPriceCents: 10_000 });
    expect((await won).receiptCode).toBeTruthy();
  });

  it('cancelamento avisa a sala', async () => {
    const lot = await createLot(ctx, seller);
    const spectator = await connect(ctx);
    sockets.push(spectator);
    await subscribe(spectator, lot.id);
    const cancelled = nextEvent<LotCancelledEvent>(spectator, SocketEvents.LOT_CANCELLED);
    await seller.agent.post(`/api/lots/${lot.id}/cancel`).send({}).expect(200);
    expect(await cancelled).toMatchObject({ lotId: lot.id, refundedLeader: false });
  });

  it('recusa inscrição com identificador inválido', async () => {
    const spectator = await connect(ctx);
    sockets.push(spectator);
    expect(await subscribe(spectator, 'qualquer-coisa')).toMatchObject({ ok: false });
  });
});
