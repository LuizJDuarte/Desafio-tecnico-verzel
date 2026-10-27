/**
 * Regras de domínio dos lotes, puras e sem dependência de infraestrutura.
 * As mesmas funções são usadas pela API (para decidir) e pela auditoria (para reproduzir o histórico),
 * o que garante que o verificador público aplica exatamente a regra que o servidor aplicou.
 */

/** Estado persistido do lote. O relógio decide se ele está agendado, ao vivo ou encerrado. */
export type LotState = 'OPEN' | 'CANCELLED' | 'SETTLED';

/** Fase exibida ao usuário, derivada do estado persistido + relógio. */
export type LotPhase = 'SCHEDULED' | 'LIVE' | 'CLOSED' | 'CANCELLED';

type TimeLike = string | number | Date;

export function toEpochMs(value: TimeLike): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return value.getTime();
}

export interface LotTiming {
  state: LotState;
  startsAt: TimeLike;
  endsAt: TimeLike;
}

/**
 * O relógio é a fonte da verdade: um lote OPEN cujo fim já passou é exibido como encerrado
 * mesmo que a liquidação ainda não tenha rodado (ela acontece em seguida, de forma idempotente).
 */
export function computeLotPhase(lot: LotTiming, now: TimeLike): LotPhase {
  if (lot.state === 'CANCELLED') return 'CANCELLED';
  if (lot.state === 'SETTLED') return 'CLOSED';
  const t = toEpochMs(now);
  if (t < toEpochMs(lot.startsAt)) return 'SCHEDULED';
  if (t >= toEpochMs(lot.endsAt)) return 'CLOSED';
  return 'LIVE';
}

export interface LotPricing {
  bidCount: number;
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number | null;
}

/**
 * Primeiro lance: maior ou igual ao lance inicial.
 * Lances seguintes: maiores ou iguais ao lance atual + incremento mínimo.
 */
export function minimumNextBidCents(lot: LotPricing): number {
  if (lot.bidCount === 0 || lot.currentPriceCents === null) return lot.startingPriceCents;
  return lot.currentPriceCents + lot.minIncrementCents;
}

export interface AntiSnipingPolicy {
  /** Janela final em que um lance aceito provoca prorrogação. */
  windowMs: number;
  /** Tempo garantido depois do lance que caiu na janela. */
  extensionMs: number;
}

export const DEFAULT_ANTI_SNIPING_POLICY: AntiSnipingPolicy = {
  windowMs: 2 * 60_000,
  extensionMs: 2 * 60_000,
};

/**
 * Prorrogação (anti-sniping): "lance aceito nos últimos 2 minutos estende o fim do lote para +2 minutos".
 * Interpretação adotada: o novo fim passa a ser (momento do lance + 2 min). Assim sempre existem pelo
 * menos 2 minutos para os demais licitantes reagirem a um lance de última hora, e várias prorrogações
 * seguidas não acumulam tempo artificialmente. O fim nunca é antecipado (Math.max).
 */
export function endsAtAfterBid(
  currentEndsAtMs: number,
  bidAtMs: number,
  policy: AntiSnipingPolicy = DEFAULT_ANTI_SNIPING_POLICY,
): number {
  const remainingMs = currentEndsAtMs - bidAtMs;
  if (remainingMs > policy.windowMs) return currentEndsAtMs;
  return Math.max(currentEndsAtMs, bidAtMs + policy.extensionMs);
}

export const LOT_LIMITS = {
  /** R$ 1,00 */
  minPriceCents: 100,
  /** R$ 100 milhões */
  maxPriceCents: 10_000_000_000,
  /** R$ 1,00 */
  minIncrementCents: 100,
  /** R$ 10 milhões */
  maxIncrementCents: 1_000_000_000,
  /** 1 minuto: curto o bastante para testar prorrogação e liquidação sem esperar muito. */
  minDurationMs: 60_000,
  /** 60 dias */
  maxDurationMs: 60 * 24 * 60 * 60_000,
  /** O lote pode ser agendado para começar em até 180 dias. */
  maxStartAheadMs: 180 * 24 * 60 * 60_000,
  /** Tolerância para "começar agora" quando o relógio do navegador está levemente atrasado. */
  startGraceMs: 60_000,
} as const;

export const WALLET_LIMITS = {
  /** R$ 1,00 */
  minDepositCents: 100,
  /** R$ 1 milhão por depósito simulado */
  maxDepositCents: 100_000_000,
} as const;

/** R$ 1 bilhão: teto de sanidade para qualquer lance. */
export const MAX_BID_CENTS = 100_000_000_000;
