import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiCacheEntity } from '../../database/entities';

export interface CachedValue<T> {
  payload: T;
  fetchedAt: Date;
}

export interface CachedSearch<T> {
  items: T[];
  total: number;
}

@Injectable()
export class ApiCacheService {
  private readonly logger = new Logger(ApiCacheService.name);

  constructor(private readonly dataSource: DataSource) {}

  async get<T>(key: string): Promise<CachedValue<T> | null> {
    try {
      const row = await this.dataSource.getRepository(ApiCacheEntity).findOneBy({ key });
      return row ? { payload: row.payload as T, fetchedAt: row.fetchedAt } : null;
    } catch (error) {
      // Cache é otimização: se falhar, a aplicação segue (apenas sem o atalho).
      this.logger.warn(`Falha ao ler cache "${key}": ${String(error)}`);
      return null;
    }
  }

  /**
   * Busca de emergência nas obras já conhecidas (itens salvos por buscas anteriores e pela seed).
   * Usada só quando a API do museu está fora do ar e aquela busca nunca foi feita antes.
   */
  async searchItems<T>(keyPrefix: string, query: string, page: number, pageSize: number): Promise<CachedSearch<T>> {
    try {
      const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const rows = (await this.dataSource.query(
        `SELECT payload, count(*) OVER () AS total
           FROM api_cache
          WHERE key LIKE $1
            AND ($2 = '' OR payload->>'title' ILIKE $3 OR payload->>'artist' ILIKE $3)
          ORDER BY payload->>'title'
          LIMIT $4 OFFSET $5`,
        [`${keyPrefix}%`, query, pattern, pageSize, (page - 1) * pageSize],
      )) as Array<{ payload: T; total: string }>;
      return { items: rows.map((row) => row.payload), total: rows.length > 0 ? Number(rows[0].total) : 0 };
    } catch (error) {
      this.logger.warn(`Falha na busca de emergência no cache: ${String(error)}`);
      return { items: [], total: 0 };
    }
  }

  async set(key: string, payload: unknown, fetchedAt: Date): Promise<void> {
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(ApiCacheEntity)
        .values({ key, payload: payload as object, fetchedAt })
        .orUpdate(['payload', 'fetched_at'], ['key'])
        .execute();
    } catch (error) {
      this.logger.warn(`Falha ao gravar cache "${key}": ${String(error)}`);
    }
  }
}
