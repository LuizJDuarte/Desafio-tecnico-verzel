import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { CatalogItemDto, CatalogSearchResponse, CatalogStatusDto } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { AppException } from '../../common/errors';
import { ApiCacheService } from './api-cache.service';
import { UpstreamError } from './http/resilient-http-client';
import { CATALOG_PAGE_SIZE, CATALOG_PROVIDER, CatalogPage, CatalogProvider } from './providers/catalog-provider';

/** Busca é considerada "fresca" por 15 min; detalhes de obra por 24 h. */
const SEARCH_FRESH_MS = 15 * 60_000;
const ITEM_FRESH_MS = 24 * 60 * 60_000;
const ITEM_KEY_PREFIX = 'artic:item:v1:';

const UNAVAILABLE_MESSAGE =
  'A API do Art Institute of Chicago está indisponível no momento. Os lotes existentes continuam funcionando normalmente; tente buscar novos itens em instantes.';

/**
 * Catálogo com cache "stale-if-error":
 * 1. cache fresco -> responde sem chamar a API;
 * 2. senão chama a API (com timeout, retentativas, limitador e circuit breaker) e atualiza o cache;
 * 3. se a API falhar, devolve o último resultado salvo marcando degraded=true;
 * 4. se aquela busca nunca foi feita, procura nas obras que a casa já conhece (seed e buscas anteriores);
 * 5. só sem nada conhecido a busca falha, com 503 e mensagem clara.
 * Vitrine, salas, auditoria e comprovantes NÃO passam por aqui: usam o snapshot gravado no lote.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(CATALOG_PROVIDER) private readonly provider: CatalogProvider,
    private readonly cache: ApiCacheService,
    private readonly clock: Clock,
  ) {}

  get providerName(): string {
    return this.provider.displayName;
  }

  async search(rawQuery: string, page: number): Promise<CatalogSearchResponse> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 100);
    const key = `artic:search:v1:${query.toLowerCase()}:${page}`;
    const cached = await this.cache.get<CatalogPage>(key);
    const now = this.clock.now();

    if (cached && now.getTime() - cached.fetchedAt.getTime() < SEARCH_FRESH_MS) {
      return this.toResponse(cached.payload, 'cache', cached.fetchedAt, null);
    }

    try {
      const fresh = await this.dedupe(key, () => this.provider.search(query, page));
      await this.cache.set(key, fresh, now);
      // Cada item da busca também vira cache individual: criar o lote funciona mesmo se a API cair logo depois.
      await Promise.all(fresh.items.map((item) => this.cache.set(this.itemKey(item.externalId), item, now)));
      return this.toResponse(fresh, 'live', now, null);
    } catch (error) {
      this.logger.warn(`Busca no catálogo falhou (${describe(error)})`);
      if (cached) {
        return this.toResponse(
          cached.payload,
          'stale-cache',
          cached.fetchedAt,
          'A API do museu está instável agora. Mostrando os últimos resultados salvos para esta busca.',
        );
      }
      const known = await this.cache.searchItems<CatalogItemDto>(ITEM_KEY_PREFIX, query, page, CATALOG_PAGE_SIZE);
      if (known.total > 0) {
        return this.toResponse(
          {
            items: known.items,
            page,
            totalPages: Math.max(1, Math.ceil(known.total / CATALOG_PAGE_SIZE)),
            total: known.total,
          },
          'local-fallback',
          now,
          'A API do museu está fora do ar agora. Mostrando obras que a casa já conhece (de buscas anteriores); dá para criar lotes com elas normalmente.',
        );
      }
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'CATALOG_UNAVAILABLE', UNAVAILABLE_MESSAGE, {
        reason: describe(error),
      });
    }
  }

  async getItem(externalId: string): Promise<CatalogItemDto> {
    const key = this.itemKey(externalId);
    const cached = await this.cache.get<CatalogItemDto>(key);
    const now = this.clock.now();
    if (cached && now.getTime() - cached.fetchedAt.getTime() < ITEM_FRESH_MS) {
      return cached.payload;
    }
    try {
      const item = await this.dedupe(key, () => this.provider.getItem(externalId));
      if (!item) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'CATALOG_ITEM_NOT_FOUND',
          'Item não encontrado no catálogo do museu.',
        );
      }
      await this.cache.set(key, item, now);
      return item;
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.warn(`Consulta do item ${externalId} falhou (${describe(error)})`);
      if (cached) return cached.payload;
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'CATALOG_UNAVAILABLE', UNAVAILABLE_MESSAGE, {
        reason: describe(error),
      });
    }
  }

  status(): CatalogStatusDto {
    const snapshot = this.provider.health();
    return {
      provider: this.provider.displayName,
      circuit: snapshot.state,
      consecutiveFailures: snapshot.consecutiveFailures,
      lastFailureAt: snapshot.lastFailureAt ? new Date(snapshot.lastFailureAt).toISOString() : null,
      lastFailureReason: snapshot.lastFailureReason,
      openUntil: snapshot.openUntil ? new Date(snapshot.openUntil).toISOString() : null,
    };
  }

  private itemKey(externalId: string): string {
    return `${ITEM_KEY_PREFIX}${externalId}`;
  }

  /** Requisições idênticas simultâneas compartilham a mesma chamada à API externa. */
  private dedupe<T>(key: string, call: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = call().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private toResponse(
    page: CatalogPage,
    origin: CatalogSearchResponse['meta']['origin'],
    fetchedAt: Date,
    message: string | null,
  ): CatalogSearchResponse {
    return {
      items: page.items,
      page: page.page,
      totalPages: page.totalPages,
      total: page.total,
      meta: {
        origin,
        degraded: origin === 'stale-cache' || origin === 'local-fallback',
        message,
        fetchedAt: fetchedAt.toISOString(),
      },
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof UpstreamError) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
