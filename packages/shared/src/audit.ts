import { formatBRL } from './money';
import { endsAtAfterBid, LotState } from './lot-rules';

/**
 * HISTÓRICO À PROVA DE ADULTERAÇÃO
 *
 * Técnica: cadeia de hashes (SHA-256) + assinatura digital (Ed25519) + "selo" assinado do estado do lote.
 *
 * 1. Gênese: ao criar o lote, os termos imutáveis (item, preço inicial, incremento, datas, regra de
 *    prorrogação) são serializados de forma canônica, recebem um hash e são assinados.
 * 2. Cada lance guarda o hash do registro anterior (prevHash). O primeiro aponta para o hash da gênese.
 *    O hash do lance cobre: lote, sequência, pseudônimo do licitante, valor, horário e o prazo final
 *    resultante (prorrogação). Cada lance também é assinado.
 * 3. Selo do lote (head): situação + quantidade de lances + hash do último lance + prazo final atual,
 *    reassinado a cada mudança. Isso detecta remoção ou inserção no FINAL da cadeia, que uma cadeia
 *    de hashes sozinha não detecta.
 *
 * Por que assinatura e não só hash? Quem tem acesso direto ao banco consegue recalcular hashes
 * (SHA-256 é público). Já a chave privada Ed25519 fica apenas na configuração do servidor (variável de
 * ambiente), nunca no banco. A chave PÚBLICA é publicada, então qualquer pessoa consegue verificar,
 * inclusive no próprio navegador, sem confiar na resposta do servidor.
 *
 * A serialização canônica usa JSON.stringify de um ARRAY com ordem fixa de campos: é determinística
 * em qualquer motor JavaScript e o escape de strings do JSON elimina ambiguidade de separadores.
 */
export const AUDIT_SCHEME = 'arremate-audit/v1';
export const AUDIT_SIGNATURE_ALGORITHM = 'Ed25519' as const;

export interface LotGenesisFields {
  lotId: string;
  title: string;
  source: string;
  externalId: string;
  startingPriceCents: number;
  minIncrementCents: number;
  startsAt: string;
  originalEndsAt: string;
  antiSnipingWindowMs: number;
  antiSnipingExtensionMs: number;
  createdAt: string;
}

export function canonicalLotGenesis(f: LotGenesisFields): string {
  return JSON.stringify([
    `${AUDIT_SCHEME}:lot-genesis`,
    f.lotId,
    f.title,
    f.source,
    f.externalId,
    f.startingPriceCents,
    f.minIncrementCents,
    f.startsAt,
    f.originalEndsAt,
    f.antiSnipingWindowMs,
    f.antiSnipingExtensionMs,
    f.createdAt,
  ]);
}

export interface BidChainFields {
  lotId: string;
  seq: number;
  bidderAlias: string;
  amountCents: number;
  createdAt: string;
  /** Prazo final do lote logo após este lance (registra a prorrogação, se houve). */
  endsAtAfter: string;
  prevHash: string;
}

export function canonicalBid(f: BidChainFields): string {
  return JSON.stringify([
    `${AUDIT_SCHEME}:bid`,
    f.lotId,
    f.seq,
    f.bidderAlias,
    f.amountCents,
    f.createdAt,
    f.endsAtAfter,
    f.prevHash,
  ]);
}

export interface LotHeadFields {
  lotId: string;
  state: LotState;
  bidCount: number;
  headHash: string;
  endsAt: string;
}

export function canonicalLotHead(f: LotHeadFields): string {
  return JSON.stringify([`${AUDIT_SCHEME}:lot-head`, f.lotId, f.state, f.bidCount, f.headHash, f.endsAt]);
}

export interface ReceiptFields {
  code: string;
  number: number;
  lotId: string;
  lotTitle: string;
  winnerAlias: string;
  amountCents: number;
  bidCount: number;
  headHash: string;
  closedAt: string;
  issuedAt: string;
}

export function canonicalReceipt(f: ReceiptFields): string {
  return JSON.stringify([
    `${AUDIT_SCHEME}:receipt`,
    f.code,
    f.number,
    f.lotId,
    f.lotTitle,
    f.winnerAlias,
    f.amountCents,
    f.bidCount,
    f.headHash,
    f.closedAt,
    f.issuedAt,
  ]);
}

/* ------------------------------------------------------------------------------------------------
 * Pacote público de auditoria: tudo que um terceiro precisa para verificar o lote sozinho.
 * Não contém nenhum dado pessoal: licitantes aparecem apenas por pseudônimo.
 * ---------------------------------------------------------------------------------------------- */

export interface AuditLotRecord extends LotGenesisFields {
  state: LotState;
  endsAt: string;
  bidCount: number;
  currentPriceCents: number | null;
  leaderAlias: string | null;
  genesisHash: string;
  genesisSignature: string;
  genesisKeyId: string;
  headHash: string;
  headSignature: string;
  headKeyId: string;
}

export interface AuditBidRecord extends BidChainFields {
  hash: string;
  signature: string;
  keyId: string;
}

export interface AuditReceiptRecord extends ReceiptFields {
  payloadHash: string;
  signature: string;
  keyId: string;
}

export interface AuditBundle {
  scheme: string;
  lot: AuditLotRecord;
  bids: AuditBidRecord[];
  receipt: AuditReceiptRecord | null;
}

export type SignatureCheck = 'VALID' | 'INVALID' | 'UNKNOWN_KEY';

/** Abstração de criptografia: Node usa node:crypto, o navegador usa WebCrypto. */
export interface AuditCrypto {
  sha256Hex(message: string): Promise<string>;
  verifySignature(message: string, signatureBase64Url: string, keyId: string): Promise<SignatureCheck>;
}

export type AuditIssueCode =
  | 'SCHEME_UNSUPPORTED'
  | 'GENESIS_HASH_MISMATCH'
  | 'GENESIS_SIGNATURE_INVALID'
  | 'SEQUENCE_GAP'
  | 'SEQUENCE_OUT_OF_ORDER'
  | 'PREV_HASH_MISMATCH'
  | 'BID_HASH_MISMATCH'
  | 'BID_SIGNATURE_INVALID'
  | 'UNKNOWN_SIGNING_KEY'
  | 'HEAD_COUNT_MISMATCH'
  | 'HEAD_HASH_MISMATCH'
  | 'HEAD_SIGNATURE_INVALID'
  | 'RULE_BID_BEFORE_START'
  | 'RULE_BID_AFTER_END'
  | 'RULE_TIME_ORDER'
  | 'RULE_BELOW_MINIMUM'
  | 'RULE_SELF_OUTBID'
  | 'RULE_EXTENSION_MISMATCH'
  | 'STATE_ENDS_AT_MISMATCH'
  | 'STATE_PRICE_MISMATCH'
  | 'STATE_LEADER_MISMATCH'
  | 'RECEIPT_MISSING'
  | 'RECEIPT_UNEXPECTED'
  | 'RECEIPT_MISMATCH'
  | 'RECEIPT_HASH_MISMATCH'
  | 'RECEIPT_SIGNATURE_INVALID'
  | 'IDENTITY_BINDING_MISMATCH';

export type AuditCheckId = 'GENESIS' | 'CHAIN' | 'SIGNATURES' | 'HEAD' | 'RULES' | 'RECEIPT' | 'IDENTITIES';

export interface AuditIssue {
  code: AuditIssueCode;
  check: AuditCheckId;
  message: string;
  seq?: number;
}

export interface AuditCheck {
  id: AuditCheckId;
  label: string;
  ok: boolean;
  detail: string;
}

export interface AuditReport {
  verdict: 'INTACT' | 'TAMPERED';
  scheme: string;
  bidCount: number;
  checks: AuditCheck[];
  issues: AuditIssue[];
}

const CHECK_LABELS: Record<AuditCheckId, string> = {
  GENESIS: 'Termos do lote',
  CHAIN: 'Encadeamento dos lances',
  SIGNATURES: 'Assinaturas digitais',
  HEAD: 'Selo de estado do lote',
  RULES: 'Regras de lance reproduzidas',
  RECEIPT: 'Comprovante de arremate',
  IDENTITIES: 'Vínculo dos pseudônimos',
};

/**
 * Verifica um pacote de auditoria inteiro. Não para no primeiro problema: lista todos, para que a
 * página de auditoria consiga dizer exatamente O QUE foi adulterado (e em qual lance).
 */
export async function verifyAuditBundle(bundle: AuditBundle, crypto: AuditCrypto): Promise<AuditReport> {
  const issues: AuditIssue[] = [];
  const add = (check: AuditCheckId, code: AuditIssueCode, message: string, seq?: number) =>
    issues.push(seq === undefined ? { check, code, message } : { check, code, message, seq });

  const { lot } = bundle;
  const bids = [...bundle.bids].sort((a, b) => a.seq - b.seq);

  if (bundle.scheme !== AUDIT_SCHEME) {
    add('GENESIS', 'SCHEME_UNSUPPORTED', `Esquema de auditoria desconhecido: ${bundle.scheme}.`);
  }

  // 1) Gênese: termos imutáveis do lote.
  const genesisMessage = canonicalLotGenesis(lot);
  if ((await crypto.sha256Hex(genesisMessage)) !== lot.genesisHash) {
    add(
      'GENESIS',
      'GENESIS_HASH_MISMATCH',
      'Os termos do lote (item, lance inicial, incremento, datas ou regra de prorrogação) não conferem com o registro feito na criação.',
    );
  }
  const genesisSignature = await crypto.verifySignature(genesisMessage, lot.genesisSignature, lot.genesisKeyId);
  if (genesisSignature !== 'VALID') {
    add(
      'SIGNATURES',
      genesisSignature === 'UNKNOWN_KEY' ? 'UNKNOWN_SIGNING_KEY' : 'GENESIS_SIGNATURE_INVALID',
      genesisSignature === 'UNKNOWN_KEY'
        ? 'Os termos do lote foram assinados por uma chave desconhecida.'
        : 'A assinatura digital dos termos do lote é inválida.',
    );
  }

  // 2) Cadeia de lances: sequência, encadeamento, hash e assinatura de cada registro.
  let validBidSignatures = 0;
  let previousSeq = 0;
  for (let i = 0; i < bids.length; i++) {
    const bid = bids[i];

    if (bid.seq > previousSeq + 1) {
      const missingFrom = previousSeq + 1;
      const missingTo = bid.seq - 1;
      add(
        'CHAIN',
        'SEQUENCE_GAP',
        missingFrom === missingTo
          ? `O lance #${missingFrom} foi removido do histórico.`
          : `Os lances #${missingFrom} a #${missingTo} foram removidos do histórico.`,
        bid.seq,
      );
    } else if (bid.seq <= previousSeq) {
      add(
        'CHAIN',
        'SEQUENCE_OUT_OF_ORDER',
        `Existe mais de um registro com a sequência #${bid.seq}: um lance foi inserido depois.`,
        bid.seq,
      );
    }
    previousSeq = Math.max(previousSeq, bid.seq);

    const expectedPrevHash = i === 0 ? lot.genesisHash : bids[i - 1].hash;
    if (bid.prevHash !== expectedPrevHash) {
      add(
        'CHAIN',
        'PREV_HASH_MISMATCH',
        `Encadeamento quebrado no lance #${bid.seq}: ele não aponta para o registro anterior do histórico.`,
        bid.seq,
      );
    }

    const message = canonicalBid(bid);
    if ((await crypto.sha256Hex(message)) !== bid.hash) {
      add(
        'CHAIN',
        'BID_HASH_MISMATCH',
        `O conteúdo do lance #${bid.seq} foi alterado depois de registrado (o hash não confere).`,
        bid.seq,
      );
    }

    const signature = await crypto.verifySignature(message, bid.signature, bid.keyId);
    if (signature === 'VALID') {
      validBidSignatures++;
    } else {
      add(
        'SIGNATURES',
        signature === 'UNKNOWN_KEY' ? 'UNKNOWN_SIGNING_KEY' : 'BID_SIGNATURE_INVALID',
        signature === 'UNKNOWN_KEY'
          ? `O lance #${bid.seq} foi assinado por uma chave desconhecida.`
          : `A assinatura digital do lance #${bid.seq} é inválida: o registro não foi produzido pelo servidor.`,
        bid.seq,
      );
    }
  }

  // 3) Selo do lote: protege o FINAL da cadeia (remoção ou inserção do último lance) e o estado.
  const expectedHeadHash = bids.length > 0 ? bids[bids.length - 1].hash : lot.genesisHash;
  if (lot.bidCount !== bids.length) {
    add(
      'HEAD',
      'HEAD_COUNT_MISMATCH',
      `O selo assinado do lote registra ${lot.bidCount} lance(s), mas o histórico tem ${bids.length}: houve remoção ou inserção de lances.`,
    );
  }
  if (lot.headHash !== expectedHeadHash) {
    add('HEAD', 'HEAD_HASH_MISMATCH', 'O último lance do histórico não é o mesmo registrado no selo assinado do lote.');
  }
  const headSignature = await crypto.verifySignature(
    canonicalLotHead({
      lotId: lot.lotId,
      state: lot.state,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      endsAt: lot.endsAt,
    }),
    lot.headSignature,
    lot.headKeyId,
  );
  if (headSignature !== 'VALID') {
    add(
      'HEAD',
      headSignature === 'UNKNOWN_KEY' ? 'UNKNOWN_SIGNING_KEY' : 'HEAD_SIGNATURE_INVALID',
      'O estado do lote (situação, prazo final ou quantidade de lances) foi alterado fora do sistema.',
    );
  }

  // 4) Regras de negócio reproduzidas lance a lance (mínimo, incremento, janela, prorrogação).
  const policy = { windowMs: lot.antiSnipingWindowMs, extensionMs: lot.antiSnipingExtensionMs };
  const startsAtMs = Date.parse(lot.startsAt);
  let endsAtMs = Date.parse(lot.originalEndsAt);
  let price: number | null = null;
  let leader: string | null = null;
  let lastBidAtMs = Number.NEGATIVE_INFINITY;

  for (const bid of bids) {
    const bidAtMs = Date.parse(bid.createdAt);
    if (bidAtMs < startsAtMs) {
      add('RULES', 'RULE_BID_BEFORE_START', `O lance #${bid.seq} foi registrado antes da abertura do lote.`, bid.seq);
    }
    if (bidAtMs >= endsAtMs) {
      add('RULES', 'RULE_BID_AFTER_END', `O lance #${bid.seq} foi registrado depois do encerramento do lote.`, bid.seq);
    }
    if (bidAtMs < lastBidAtMs) {
      add('RULES', 'RULE_TIME_ORDER', `O lance #${bid.seq} tem horário anterior ao lance que o precede.`, bid.seq);
    }
    const minimum = price === null ? lot.startingPriceCents : price + lot.minIncrementCents;
    if (bid.amountCents < minimum) {
      add(
        'RULES',
        'RULE_BELOW_MINIMUM',
        `O lance #${bid.seq} (${formatBRL(bid.amountCents)}) está abaixo do mínimo permitido naquele momento (${formatBRL(minimum)}).`,
        bid.seq,
      );
    }
    if (leader !== null && bid.bidderAlias === leader) {
      add('RULES', 'RULE_SELF_OUTBID', `No lance #${bid.seq} o licitante líder cobriu o próprio lance.`, bid.seq);
    }
    const expectedEndsAtMs = endsAtAfterBid(endsAtMs, bidAtMs, policy);
    if (Date.parse(bid.endsAtAfter) !== expectedEndsAtMs) {
      add(
        'RULES',
        'RULE_EXTENSION_MISMATCH',
        `O prazo final registrado após o lance #${bid.seq} não segue a regra de prorrogação.`,
        bid.seq,
      );
    }
    endsAtMs = expectedEndsAtMs;
    price = bid.amountCents;
    leader = bid.bidderAlias;
    lastBidAtMs = bidAtMs;
  }

  if (Date.parse(lot.endsAt) !== endsAtMs) {
    add(
      'HEAD',
      'STATE_ENDS_AT_MISMATCH',
      'O prazo final atual do lote não corresponde ao histórico de lances e prorrogações.',
    );
  }
  if (lot.currentPriceCents !== price) {
    add(
      'HEAD',
      'STATE_PRICE_MISMATCH',
      'O lance atual exibido pelo lote não corresponde ao último lance do histórico.',
    );
  }
  if (lot.leaderAlias !== leader) {
    add(
      'HEAD',
      'STATE_LEADER_MISMATCH',
      'O líder atual do lote não corresponde ao autor do último lance do histórico.',
    );
  }

  // 5) Comprovante de arremate.
  const receiptApplies = lot.state === 'SETTLED' && bids.length > 0;
  if (receiptApplies && !bundle.receipt) {
    add('RECEIPT', 'RECEIPT_MISSING', 'O lote foi arrematado, mas o comprovante não foi encontrado.');
  }
  if (bundle.receipt) {
    const receipt = bundle.receipt;
    if (!receiptApplies) {
      add('RECEIPT', 'RECEIPT_UNEXPECTED', 'Existe um comprovante para um lote que não foi arrematado.');
    } else {
      const last = bids[bids.length - 1];
      const matches =
        receipt.lotId === lot.lotId &&
        receipt.winnerAlias === last.bidderAlias &&
        receipt.amountCents === last.amountCents &&
        receipt.bidCount === bids.length &&
        receipt.headHash === last.hash &&
        receipt.closedAt === lot.endsAt;
      if (!matches) {
        add(
          'RECEIPT',
          'RECEIPT_MISMATCH',
          'O comprovante não corresponde ao fim do histórico (vencedor, valor, encerramento ou quantidade de lances divergem).',
        );
      }
    }
    const receiptMessage = canonicalReceipt(receipt);
    if ((await crypto.sha256Hex(receiptMessage)) !== receipt.payloadHash) {
      add('RECEIPT', 'RECEIPT_HASH_MISMATCH', 'O conteúdo do comprovante foi alterado depois de emitido.');
    }
    const receiptSignature = await crypto.verifySignature(receiptMessage, receipt.signature, receipt.keyId);
    if (receiptSignature !== 'VALID') {
      add('RECEIPT', 'RECEIPT_SIGNATURE_INVALID', 'A assinatura digital do comprovante é inválida.');
    }
  }

  const failed = (id: AuditCheckId) => issues.some((issue) => issue.check === id);
  // O texto acompanha o resultado: uma verificação reprovada nunca exibe a frase de sucesso.
  const check = (id: AuditCheckId, passedDetail: string, failedDetail: string): AuditCheck => ({
    id,
    label: CHECK_LABELS[id],
    ok: !failed(id),
    detail: failed(id) ? failedDetail : passedDetail,
  });
  const checks: AuditCheck[] = [
    check(
      'GENESIS',
      'Item, lance inicial, incremento, datas e regra de prorrogação conferem com o registro assinado na criação.',
      'Os termos gravados (item, valores, datas ou regra de prorrogação) não conferem com o registro assinado na criação.',
    ),
    check(
      'CHAIN',
      `${bids.length} lance(s) encadeados por SHA-256, cada um apontando para o anterior, sem lacunas.`,
      'O encadeamento SHA-256 foi quebrado: há lance alterado, removido, inserido ou fora de ordem.',
    ),
    check(
      'SIGNATURES',
      `${validBidSignatures} de ${bids.length} lance(s) com assinatura Ed25519 válida.`,
      `${validBidSignatures} de ${bids.length} lance(s) com assinatura Ed25519 válida: há registro que não foi assinado pelo servidor.`,
    ),
    check(
      'HEAD',
      'Quantidade de lances, último lance, prazo final, líder e situação conferem com o selo assinado.',
      'O estado atual do lote (lances, último lance, prazo final, líder ou situação) não confere com o selo assinado.',
    ),
    check(
      'RULES',
      'Cada lance respeita a janela do lote, o mínimo, o incremento, a vez do líder e a prorrogação.',
      'Há lance que não poderia ter sido aceito pelas regras do lote.',
    ),
    check(
      'RECEIPT',
      receiptApplies || bundle.receipt
        ? 'O comprovante assinado corresponde ao último lance da cadeia.'
        : 'Não se aplica: o lote não foi arrematado (ainda).',
      'O comprovante não confere com a cadeia de lances ou com a assinatura do servidor.',
    ),
  ];

  return {
    verdict: issues.length === 0 ? 'INTACT' : 'TAMPERED',
    scheme: AUDIT_SCHEME,
    bidCount: bids.length,
    checks,
    issues,
  };
}

/**
 * Permite ao servidor anexar verificações que dependem de dados privados (ex.: o vínculo entre o
 * pseudônimo e o licitante real), sem expor esses dados no pacote público.
 */
export function withAdditionalCheck(
  report: AuditReport,
  check: { id: AuditCheckId; detail: string; failedDetail: string },
  extraIssues: AuditIssue[],
): AuditReport {
  const issues = [...report.issues, ...extraIssues];
  const ok = !extraIssues.some((issue) => issue.check === check.id);
  return {
    ...report,
    verdict: issues.length === 0 ? 'INTACT' : 'TAMPERED',
    checks: [
      ...report.checks,
      { id: check.id, label: CHECK_LABELS[check.id], ok, detail: ok ? check.detail : check.failedDetail },
    ],
    issues,
  };
}
