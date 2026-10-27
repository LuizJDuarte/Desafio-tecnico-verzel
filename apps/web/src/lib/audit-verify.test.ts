// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_SCHEME,
  type AuditBundle,
  canonicalBid,
  canonicalLotGenesis,
  canonicalLotHead,
  type PublicKeyDto,
} from '@arremate/shared';
import { verifyInBrowser } from './audit-verify';

/**
 * O servidor assina com node:crypto; aqui verificamos com a WebCrypto (a mesma API do navegador),
 * garantindo que a verificação independente da página de auditoria funciona de verdade.
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
const KEY: PublicKeyDto = { algorithm: 'Ed25519', keyId: 'chave-teste', publicKey: jwk.x, publicKeyPem: '' };
const sha = (message: string) => createHash('sha256').update(message).digest('hex');
const signed = (message: string) => sign(null, Buffer.from(message), privateKey).toString('base64url');

function bundle(): AuditBundle {
  const genesis = {
    lotId: 'lote-1',
    title: 'The Bedroom',
    source: 'artic',
    externalId: '28560',
    startingPriceCents: 10_000,
    minIncrementCents: 1_000,
    startsAt: '2026-11-02T12:00:00.000Z',
    originalEndsAt: '2026-11-02T13:00:00.000Z',
    antiSnipingWindowMs: 120_000,
    antiSnipingExtensionMs: 120_000,
    createdAt: '2026-11-02T11:00:00.000Z',
  };
  const genesisHash = sha(canonicalLotGenesis(genesis));
  const fields = {
    lotId: 'lote-1',
    seq: 1,
    bidderAlias: 'ABC123',
    amountCents: 10_000,
    createdAt: '2026-11-02T12:10:00.000Z',
    endsAtAfter: '2026-11-02T13:00:00.000Z',
    prevHash: genesisHash,
  };
  const message = canonicalBid(fields);
  const hash = sha(message);
  const head = {
    lotId: 'lote-1',
    state: 'OPEN' as const,
    bidCount: 1,
    headHash: hash,
    endsAt: '2026-11-02T13:00:00.000Z',
  };
  return {
    scheme: AUDIT_SCHEME,
    lot: {
      ...genesis,
      state: 'OPEN',
      endsAt: head.endsAt,
      bidCount: 1,
      currentPriceCents: 10_000,
      leaderAlias: 'ABC123',
      genesisHash,
      genesisSignature: signed(canonicalLotGenesis(genesis)),
      genesisKeyId: KEY.keyId,
      headHash: hash,
      headSignature: signed(canonicalLotHead(head)),
      headKeyId: KEY.keyId,
    },
    bids: [{ ...fields, hash, signature: signed(message), keyId: KEY.keyId }],
    receipt: null,
  };
}

describe('verificação da auditoria no navegador (WebCrypto)', () => {
  it('confirma um histórico íntegro', async () => {
    const { report, engine } = await verifyInBrowser(bundle(), KEY);
    expect(engine).toBe('webcrypto');
    expect(report.verdict).toBe('INTACT');
  });

  it('detecta valor alterado mesmo que o servidor diga o contrário', async () => {
    const tampered = bundle();
    tampered.bids[0].amountCents = 99_000;
    const { report } = await verifyInBrowser(tampered, KEY);
    expect(report.verdict).toBe('TAMPERED');
    expect(report.issues.map((issue) => issue.code)).toContain('BID_SIGNATURE_INVALID');
  });

  it('recusa assinaturas feitas com outra chave', async () => {
    const { report } = await verifyInBrowser(bundle(), { ...KEY, keyId: 'outra' });
    expect(report.issues.map((issue) => issue.code)).toContain('UNKNOWN_SIGNING_KEY');
  });
});
