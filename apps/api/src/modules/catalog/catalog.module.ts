import { DynamicModule, Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { ApiCacheService } from './api-cache.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CircuitBreaker } from './http/circuit-breaker';
import { museumIdentityHeaders } from './http/identity-headers';
import { ResilientHttpClient } from './http/resilient-http-client';
import { TokenBucket } from './http/token-bucket';
import { ArticCatalogProvider } from './providers/artic-catalog.provider';
import { CATALOG_PROVIDER, CatalogProvider } from './providers/catalog-provider';
import { FakeCatalogProvider } from './providers/fake-catalog.provider';

export function createCatalogProvider(config: AppConfig): CatalogProvider {
  if (config.catalog.provider === 'fake') return new FakeCatalogProvider();
  const http = new ResilientHttpClient({
    name: 'Art Institute of Chicago',
    timeoutMs: config.catalog.timeoutMs,
    retries: 2,
    baseBackoffMs: 300,
    maxWaitForTokenMs: 3_000,
    headers: { Accept: 'application/json', ...museumIdentityHeaders(config.catalog.contact) },
    breaker: new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 }),
    // 50 req/min com rajada de até 10: abaixo do limite de 60 req/min do museu.
    bucket: new TokenBucket(10, 50 / 60),
  });
  return new ArticCatalogProvider(http, config.catalog.articApiUrl);
}

@Global()
@Module({})
export class CatalogModule {
  /** @param override provedor alternativo (os testes usam o FakeCatalogProvider para simular quedas). */
  static forRoot(override?: CatalogProvider): DynamicModule {
    return {
      module: CatalogModule,
      controllers: [CatalogController],
      providers: [
        ApiCacheService,
        CatalogService,
        {
          provide: CATALOG_PROVIDER,
          inject: [AppConfig],
          useFactory: (config: AppConfig) => override ?? createCatalogProvider(config),
        },
      ],
      exports: [ApiCacheService, CatalogService, CATALOG_PROVIDER],
    };
  }
}
