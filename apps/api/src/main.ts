import 'reflect-metadata';
import './config/load-env-file';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './config/app-config';
import { DemoSeeder } from './seed/demo-seeder';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bufferLogs: false });
  configureApp(app, config);

  // As migrations já rodaram na inicialização do TypeORM. A seed só roda com o banco vazio.
  await app.init();
  if (config.seedDemoData) await app.get(DemoSeeder).seedIfEmpty();

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Arremate no ar em http://localhost:${config.port} (API em /api, docs em /api/docs)`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar a aplicação:', error);
  process.exit(1);
});
