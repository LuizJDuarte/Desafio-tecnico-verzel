import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Cache persistente das respostas da API externa. Fica no banco (e não só em memória) para sobreviver
 * a reinícios do servidor: no plano gratuito do Render a instância hiberna e perde a memória.
 */
@Entity('api_cache')
export class ApiCacheEntity {
  @PrimaryColumn({ type: 'varchar', length: 300 })
  key: string;

  @Column({ type: 'jsonb' })
  payload: unknown;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}
