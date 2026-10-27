import { DataSource, DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/app-config';
import { ENTITIES } from './entities';
import { InitialSchema1761600000000 } from './migrations/1761600000000-initial-schema';

export const MIGRATIONS = [InitialSchema1761600000000];

/**
 * Opções do TypeORM compartilhadas entre a aplicação, os scripts de CLI e os testes.
 * synchronize fica SEMPRE desligado: o esquema evolui só por migrations versionadas.
 */
export function buildDataSourceOptions(
  config: AppConfig,
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  const ssl = config.database.ssl === 'auto' ? undefined : config.database.ssl;
  return {
    type: 'postgres',
    url: config.database.url,
    ...(ssl === undefined ? {} : { ssl }),
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: ['error', 'warn'],
    extra: { max: config.database.poolMax },
    ...overrides,
  } as DataSourceOptions;
}

export function createDataSource(config: AppConfig, overrides: Partial<DataSourceOptions> = {}): DataSource {
  return new DataSource(buildDataSourceOptions(config, overrides));
}
