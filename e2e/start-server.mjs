// Recria o banco de E2E com a seed de demonstração e sobe a aplicação já compilada.
import { execFileSync, spawn } from 'node:child_process';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: process.env.E2E_PORT ?? '3100',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://arremate:arremate@localhost:5432/arremate_e2e',
  CATALOG_PROVIDER: 'fake',
  IMAGE_DOWNLOAD_ENABLED: 'false',
  RATE_LIMIT_ENABLED: 'false',
  SWAGGER_ENABLED: 'false',
  SEED_DEMO_DATA: 'false',
};

execFileSync('node', ['apps/api/dist/database/cli/reset.js'], { env, stdio: 'inherit' });

const server = spawn('node', ['apps/api/dist/main.js'], { env, stdio: 'inherit' });
const stop = (signal) => server.kill(signal);
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
server.on('exit', (code) => process.exit(code ?? 0));
