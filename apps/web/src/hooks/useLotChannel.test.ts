import { describe, expect, it } from 'vitest';
import type { LotBidEvent, LotPageDto } from '@arremate/shared';
import { applyBidEvent } from './useLotChannel';

const page = (alias: string | null, isLeader: boolean): LotPageDto =>
  ({
    lot: {
      id: 'lote-1',
      bidCount: 2,
      currentPriceCents: 20_000,
      minNextBidCents: 21_000,
      endsAt: '2026-11-02T13:00:00.000Z',
      leaderAlias: isLeader ? alias : 'OUTRO1',
      extended: false,
    },
    viewer: { alias, isLeader, hasBid: isLeader, authenticated: true },
    serverTime: '2026-11-02T12:00:00.000Z',
  }) as unknown as LotPageDto;

const event = (leaderAlias: string, bidCount = 3): LotBidEvent => ({
  lotId: 'lote-1',
  bid: {
    seq: bidCount,
    bidderAlias: leaderAlias,
    amountCents: 25_000,
    createdAt: '2026-11-02T12:59:00.000Z',
    endsAtAfter: '2026-11-02T13:01:00.000Z',
    extended: true,
    hash: 'h',
  },
  currentPriceCents: 25_000,
  minNextBidCents: 26_000,
  bidCount,
  endsAt: '2026-11-02T13:01:00.000Z',
  extended: true,
  leaderAlias,
  serverTime: '2026-11-02T12:59:00.000Z',
});

describe('applyBidEvent (atualização da sala em tempo real)', () => {
  it('quem liderava e recebe um lance de outro passa a "superado"', () => {
    const next = applyBidEvent(page('ABC123', true), event('XYZ789'));
    expect(next.viewer.isLeader).toBe(false);
    expect(next.lot).toMatchObject({ currentPriceCents: 25_000, minNextBidCents: 26_000, bidCount: 3, extended: true });
    expect(next.lot.endsAt).toBe('2026-11-02T13:01:00.000Z');
  });

  it('o próprio lance (de outra aba) marca o espectador como líder', () => {
    const next = applyBidEvent(page('ABC123', false), event('ABC123'));
    expect(next.viewer).toMatchObject({ isLeader: true, hasBid: true });
  });

  it('ignora eventos antigos ou repetidos', () => {
    const current = page('ABC123', true);
    expect(applyBidEvent(current, event('XYZ789', 2))).toBe(current);
  });
});
