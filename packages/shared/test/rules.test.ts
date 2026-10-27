import { describe, expect, it } from 'vitest';
import {
  bidRejectionMessage,
  centsToInputValue,
  computeLotPhase,
  endsAtAfterBid,
  formatBRL,
  minimumNextBidCents,
  parseBRLToCents,
} from '../src';

const at = (iso: string) => Date.parse(iso);

describe('computeLotPhase', () => {
  const lot = { state: 'OPEN' as const, startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-01T13:00:00Z' };

  it('agendado antes do início, ao vivo entre início e fim, encerrado a partir do fim', () => {
    expect(computeLotPhase(lot, at('2026-10-01T11:59:59Z'))).toBe('SCHEDULED');
    expect(computeLotPhase(lot, at('2026-10-01T12:00:00Z'))).toBe('LIVE');
    expect(computeLotPhase(lot, at('2026-10-01T12:59:59.999Z'))).toBe('LIVE');
    expect(computeLotPhase(lot, at('2026-10-01T13:00:00Z'))).toBe('CLOSED');
  });

  it('respeita estados persistidos', () => {
    expect(computeLotPhase({ ...lot, state: 'CANCELLED' }, at('2026-10-01T12:30:00Z'))).toBe('CANCELLED');
    expect(computeLotPhase({ ...lot, state: 'SETTLED' }, at('2026-10-01T12:30:00Z'))).toBe('CLOSED');
  });
});

describe('minimumNextBidCents', () => {
  it('primeiro lance >= lance inicial; seguintes >= atual + incremento', () => {
    const base = { startingPriceCents: 10_000, minIncrementCents: 500 };
    expect(minimumNextBidCents({ ...base, bidCount: 0, currentPriceCents: null })).toBe(10_000);
    expect(minimumNextBidCents({ ...base, bidCount: 3, currentPriceCents: 12_000 })).toBe(12_500);
  });
});

describe('endsAtAfterBid (anti-sniping)', () => {
  const end = at('2026-10-01T13:00:00Z');

  it('não prorroga lances fora dos últimos 2 minutos', () => {
    expect(endsAtAfterBid(end, at('2026-10-01T12:57:59Z'))).toBe(end);
  });

  it('lance nos últimos 2 minutos garante 2 minutos a partir do lance', () => {
    expect(endsAtAfterBid(end, at('2026-10-01T12:59:30Z'))).toBe(at('2026-10-01T13:01:30Z'));
    expect(endsAtAfterBid(end, at('2026-10-01T12:58:00Z'))).toBe(end);
  });

  it('prorrogações sucessivas não acumulam além de 2 minutos após o último lance', () => {
    let current = end;
    current = endsAtAfterBid(current, at('2026-10-01T12:59:50Z'));
    current = endsAtAfterBid(current, at('2026-10-01T12:59:55Z'));
    expect(current).toBe(at('2026-10-01T13:01:55Z'));
  });
});

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatBRL(123456)).toMatch(/R\$\s1\.234,56/);
    expect(centsToInputValue(123456)).toBe('1.234,56');
  });

  it.each([
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['R$ 2.500', 250000],
    ['1234.56', 123456],
    ['10', 1000],
    [',50', 50],
  ])('converte "%s" em %i centavos', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '1,2,3', '1,234', '12.3.4,5', '-5'])('rejeita "%s"', (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });
});

describe('mensagens de lance recusado', () => {
  it('explica cada motivo pedido no desafio', () => {
    expect(bidRejectionMessage('BELOW_MINIMUM', { minimumCents: 12_500 })).toContain('125,00');
    expect(bidRejectionMessage('BELOW_MINIMUM', { minimumCents: 10_000, isFirstBid: true })).toContain(
      'primeiro lance',
    );
    expect(bidRejectionMessage('INSUFFICIENT_FUNDS', { availableCents: 5_000, amountCents: 9_000 })).toContain(
      'Saldo insuficiente',
    );
    expect(bidRejectionMessage('ALREADY_WINNING')).toContain('líder');
    expect(bidRejectionMessage('LOT_NOT_STARTED')).toContain('ainda não começou');
    expect(bidRejectionMessage('LOT_CLOSED')).toContain('encerrado');
  });

  it('usa o formatador de data do cliente quando informado', () => {
    const message = bidRejectionMessage(
      'LOT_NOT_STARTED',
      { startsAt: '2026-10-01T12:00:00Z' },
      () => '01/10 às 09:00',
    );
    expect(message).toContain('01/10 às 09:00');
  });
});
