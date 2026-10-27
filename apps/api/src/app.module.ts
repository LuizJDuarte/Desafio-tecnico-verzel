import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from './config/app-config';
import { CoreModule } from './core.module';
import { buildDataSourceOptions } from './database/data-source';
import { AuctionModule } from './modules/auction/auction.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import type { CatalogProvider } from './modules/catalog/providers/catalog-provider';
import { HealthModule } from './modules/health/health.module';
import { ImagesModule } from './modules/images/images.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SeedModule } from './seed/seed.module';

export interface AppModuleOverrides {
  catalogProvider?: CatalogProvider;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, overrides: AppModuleOverrides = {}): DynamicModule {
    const guards: Provider[] = [{ provide: APP_GUARD, useExisting: AuthGuard }];
    if (config.rateLimitEnabled) guards.push({ provide: APP_GUARD, useClass: ThrottlerGuard });

    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(config),
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions(config),
          // As migrations rodam na inicialização: o deploy sobe com o esquema sempre atualizado.
          migrationsRun: true,
          retryAttempts: config.env === 'test' ? 1 : 5,
          retryDelay: 2000,
        }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
        AuthModule,
        RealtimeModule,
        WalletModule,
        CatalogModule.forRoot(overrides.catalogProvider),
        ImagesModule,
        AuctionModule,
        HealthModule,
        SeedModule,
      ],
      providers: guards,
    };
  }
}
