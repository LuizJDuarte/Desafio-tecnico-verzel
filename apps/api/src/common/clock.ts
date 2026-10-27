import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

/**
 * Relógio injetável. Toda regra temporal (lote ao vivo, prorrogação, liquidação) usa esta classe
 * em vez de chamar Date.now() espalhado pelo código. Isso torna o tempo controlável nos testes
 * (por exemplo, "pular" para os últimos 2 minutos do lote) sem esperar o relógio de verdade.
 */
@Injectable()
export class Clock {
  private frozenAt: number | null = null;

  constructor(private readonly config: AppConfig) {}

  now(): Date {
    return new Date(this.frozenAt ?? Date.now());
  }

  /** Apenas testes: congela o relógio em um instante. */
  freeze(at: Date): void {
    this.assertNotProduction();
    this.frozenAt = at.getTime();
  }

  /** Apenas testes: avança o relógio congelado. */
  advance(ms: number): void {
    this.assertNotProduction();
    if (this.frozenAt === null) this.frozenAt = Date.now();
    this.frozenAt += ms;
  }

  unfreeze(): void {
    this.frozenAt = null;
  }

  private assertNotProduction(): void {
    if (this.config.isProduction) {
      throw new Error('O relógio não pode ser manipulado em produção.');
    }
  }
}
