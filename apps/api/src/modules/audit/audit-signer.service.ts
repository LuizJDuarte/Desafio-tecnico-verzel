import { Injectable } from '@nestjs/common';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import {
  AuditCrypto,
  canonicalLotGenesis,
  canonicalLotHead,
  LotGenesisFields,
  PublicKeyDto,
  SignatureCheck,
} from '@arremate/shared';
import { AppConfig } from '../../config/app-config';
import type { LotEntity } from '../../database/entities';

/** Prefixo DER PKCS#8 de uma chave privada Ed25519 (RFC 8410), seguido da semente de 32 bytes. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Assinatura digital do histórico (Ed25519).
 *
 * A chave privada é derivada de AUDIT_SIGNING_SECRET (variável de ambiente) e NUNCA vai para o banco.
 * Assim, quem tem acesso direto ao PostgreSQL consegue alterar registros, mas não consegue produzir
 * assinaturas válidas para eles. A chave pública é publicada em /api/audit/public-key.
 */
@Injectable()
export class AuditSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  readonly keyId: string;
  readonly publicKeyBase64Url: string;
  readonly publicKeyPem: string;

  constructor(config: AppConfig) {
    const seed = createHash('sha256')
      .update(`arremate-audit-signing-key/v1:${config.audit.signingSecret}`, 'utf8')
      .digest();
    this.privateKey = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
    this.publicKey = createPublicKey(this.privateKey);
    const jwk = this.publicKey.export({ format: 'jwk' }) as { x: string };
    this.publicKeyBase64Url = jwk.x;
    this.publicKeyPem = this.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    this.keyId = createHash('sha256').update(Buffer.from(jwk.x, 'base64url')).digest('hex').slice(0, 16);
  }

  sha256Hex(message: string): string {
    return createHash('sha256').update(message, 'utf8').digest('hex');
  }

  sign(message: string): string {
    return cryptoSign(null, Buffer.from(message, 'utf8'), this.privateKey).toString('base64url');
  }

  verify(message: string, signature: string, keyId: string): SignatureCheck {
    if (keyId !== this.keyId) return 'UNKNOWN_KEY';
    try {
      const ok = cryptoVerify(null, Buffer.from(message, 'utf8'), this.publicKey, Buffer.from(signature, 'base64url'));
      return ok ? 'VALID' : 'INVALID';
    } catch {
      return 'INVALID';
    }
  }

  /** Adaptador usado pelo verificador compartilhado (o mesmo código roda no navegador). */
  get crypto(): AuditCrypto {
    return {
      sha256Hex: async (message) => this.sha256Hex(message),
      verifySignature: async (message, signature, keyId) => this.verify(message, signature, keyId),
    };
  }

  publicKeyDto(): PublicKeyDto {
    return {
      algorithm: 'Ed25519',
      keyId: this.keyId,
      publicKey: this.publicKeyBase64Url,
      publicKeyPem: this.publicKeyPem,
    };
  }

  genesisFieldsOf(lot: LotEntity): LotGenesisFields {
    return {
      lotId: lot.id,
      title: lot.title,
      source: lot.source,
      externalId: lot.externalId,
      startingPriceCents: lot.startingPriceCents,
      minIncrementCents: lot.minIncrementCents,
      startsAt: lot.startsAt.toISOString(),
      originalEndsAt: lot.originalEndsAt.toISOString(),
      antiSnipingWindowMs: lot.antiSnipingWindowMs,
      antiSnipingExtensionMs: lot.antiSnipingExtensionMs,
      createdAt: lot.createdAt.toISOString(),
    };
  }

  /** Calcula e assina a gênese do lote (termos imutáveis). Chamado uma única vez, na criação. */
  sealGenesis(lot: LotEntity): void {
    const message = canonicalLotGenesis(this.genesisFieldsOf(lot));
    lot.genesisHash = this.sha256Hex(message);
    lot.genesisSignature = this.sign(message);
    lot.genesisKeyId = this.keyId;
  }

  /** Reassina o selo do lote. Chamado em TODA mudança de lances, prazo final ou situação. */
  sealHead(lot: LotEntity): void {
    lot.headSignature = this.sign(
      canonicalLotHead({
        lotId: lot.id,
        state: lot.state,
        bidCount: lot.bidCount,
        headHash: lot.headHash,
        endsAt: lot.endsAt.toISOString(),
      }),
    );
    lot.headKeyId = this.keyId;
  }
}
