import { formatBRL } from './money';

/**
 * Motivos de recusa de lance. A API responde 422 com { code, message, details } e o front
 * monta a mensagem final com esta mesma tabela (inclusive com datas no fuso do usuário).
 */
export const BID_REJECTION_CODES = [
  'LOT_NOT_STARTED',
  'LOT_CLOSED',
  'LOT_CANCELLED',
  'BELOW_MINIMUM',
  'ALREADY_WINNING',
  'INSUFFICIENT_FUNDS',
  'ROLE_NOT_ALLOWED',
] as const;

export type BidRejectionCode = (typeof BID_REJECTION_CODES)[number];

export interface BidRejectionDetails {
  minimumCents?: number;
  isFirstBid?: boolean;
  availableCents?: number;
  amountCents?: number;
  startsAt?: string;
  endsAt?: string;
}

export function isBidRejectionCode(code: unknown): code is BidRejectionCode {
  return typeof code === 'string' && (BID_REJECTION_CODES as readonly string[]).includes(code);
}

const TITLES: Record<BidRejectionCode, string> = {
  LOT_NOT_STARTED: 'Lote ainda não iniciado',
  LOT_CLOSED: 'Lote encerrado',
  LOT_CANCELLED: 'Lote cancelado',
  BELOW_MINIMUM: 'Lance abaixo do mínimo',
  ALREADY_WINNING: 'Você já está ganhando',
  INSUFFICIENT_FUNDS: 'Saldo insuficiente',
  ROLE_NOT_ALLOWED: 'Ação não permitida',
};

export function bidRejectionTitle(code: BidRejectionCode): string {
  return TITLES[code];
}

/**
 * @param formatDate opcional: o front passa um formatador no fuso local do usuário.
 *                   A API não formata datas, porque o servidor roda em UTC.
 */
export function bidRejectionMessage(
  code: BidRejectionCode,
  details: BidRejectionDetails = {},
  formatDate?: (iso: string) => string,
): string {
  switch (code) {
    case 'LOT_NOT_STARTED':
      return details.startsAt && formatDate
        ? `Este lote ainda não começou. Os lances abrem em ${formatDate(details.startsAt)}.`
        : 'Este lote ainda não começou. Aguarde a abertura dos lances.';
    case 'LOT_CLOSED':
      return 'Este lote já foi encerrado e não aceita mais lances.';
    case 'LOT_CANCELLED':
      return 'Este lote foi cancelado pelo leiloeiro e não aceita lances.';
    case 'BELOW_MINIMUM':
      if (details.minimumCents === undefined) return 'O valor está abaixo do lance mínimo permitido.';
      return details.isFirstBid
        ? `O primeiro lance precisa ser de pelo menos ${formatBRL(details.minimumCents)} (lance inicial).`
        : `Lance abaixo do mínimo. Agora o menor lance aceito é ${formatBRL(details.minimumCents)} (lance atual + incremento).`;
    case 'ALREADY_WINNING':
      return 'Você já é o líder deste lote. Não é possível cobrir o próprio lance.';
    case 'INSUFFICIENT_FUNDS':
      if (details.availableCents === undefined) return 'Saldo disponível insuficiente para este lance.';
      return `Saldo insuficiente: seu saldo disponível é ${formatBRL(details.availableCents)}${
        details.amountCents !== undefined ? ` e o lance é de ${formatBRL(details.amountCents)}` : ''
      }. Faça um depósito na carteira para continuar.`;
    case 'ROLE_NOT_ALLOWED':
      return 'Leiloeiros não podem dar lances. Entre com uma conta de licitante.';
  }
}
