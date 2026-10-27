import 'reflect-metadata';
import '../../config/load-env-file';
import { loadConfig } from '../../config/app-config';
import { createDataSource } from '../data-source';

/** npm run db:migrate -> aplica as migrations pendentes. */
async function main(): Promise<void> {
  const dataSource = createDataSource(loadConfig());
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(
    applied.length ? `Migrations aplicadas: ${applied.map((m) => m.name).join(', ')}` : 'Banco já está atualizado.',
  );
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
