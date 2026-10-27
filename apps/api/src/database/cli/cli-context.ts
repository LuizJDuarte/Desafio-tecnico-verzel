import 'reflect-metadata';
import '../../config/load-env-file';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { AppConfig, loadConfig } from '../../config/app-config';

/** Sobe o contexto Nest sem servidor HTTP (para scripts de linha de comando). */
export async function createCliContext(): Promise<{ app: INestApplicationContext; config: AppConfig }> {
  const config = loadConfig({ ...process.env, SCHEDULER_ENABLED: 'false' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn', 'log'],
  });
  return { app, config };
}

export function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.slice(2).split('=');
    if (inline !== undefined) args[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
    else args[key] = true;
  }
  return args;
}
