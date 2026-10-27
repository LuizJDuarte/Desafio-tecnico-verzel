import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/** 40001 = serialization_failure, 40P01 = deadlock_detected, 55P03 = lock_not_available */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01', '55P03']);

function sqlStateOf(error: unknown): string | undefined {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  return candidate?.driverError?.code ?? candidate?.code;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executa uma unidade de trabalho em transação (READ COMMITTED + locks pessimistas explícitos)
 * e repete automaticamente em conflitos transitórios do PostgreSQL. É o equivalente ao
 * @Transactional do Spring, mas explícito: quem lê o serviço vê exatamente onde a transação começa.
 */
@Injectable()
export class TransactionRunner {
  private readonly logger = new Logger(TransactionRunner.name);

  constructor(private readonly dataSource: DataSource) {}

  async run<T>(work: (manager: EntityManager) => Promise<T>, label = 'transação'): Promise<T> {
    const maxAttempts = 4;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.dataSource.transaction('READ COMMITTED', work);
      } catch (error) {
        const state = sqlStateOf(error);
        if (attempt < maxAttempts && state && RETRYABLE_SQLSTATES.has(state)) {
          this.logger.warn(`${label}: conflito transitório (${state}), tentativa ${attempt} de ${maxAttempts}`);
          await sleep(20 * 2 ** attempt + Math.random() * 30);
          continue;
        }
        throw error;
      }
    }
  }
}
