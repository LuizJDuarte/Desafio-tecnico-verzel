import { canonicalLotGenesis } from '@arremate/shared';
import { loadConfig } from '../../config/app-config';
import { LotEntity } from '../../database/entities';
import { AuditSigner } from './audit-signer.service';
import { PseudonymService } from './pseudonym.service';

const config = (overrides: Record<string, string> = {}) =>
  loadConfig({
    NODE_ENV: 'test',
    AUDIT_SIGNING_SECRET: 'segredo-de-teste-123456',
    PSEUDONYM_SECRET: 'outro-segredo-123456',
    ...overrides,
  });

describe('AuditSigner (Ed25519)', () => {
  it('deriva sempre a mesma chave a partir do segredo (necessário para verificar registros antigos)', () => {
    const a = new AuditSigner(config());
    const b = new AuditSigner(config());
    expect(a.keyId).toBe(b.keyId);
    expect(a.publicKeyBase64Url).toHaveLength(43); // 32 bytes em base64url
    expect(a.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('assina e verifica; detecta mensagem alterada e chave desconhecida', () => {
    const signer = new AuditSigner(config());
    const signature = signer.sign('mensagem');
    expect(signer.verify('mensagem', signature, signer.keyId)).toBe('VALID');
    expect(signer.verify('mensagem alterada', signature, signer.keyId)).toBe('INVALID');
    expect(signer.verify('mensagem', 'lixo', signer.keyId)).toBe('INVALID');
    expect(signer.verify('mensagem', signature, 'outra-chave')).toBe('UNKNOWN_KEY');
  });

  it('segredos diferentes geram chaves diferentes (atacante sem o segredo não forja assinaturas)', () => {
    const legit = new AuditSigner(config());
    const attacker = new AuditSigner(config({ AUDIT_SIGNING_SECRET: 'segredo-do-atacante-999' }));
    expect(attacker.keyId).not.toBe(legit.keyId);
    expect(legit.verify('x', attacker.sign('x'), legit.keyId)).toBe('INVALID');
  });

  it('sela a gênese do lote com o hash da serialização canônica', () => {
    const signer = new AuditSigner(config());
    const lot = Object.assign(new LotEntity(), {
      id: '6f1d3c1a-1d7e-4a35-9a43-5f2f0c1b2a10',
      title: 'Water Lilies',
      source: 'artic',
      externalId: '16568',
      startingPriceCents: 100_000,
      minIncrementCents: 5_000,
      startsAt: new Date('2026-10-01T12:00:00Z'),
      originalEndsAt: new Date('2026-10-01T13:00:00Z'),
      antiSnipingWindowMs: 120_000,
      antiSnipingExtensionMs: 120_000,
      createdAt: new Date('2026-10-01T11:00:00Z'),
    });
    signer.sealGenesis(lot);
    const message = canonicalLotGenesis(signer.genesisFieldsOf(lot));
    expect(lot.genesisHash).toBe(signer.sha256Hex(message));
    expect(signer.verify(message, lot.genesisSignature, lot.genesisKeyId)).toBe('VALID');
  });
});

describe('PseudonymService', () => {
  it('é estável no mesmo lote, muda entre lotes e não expõe o id', () => {
    const pseudonyms = new PseudonymService(config());
    const user = '0f8c5b1e-0000-4000-8000-000000000001';
    const a1 = pseudonyms.aliasFor('lote-a', user);
    expect(pseudonyms.aliasFor('lote-a', user)).toBe(a1);
    expect(pseudonyms.aliasFor('lote-b', user)).not.toBe(a1);
    expect(a1).toMatch(/^[0-9A-F]{6}$/);
    expect(user.toUpperCase()).not.toContain(a1);
  });
});
