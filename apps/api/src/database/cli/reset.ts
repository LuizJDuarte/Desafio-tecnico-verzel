import { loadConfig } from '../../config/app-config';
import { DemoSeeder } from '../../seed/demo-seeder';
import { createDataSource } from '../data-source';
import { createCliContext } from './cli-context';

/**
 * npm run db:reset -> APAGA todo o esquema, recria pelas migrations e roda a seed.
 * Útil para voltar a demonstração ao estado inicial. Recusa rodar em produção sem ALLOW_DB_RESET=true.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.isProduction && process.env.ALLOW_DB_RESET !== 'true') {
    throw new Error('Reset bloqueado em produção. Defina ALLOW_DB_RESET=true se tiver certeza.');
  }
  const dataSource = createDataSource(config);
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.destroy();
  console.log('Esquema apagado. Recriando...');

  const { app } = await createCliContext(); // roda as migrations na inicialização
  await app.get(DemoSeeder).seed();
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
