import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  AUDIT_SCHEME,
  AuditBundle,
  AuditCrypto,
  canonicalBid,
  canonicalLotGenesis,
  canonicalLotHead,
  canonicalReceipt,
  endsAtAfterBid,
  LotState,
} from '../src';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const attacker = generateKeyPairSync('ed25519');

export const TEST_KEY_ID = 'test-key';
export const ATTACKER_KEY_ID = 'attacker-key';

export const sha256 = (message: string) => createHash('sha256').update(message, 'utf8').digest('hex');
export const signWithServerKey = (message: string) =>
  sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url');
export const signWithAttackerKey = (message: string) =>
  sign(null, Buffer.from(message, 'utf8'), attacker.privateKey).toString('base64url');

/** Adaptador de criptografia equivalente ao usado pela API (node:crypto). */
export const nodeAuditCrypto: AuditCrypto = {
  sha256Hex: async (message) => sha256(message),
  verifySignature: async (message, signature, keyId) => {
    if (keyId !== TEST_KEY_ID) return 'UNKNOWN_KEY';
    const ok = verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signature, 'base64url'));
    return ok ? 'VALID' : 'INVALID';
  },
};

export interface FixtureBid {
  alias: string;
  amountCents: number;
  at: string;
}

export const LOT_ID = '6f1d3c1a-1d7e-4a35-9a43-5f2f0c1b2a10';

export const GENESIS = {
  lotId: LOT_ID,
  title: 'Water Lilies',
  source: 'artic',
  externalId: '16568',
  startingPriceCents: 100_000,
  minIncrementCents: 5_000,
  startsAt: '2026-10-01T12:00:00.000Z',
  originalEndsAt: '2026-10-01T13:00:00.000Z',
  antiSnipingWindowMs: 120_000,
  antiSnipingExtensionMs: 120_000,
  createdAt: '2026-10-01T11:00:00.000Z',
};

/** Constrói um pacote de auditoria íntegro, exatamente como o servidor faria. */
export function buildBundle(bids: FixtureBid[], options: { settle?: boolean } = {}): AuditBundle {
  const genesisMessage = canonicalLotGenesis(GENESIS);
  const genesisHash = sha256(genesisMessage);
  let prevHash = genesisHash;
  let endsAtMs = Date.parse(GENESIS.originalEndsAt);

  const records = bids.map((bid, index) => {
    const atMs = Date.parse(bid.at);
    endsAtMs = endsAtAfterBid(endsAtMs, atMs, { windowMs: 120_000, extensionMs: 120_000 });
    const fields = {
      lotId: LOT_ID,
      seq: index + 1,
      bidderAlias: bid.alias,
      amountCents: bid.amountCents,
      createdAt: new Date(atMs).toISOString(),
      endsAtAfter: new Date(endsAtMs).toISOString(),
      prevHash,
    };
    const message = canonicalBid(fields);
    const hash = sha256(message);
    prevHash = hash;
    return { ...fields, hash, signature: signWithServerKey(message), keyId: TEST_KEY_ID };
  });

  const state: LotState = options.settle ? 'SETTLED' : 'OPEN';
  const endsAt = new Date(endsAtMs).toISOString();
  const last = records[records.length - 1];

  let receipt: AuditBundle['receipt'] = null;
  if (options.settle && last) {
    const fields = {
      code: 'R3c1b0C0d3x9',
      number: 1,
      lotId: LOT_ID,
      lotTitle: GENESIS.title,
      winnerAlias: last.bidderAlias,
      amountCents: last.amountCents,
      bidCount: records.length,
      headHash: last.hash,
      closedAt: endsAt,
      issuedAt: endsAt,
    };
    const message = canonicalReceipt(fields);
    receipt = { ...fields, payloadHash: sha256(message), signature: signWithServerKey(message), keyId: TEST_KEY_ID };
  }

  return {
    scheme: AUDIT_SCHEME,
    lot: {
      ...GENESIS,
      state,
      endsAt,
      bidCount: records.length,
      currentPriceCents: last ? last.amountCents : null,
      leaderAlias: last ? last.bidderAlias : null,
      genesisHash,
      genesisSignature: signWithServerKey(genesisMessage),
      genesisKeyId: TEST_KEY_ID,
      headHash: prevHash,
      headSignature: signWithServerKey(
        canonicalLotHead({ lotId: LOT_ID, state, bidCount: records.length, headHash: prevHash, endsAt }),
      ),
      headKeyId: TEST_KEY_ID,
    },
    bids: records,
    receipt,
  };
}

export const THREE_BIDS: FixtureBid[] = [
  { alias: 'A1B2C3', amountCents: 100_000, at: '2026-10-01T12:10:00.000Z' },
  { alias: 'D4E5F6', amountCents: 105_000, at: '2026-10-01T12:20:00.000Z' },
  { alias: 'A1B2C3', amountCents: 120_000, at: '2026-10-01T12:30:00.000Z' },
];
