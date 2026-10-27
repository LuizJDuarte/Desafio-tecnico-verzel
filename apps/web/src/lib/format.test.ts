import { describe, expect, it } from 'vitest';
import { formatDuration, localInputToIso, pluralize, toLocalInputValue } from './format';

describe('formatDuration', () => {
  it('mostra dias, horas e minutos quando falta mais de um dia', () => {
    expect(formatDuration((2 * 86_400 + 4 * 3600 + 12 * 60 + 30) * 1000)).toBe('2d 04h 12m');
  });

  it('mostra hh:mm:ss abaixo de um dia e mm:ss abaixo de uma hora', () => {
    expect(formatDuration((3 * 3600 + 5 * 60 + 9) * 1000)).toBe('03:05:09');
    expect(formatDuration((1 * 60 + 59) * 1000)).toBe('01:59');
  });

  it('nunca fica negativo', () => {
    expect(formatDuration(-5000)).toBe('00:00');
  });
});

describe('datas de formulário', () => {
  it('converte o valor local do input em ISO e volta', () => {
    const local = toLocalInputValue(new Date(2026, 10, 2, 14, 30));
    expect(local).toBe('2026-11-02T14:30');
    const iso = localInputToIso(local)!;
    expect(new Date(iso).getHours()).toBe(14);
    expect(localInputToIso('')).toBeNull();
  });
});

describe('pluralize', () => {
  it('concorda com a quantidade', () => {
    expect(pluralize(1, 'lance', 'lances')).toBe('1 lance');
    expect(pluralize(3, 'lance', 'lances')).toBe('3 lances');
  });
});
