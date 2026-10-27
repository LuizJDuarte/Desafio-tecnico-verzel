import type { CatalogItemDto } from '@arremate/shared';
import { CircuitSnapshot } from '../http/circuit-breaker';
import { UpstreamError } from '../http/resilient-http-client';
import { mapArticArtwork } from './artic.mapper';
import { ARTWORKS_SNAPSHOT } from './artworks.snapshot';
import { CATALOG_PAGE_SIZE, CatalogPage, CatalogProvider } from './catalog-provider';

/**
 * Provedor em memória com obras reais do snapshot. Usado em testes (inclusive para SIMULAR a queda
 * da API externa) e para desenvolver sem internet: CATALOG_PROVIDER=fake.
 * As imagens ficam sem URL para não depender de rede.
 */
export class FakeCatalogProvider implements CatalogProvider {
  readonly displayName = 'Catálogo de demonstração (offline)';
  private outage = false;
  private calls = 0;

  private readonly items: CatalogItemDto[] = ARTWORKS_SNAPSHOT.map((artwork) => ({
    ...mapArticArtwork(artwork),
    imageUrl: null,
    thumbnailUrl: null,
  }));

  /** Liga/desliga a simulação de "API fora do ar". */
  simulateOutage(down: boolean): void {
    this.outage = down;
  }

  get callCount(): number {
    return this.calls;
  }

  async search(query: string, page: number): Promise<CatalogPage> {
    this.calls++;
    this.failIfDown();
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? this.items.filter((item) => `${item.title} ${item.artist ?? ''}`.toLowerCase().includes(needle))
      : this.items;
    const totalPages = Math.max(1, Math.ceil(matches.length / CATALOG_PAGE_SIZE));
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return { items: matches.slice(start, start + CATALOG_PAGE_SIZE), page, totalPages, total: matches.length };
  }

  async getItem(externalId: string): Promise<CatalogItemDto | null> {
    this.calls++;
    this.failIfDown();
    return this.items.find((item) => item.externalId === externalId) ?? null;
  }

  health(): CircuitSnapshot {
    return {
      state: this.outage ? 'OPEN' : 'CLOSED',
      consecutiveFailures: this.outage ? 1 : 0,
      lastFailureAt: null,
      lastFailureReason: this.outage ? 'Queda simulada' : null,
      openUntil: null,
    };
  }

  private failIfDown(): void {
    if (this.outage) throw new UpstreamError('Catálogo de demonstração: queda simulada', 'NETWORK');
  }
}
