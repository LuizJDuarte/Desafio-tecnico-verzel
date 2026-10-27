import { describe, expect, it } from 'vitest';
import { canonicalBid, canonicalLotHead, verifyAuditBundle } from '../src';
import {
  ATTACKER_KEY_ID,
  buildBundle,
  nodeAuditCrypto,
  sha256,
  signWithAttackerKey,
  signWithServerKey,
  THREE_BIDS,
} from './audit-fixtures';

const codesOf = async (bundle: ReturnType<typeof buildBundle>) =>
  (await verifyAuditBundle(bundle, nodeAuditCrypto)).issues.map((issue) => issue.code);

describe('verifyAuditBundle: histórico íntegro', () => {
  it('aprova um lote sem lances', async () => {
    const report = await verifyAuditBundle(buildBundle([]), nodeAuditCrypto);
    expect(report.verdict).toBe('INTACT');
    expect(report.issues).toEqual([]);
  });

  it('aprova um lote com lances e todas as verificações passam', async () => {
    const report = await verifyAuditBundle(buildBundle(THREE_BIDS), nodeAuditCrypto);
    expect(report.verdict).toBe('INTACT');
    expect(report.bidCount).toBe(3);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it('aprova um lote arrematado com comprovante coerente', async () => {
    const report = await verifyAuditBundle(buildBundle(THREE_BIDS, { settle: true }), nodeAuditCrypto);
    expect(report.verdict).toBe('INTACT');
  });

  it('aprova prorrogações legítimas (lances nos últimos 2 minutos)', async () => {
    const bundle = buildBundle([
      { alias: 'A1B2C3', amountCents: 100_000, at: '2026-10-01T12:59:00.000Z' },
      { alias: 'D4E5F6', amountCents: 105_000, at: '2026-10-01T13:00:30.000Z' },
    ]);
    expect(bundle.lot.endsAt).toBe('2026-10-01T13:02:30.000Z');
    expect((await verifyAuditBundle(bundle, nodeAuditCrypto)).verdict).toBe('INTACT');
  });
});

describe('verifyAuditBundle: detecta adulteração', () => {
  it('valor de um lance alterado direto no banco', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.bids[1].amountCents = 999_999;
    const codes = await codesOf(bundle);
    expect(codes).toContain('BID_HASH_MISMATCH');
    expect(codes).toContain('BID_SIGNATURE_INVALID');
  });

  it('valor alterado e hash recalculado (o atacante conhece SHA-256)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    const bid = bundle.bids[1];
    bid.amountCents = 110_000;
    bid.hash = sha256(canonicalBid(bid));
    const codes = await codesOf(bundle);
    expect(codes).not.toContain('BID_HASH_MISMATCH');
    expect(codes).toContain('BID_SIGNATURE_INVALID');
    expect(codes).toContain('PREV_HASH_MISMATCH');
  });

  it('remoção de um lance do meio', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.bids.splice(1, 1);
    const report = await verifyAuditBundle(bundle, nodeAuditCrypto);
    const codes = report.issues.map((issue) => issue.code);
    expect(report.verdict).toBe('TAMPERED');
    expect(codes).toContain('SEQUENCE_GAP');
    expect(codes).toContain('PREV_HASH_MISMATCH');
    expect(codes).toContain('HEAD_COUNT_MISMATCH');
    expect(report.issues.find((issue) => issue.code === 'SEQUENCE_GAP')?.message).toContain('#2');
  });

  it('remoção do último lance (truncamento que uma cadeia simples não pega)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.bids.pop();
    const codes = await codesOf(bundle);
    expect(codes).toContain('HEAD_COUNT_MISMATCH');
    expect(codes).toContain('HEAD_HASH_MISMATCH');
    expect(codes).toContain('STATE_PRICE_MISMATCH');
  });

  it('remoção do último lance com o selo do lote "ajustado" sem a chave privada', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.bids.pop();
    const last = bundle.bids[bundle.bids.length - 1];
    bundle.lot.bidCount = 2;
    bundle.lot.headHash = last.hash;
    bundle.lot.currentPriceCents = last.amountCents;
    bundle.lot.leaderAlias = last.bidderAlias;
    const codes = await codesOf(bundle);
    expect(codes).toEqual(['HEAD_SIGNATURE_INVALID']);
  });

  it('inserção posterior de um lance forjado no final', async () => {
    const bundle = buildBundle(THREE_BIDS);
    const last = bundle.bids[2];
    const forged = {
      lotId: last.lotId,
      seq: 4,
      bidderAlias: 'D4E5F6',
      amountCents: 130_000,
      createdAt: '2026-10-01T12:40:00.000Z',
      endsAtAfter: last.endsAtAfter,
      prevHash: last.hash,
    };
    const message = canonicalBid(forged);
    bundle.bids.push({
      ...forged,
      hash: sha256(message),
      signature: signWithAttackerKey(message),
      keyId: ATTACKER_KEY_ID,
    });
    const codes = await codesOf(bundle);
    expect(codes).toContain('UNKNOWN_SIGNING_KEY');
    expect(codes).toContain('HEAD_COUNT_MISMATCH');
  });

  it('inserção no meio do histórico (sequência duplicada)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    const forged = { ...bundle.bids[1], amountCents: 104_000, bidderAlias: 'ZZZZZZ' };
    forged.hash = sha256(canonicalBid(forged));
    forged.signature = signWithServerKey('outra mensagem');
    bundle.bids.splice(2, 0, forged);
    const codes = await codesOf(bundle);
    expect(codes).toContain('SEQUENCE_OUT_OF_ORDER');
    expect(codes).toContain('BID_SIGNATURE_INVALID');
  });

  it('prazo final do lote alterado (estender o leilão para aceitar lance tardio)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.lot.endsAt = '2026-10-01T15:00:00.000Z';
    const codes = await codesOf(bundle);
    expect(codes).toContain('HEAD_SIGNATURE_INVALID');
    expect(codes).toContain('STATE_ENDS_AT_MISMATCH');
  });

  it('termos do lote alterados (lance inicial)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.lot.startingPriceCents = 1_000;
    const codes = await codesOf(bundle);
    expect(codes).toContain('GENESIS_HASH_MISMATCH');
    expect(codes).toContain('GENESIS_SIGNATURE_INVALID');
  });

  it('situação do lote revertida (cancelado voltando a aberto)', async () => {
    const bundle = buildBundle(THREE_BIDS);
    bundle.lot.state = 'CANCELLED';
    const codes = await codesOf(bundle);
    expect(codes).toContain('HEAD_SIGNATURE_INVALID');
  });

  it('comprovante com valor alterado', async () => {
    const bundle = buildBundle(THREE_BIDS, { settle: true });
    bundle.receipt!.amountCents = 1;
    const codes = await codesOf(bundle);
    expect(codes).toContain('RECEIPT_MISMATCH');
    expect(codes).toContain('RECEIPT_HASH_MISMATCH');
  });

  it('comprovante removido de lote arrematado', async () => {
    const bundle = buildBundle(THREE_BIDS, { settle: true });
    bundle.receipt = null;
    expect(await codesOf(bundle)).toEqual(['RECEIPT_MISSING']);
  });
});

describe('verifyAuditBundle: reprodução das regras', () => {
  it('aponta lance abaixo do mínimo mesmo com assinaturas válidas', async () => {
    const bundle = buildBundle([
      { alias: 'A1B2C3', amountCents: 100_000, at: '2026-10-01T12:10:00.000Z' },
      { alias: 'D4E5F6', amountCents: 101_000, at: '2026-10-01T12:20:00.000Z' },
    ]);
    const report = await verifyAuditBundle(bundle, nodeAuditCrypto);
    expect(report.issues.map((issue) => issue.code)).toEqual(['RULE_BELOW_MINIMUM']);
    expect(report.checks.find((check) => check.id === 'RULES')?.ok).toBe(false);
  });

  it('aponta líder cobrindo o próprio lance', async () => {
    const bundle = buildBundle([
      { alias: 'A1B2C3', amountCents: 100_000, at: '2026-10-01T12:10:00.000Z' },
      { alias: 'A1B2C3', amountCents: 200_000, at: '2026-10-01T12:20:00.000Z' },
    ]);
    expect(await codesOf(bundle)).toEqual(['RULE_SELF_OUTBID']);
  });

  it('aponta lance fora da janela do lote', async () => {
    const bundle = buildBundle([{ alias: 'A1B2C3', amountCents: 100_000, at: '2026-10-01T11:59:59.000Z' }]);
    expect(await codesOf(bundle)).toEqual(['RULE_BID_BEFORE_START']);
  });

  it('o selo assinado cobre exatamente os campos esperados', () => {
    expect(canonicalLotHead({ lotId: 'x', state: 'OPEN', bidCount: 0, headHash: 'h', endsAt: 'e' })).toBe(
      '["arremate-audit/v1:lot-head","x","OPEN",0,"h","e"]',
    );
  });
});
