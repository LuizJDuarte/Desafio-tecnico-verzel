import { createPublicKey, verify } from 'node:crypto';
import request from 'supertest';
import { AuditCrypto, AuditResponse, PublicKeyDto, verifyAuditBundle } from '@arremate/shared';
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
 * Adulteração DIRETO NO BANCO (SQL cru, sem passar pela aplicação), como pede o desafio:
 * cada cenário precisa ser detectado pela auditoria.
 */
describe('Auditoria: histórico à prova de adulteração', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let ana: TestUser;
  let bruno: TestUser;
  let lotId: string;

  const audit = async (id = lotId) =>
    (await request(ctx.server).get(`/api/audit/lots/${id}`).expect(200)).body as AuditResponse;
  const codes = async (id = lotId) => (await audit(id)).report.issues.map((issue) => issue.code);

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
    const lot = await createLot(ctx, seller, { startingPriceCents: 10_000, minIncrementCents: 1_000 });
    lotId = lot.id;
    for (const [user, amount] of [
      [ana, 10_000],
      [bruno, 12_000],
      [ana, 15_000],
      [bruno, 20_000],
    ] as const) {
      ctx.clock.advance(MINUTE);
      await placeBid(user, lotId, amount).expect(201);
    }
  });

  it('histórico íntegro: todas as verificações passam e não há dados pessoais no pacote', async () => {
    const response = await audit();
    expect(response.report.verdict).toBe('INTACT');
    expect(response.report.checks.map((check) => [check.id, check.ok])).toEqual([
      ['GENESIS', true],
      ['CHAIN', true],
      ['SIGNATURES', true],
      ['HEAD', true],
      ['RULES', true],
      ['RECEIPT', true],
      ['IDENTITIES', true],
    ]);
    const serialized = JSON.stringify(response);
    for (const secret of [ana.user.id, bruno.user.id, ana.user.email, 'Bruno'])
      expect(serialized).not.toContain(secret);
  });

  it('qualquer pessoa reverifica sozinha com a chave pública (mesma conta que o navegador faz)', async () => {
    const response = await audit();
    const key = (await request(ctx.server).get('/api/audit/public-key').expect(200)).body as PublicKeyDto;
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.publicKey }, format: 'jwk' });
    const independent: AuditCrypto = {
      sha256Hex: async (message) => (await import('node:crypto')).createHash('sha256').update(message).digest('hex'),
      verifySignature: async (message, signature, keyId) =>
        keyId !== key.keyId
          ? 'UNKNOWN_KEY'
          : verify(null, Buffer.from(message), publicKey, Buffer.from(signature, 'base64url'))
            ? 'VALID'
            : 'INVALID',
    };
    expect((await verifyAuditBundle(response.bundle, independent)).verdict).toBe('INTACT');
  });

  it('UPDATE no valor de um lance', async () => {
    await ctx.db.query(`UPDATE bids SET amount_cents = 11000 WHERE lot_id = $1 AND seq = 2`, [lotId]);
    const result = await codes();
    expect(result).toEqual(expect.arrayContaining(['BID_HASH_MISMATCH', 'BID_SIGNATURE_INVALID']));
  });

  it('UPDATE no valor e no hash do lance (sem a chave privada)', async () => {
    await ctx.db.query(
      `UPDATE bids SET amount_cents = 13000,
         hash = encode(sha256(convert_to('["arremate-audit/v1:bid"]' || id::text, 'UTF8')), 'hex')
       WHERE lot_id = $1 AND seq = 2`,
      [lotId],
    );
    expect(await codes()).toEqual(expect.arrayContaining(['BID_SIGNATURE_INVALID', 'PREV_HASH_MISMATCH']));
  });

  it('DELETE de um lance do meio', async () => {
    await ctx.db.query(`DELETE FROM bids WHERE lot_id = $1 AND seq = 2`, [lotId]);
    const response = await audit();
    expect(response.report.verdict).toBe('TAMPERED');
    expect(response.report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['SEQUENCE_GAP', 'PREV_HASH_MISMATCH', 'HEAD_COUNT_MISMATCH']),
    );
    expect(response.report.issues.find((issue) => issue.code === 'SEQUENCE_GAP')?.message).toBe(
      'O lance #2 foi removido do histórico.',
    );
  });

  it('DELETE do último lance (truncamento)', async () => {
    await ctx.db.query(`DELETE FROM bids WHERE lot_id = $1 AND seq = 4`, [lotId]);
    expect(await codes()).toEqual(
      expect.arrayContaining(['HEAD_COUNT_MISMATCH', 'HEAD_HASH_MISMATCH', 'STATE_PRICE_MISMATCH']),
    );
  });

  it('DELETE do último lance + "conserto" do lote (sem conseguir reassinar o selo)', async () => {
    const [previous] = await ctx.db.query(`SELECT hash, bidder_id FROM bids WHERE lot_id = $1 AND seq = 3`, [lotId]);
    await ctx.db.query(`DELETE FROM bids WHERE lot_id = $1 AND seq = 4`, [lotId]);
    await ctx.db.query(
      `UPDATE lots SET bid_count = 3, head_hash = $2, current_price_cents = 15000, leader_id = $3 WHERE id = $1`,
      [lotId, previous.hash, previous.bidder_id],
    );
    expect(await codes()).toEqual(['HEAD_SIGNATURE_INVALID']);
  });

  it('INSERT de lance forjado no final', async () => {
    await ctx.db.query(
      `INSERT INTO bids (id, lot_id, seq, bidder_id, bidder_alias, amount_cents, created_at, ends_at_after, prev_hash, hash, signature, key_id)
       SELECT gen_random_uuid(), lot_id, 5, bidder_id, bidder_alias, 99000, created_at + interval '1 second', ends_at_after, hash, repeat('a', 64), 'forjada', key_id
         FROM bids WHERE lot_id = $1 AND seq = 3`,
      [lotId],
    );
    expect(await codes()).toEqual(expect.arrayContaining(['BID_SIGNATURE_INVALID', 'HEAD_COUNT_MISMATCH']));
  });

  it('troca do licitante real de um lance (detectada pelo vínculo do pseudônimo)', async () => {
    await ctx.db.query(`UPDATE bids SET bidder_id = $2 WHERE lot_id = $1 AND seq = 1`, [lotId, bruno.user.id]);
    const response = await audit();
    expect(response.report.verdict).toBe('TAMPERED');
    expect(response.report.issues).toEqual([expect.objectContaining({ code: 'IDENTITY_BINDING_MISMATCH', seq: 1 })]);
  });

  it('troca do líder do lote para "roubar" o arremate', async () => {
    await ctx.db.query(`UPDATE lots SET leader_id = $2 WHERE id = $1`, [lotId, ana.user.id]);
    expect(await codes()).toEqual(['STATE_LEADER_MISMATCH']);
  });

  it('prazo final empurrado para aceitar lance tardio', async () => {
    await ctx.db.query(`UPDATE lots SET ends_at = ends_at + interval '1 hour' WHERE id = $1`, [lotId]);
    expect(await codes()).toEqual(expect.arrayContaining(['HEAD_SIGNATURE_INVALID', 'STATE_ENDS_AT_MISMATCH']));
  });

  it('termos do lote alterados (lance inicial)', async () => {
    await ctx.db.query(`UPDATE lots SET starting_price_cents = 100 WHERE id = $1`, [lotId]);
    expect(await codes()).toEqual(expect.arrayContaining(['GENESIS_HASH_MISMATCH', 'GENESIS_SIGNATURE_INVALID']));
  });

  it('comprovante alterado depois da liquidação', async () => {
    ctx.clock.advance(2 * 60 * MINUTE);
    await ctx.settlement.settleDueLots();
    expect((await audit()).report.verdict).toBe('INTACT');
    await ctx.db.query(`UPDATE receipts SET amount_cents = 1000 WHERE lot_id = $1`, [lotId]);
    expect(await codes()).toEqual(expect.arrayContaining(['RECEIPT_MISMATCH', 'RECEIPT_HASH_MISMATCH']));
  });

  it('chave pública e lances usam o mesmo identificador de chave', async () => {
    const key = (await request(ctx.server).get('/api/audit/public-key').expect(200)).body as PublicKeyDto;
    const response = await audit();
    expect(response.publicKey.keyId).toBe(key.keyId);
    expect(new Set(response.bundle.bids.map((bid) => bid.keyId))).toEqual(new Set([key.keyId]));
  });
});
