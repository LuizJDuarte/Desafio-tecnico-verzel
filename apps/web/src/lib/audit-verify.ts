import {
  type AuditBundle,
  type AuditCrypto,
  type AuditReport,
  canonicalReceipt,
  type PublicKeyDto,
  type ReceiptDto,
  type SignatureCheck,
  verifyAuditBundle,
} from '@arremate/shared';

const encoder = new TextEncoder();

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type VerificationEngine = 'webcrypto' | 'noble';

async function browserCrypto(publicKey: PublicKeyDto): Promise<{ crypto: AuditCrypto; engine: VerificationEngine }> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('A verificação local exige HTTPS (WebCrypto indisponível nesta página).');
  }
  const subtle = globalThis.crypto.subtle;
  const rawKey = base64UrlToBytes(publicKey.publicKey);

  let engine: VerificationEngine = 'webcrypto';
  let verifyBytes: (signature: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>) => Promise<boolean>;
  try {
    const key = await subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, ['verify']);
    verifyBytes = (signature, message) => subtle.verify({ name: 'Ed25519' }, key, signature, message);
  } catch {
    engine = 'noble';
    const ed = await import('@noble/ed25519');
    verifyBytes = (signature, message) => ed.verifyAsync(signature, message, rawKey);
  }

  const crypto: AuditCrypto = {
    sha256Hex: async (message) => toHex(await subtle.digest('SHA-256', encoder.encode(message))),
    verifySignature: async (message, signature, keyId): Promise<SignatureCheck> => {
      if (keyId !== publicKey.keyId) return 'UNKNOWN_KEY';
      try {
        return (await verifyBytes(base64UrlToBytes(signature), encoder.encode(message))) ? 'VALID' : 'INVALID';
      } catch {
        return 'INVALID';
      }
    },
  };
  return { crypto, engine };
}

/**
 * Verificação independente no navegador: recalcula os hashes (SHA-256) e confere as assinaturas
 * Ed25519 com a chave pública, usando o MESMO verificador da API (pacote compartilhado).
 * Usa a WebCrypto nativa; se o navegador não suportar Ed25519, cai para a biblioteca @noble/ed25519.
 */
export async function verifyInBrowser(
  bundle: AuditBundle,
  publicKey: PublicKeyDto,
): Promise<{ report: AuditReport; engine: VerificationEngine }> {
  const { crypto, engine } = await browserCrypto(publicKey);
  return { report: await verifyAuditBundle(bundle, crypto), engine };
}

/** Confere se o comprovante exibido é exatamente o que o servidor assinou. */
export async function verifyReceiptInBrowser(receipt: ReceiptDto, publicKey: PublicKeyDto): Promise<boolean> {
  const { crypto } = await browserCrypto(publicKey);
  const message = canonicalReceipt({
    code: receipt.code,
    number: receipt.number,
    lotId: receipt.lot.id,
    lotTitle: receipt.lot.title,
    winnerAlias: receipt.winnerAlias,
    amountCents: receipt.amountCents,
    bidCount: receipt.bidCount,
    headHash: receipt.headHash,
    closedAt: receipt.closedAt,
    issuedAt: receipt.issuedAt,
  });
  const hashOk = (await crypto.sha256Hex(message)) === receipt.payloadHash;
  const signature = await crypto.verifySignature(message, receipt.signature, receipt.keyId);
  return hashOk && signature === 'VALID';
}
