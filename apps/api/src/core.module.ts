import { DynamicModule, Global, Module } from '@nestjs/common';
import { Clock } from './common/clock';
import { TransactionRunner } from './common/transaction-runner';
import { AppConfig } from './config/app-config';

/** Infraestrutura compartilhada por todos os módulos: configuração, relógio e transações. */
@Global()
@Module({})
export class CoreModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [{ provide: AppConfig, useValue: config }, Clock, TransactionRunner],
      exports: [AppConfig, Clock, TransactionRunner],
    };
  }
}
