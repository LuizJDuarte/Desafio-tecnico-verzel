import type { CatalogItemDto } from '@arremate/shared';
import { CircuitSnapshot } from '../http/circuit-breaker';
import { ResilientHttpClient, UpstreamError } from '../http/resilient-http-client';
import {
  ARTIC_DEFAULT_IIIF_URL,
  ARTIC_FIELDS,
  ArticDetailResponse,
  ArticSearchResponse,
  mapArticArtwork,
} from './artic.mapper';
import { CATALOG_PAGE_SIZE, CatalogPage, CatalogProvider } from './catalog-provider';

/** A API do museu não entrega mais de 10.000 resultados por busca (limit * page). */
const MAX_RESULTS = 10_000;

/**
 * Provedor do Art Institute of Chicago (https://api.artic.edu/docs).
 * - Sem chave de API; limite de 60 req/min por IP (respeitado pelo TokenBucket do cliente HTTP).
 * - Buscamos apenas obras em domínio público (recomendação do próprio museu para uso das imagens).
 */
export class ArticCatalogProvider implements CatalogProvider {
  readonly displayName = 'Art Institute of Chicago';

  constructor(
    private readonly http: ResilientHttpClient,
    private readonly baseUrl: string,
  ) {}

  async search(query: string, page: number): Promise<CatalogPage> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(CATALOG_PAGE_SIZE),
      fields: ARTIC_FIELDS.join(','),
    });
    if (query) params.set('q', query);
    params.set('query[term][is_public_domain]', 'true');

    const body = await this.http.getJson<ArticSearchResponse>(`${this.baseUrl}/artworks/search?${params.toString()}`);
    if (!body || !Array.isArray(body.data) || !body.pagination) {
      throw new UpstreamError('Art Institute of Chicago: resposta de busca em formato inesperado', 'INVALID_RESPONSE');
    }
    const iiif = body.config?.iiif_url ?? ARTIC_DEFAULT_IIIF_URL;
    const maxPages = Math.floor(MAX_RESULTS / CATALOG_PAGE_SIZE);
    return {
      // Sem imagem não dá para montar um lote apresentável: filtramos aqui.
      items: body.data
        .filter((artwork) => artwork && artwork.id && artwork.image_id)
        .map((artwork) => mapArticArtwork(artwork, iiif)),
      page: body.pagination.current_page ?? page,
      totalPages: Math.min(body.pagination.total_pages ?? 1, maxPages),
      total: Math.min(body.pagination.total ?? 0, MAX_RESULTS),
    };
  }

  async getItem(externalId: string): Promise<CatalogItemDto | null> {
    if (!/^\d{1,10}$/.test(externalId)) return null;
    try {
      const body = await this.http.getJson<ArticDetailResponse>(
        `${this.baseUrl}/artworks/${externalId}?fields=${ARTIC_FIELDS.join(',')}`,
      );
      if (!body?.data?.id) {
        throw new UpstreamError('Art Institute of Chicago: resposta de obra em formato inesperado', 'INVALID_RESPONSE');
      }
      return mapArticArtwork(body.data, body.config?.iiif_url ?? ARTIC_DEFAULT_IIIF_URL);
    } catch (error) {
      if (error instanceof UpstreamError && error.kind === 'NOT_FOUND') return null;
      throw error;
    }
  }

  health(): CircuitSnapshot {
    return this.http.breaker.snapshot();
  }
}
