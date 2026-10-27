import { DemoSeeder } from '../../seed/demo-seeder';
import { createCliContext } from './cli-context';

/** npm run db:seed -> cria os dados de demonstração (só se o banco estiver vazio). */
async function main(): Promise<void> {
  const { app } = await createCliContext();
  const created = await app.get(DemoSeeder).seedIfEmpty();
  if (!created) console.log('Nada a fazer: o banco já tem usuários. Use "npm run db:reset" para recriar tudo.');
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
