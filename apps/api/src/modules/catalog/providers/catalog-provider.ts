import type { CatalogItemDto } from '@arremate/shared';
import type { CircuitSnapshot } from '../http/circuit-breaker';

export interface CatalogPage {
  items: CatalogItemDto[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Porta (interface) do catálogo externo. O resto do sistema não conhece a API do museu:
 * trocar de fonte (cartas, discos, livros) é escrever outro provedor com estes três métodos.
 */
export interface CatalogProvider {
  readonly displayName: string;
  search(query: string, page: number): Promise<CatalogPage>;
  getItem(externalId: string): Promise<CatalogItemDto | null>;
  health(): CircuitSnapshot;
}

export const CATALOG_PROVIDER = Symbol('CATALOG_PROVIDER');
export const CATALOG_PAGE_SIZE = 12;
