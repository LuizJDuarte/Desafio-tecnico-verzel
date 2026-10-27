import { DataSource } from 'typeorm';

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://arremate:arremate@localhost:5432/arremate_test';

/** Recria o esquema do banco de testes do zero; as migrations rodam quando a aplicação sobe. */
export default async function globalSetup(): Promise<void> {
  const dataSource = new DataSource({ type: 'postgres', url: TEST_DATABASE_URL });
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.destroy();
}
