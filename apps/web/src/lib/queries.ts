import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  AuctioneerDashboardDto,
  AuditResponse,
  BidDto,
  CatalogItemDto,
  CatalogSearchResponse,
  LotPageDto,
  MyBidsResponse,
  ReceiptDto,
  ShowcaseResponse,
  ShowcaseSort,
  ShowcaseTab,
  WalletDto,
} from '@arremate/shared';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  showcase: (tab: ShowcaseTab, q: string, sort: ShowcaseSort, page: number) =>
    ['showcase', tab, q, sort, page] as const,
  showcaseAll: ['showcase'] as const,
  lot: (id: string) => ['lot', id] as const,
  bids: (id: string) => ['lot', id, 'bids'] as const,
  wallet: ['wallet'] as const,
  myBids: ['my-bids'] as const,
  dashboard: ['dashboard'] as const,
  audit: (id: string) => ['audit', id] as const,
  receipt: (code: string) => ['receipt', code] as const,
  catalog: (q: string, page: number) => ['catalog', q, page] as const,
};

export function useShowcase(tab: ShowcaseTab, q: string, sort: ShowcaseSort, page: number) {
  return useQuery({
    queryKey: queryKeys.showcase(tab, q, sort, page),
    queryFn: () => {
      const params = new URLSearchParams({ tab, sort, page: String(page), pageSize: '12' });
      if (q) params.set('q', q);
      return api<ShowcaseResponse>(`/lots?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useLotPage(id: string) {
  return useQuery({
    queryKey: queryKeys.lot(id),
    queryFn: () => api<LotPageDto>(`/lots/${id}`),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useLotBids(id: string) {
  return useQuery({ queryKey: queryKeys.bids(id), queryFn: () => api<BidDto[]>(`/lots/${id}/bids`) });
}

export function useWallet(enabled = true) {
  return useQuery({ queryKey: queryKeys.wallet, queryFn: () => api<WalletDto>('/wallet'), enabled });
}

export function useMyBids() {
  return useQuery({ queryKey: queryKeys.myBids, queryFn: () => api<MyBidsResponse>('/me/bids') });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api<AuctioneerDashboardDto>('/auctioneer/dashboard'),
  });
}

export function useAudit(id: string) {
  return useQuery({
    queryKey: queryKeys.audit(id),
    queryFn: () => api<AuditResponse>(`/audit/lots/${id}`),
    staleTime: 0,
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useReceipt(code: string) {
  return useQuery({
    queryKey: queryKeys.receipt(code),
    queryFn: () => api<ReceiptDto>(`/receipts/${encodeURIComponent(code)}`),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useCatalogSearch(q: string, page: number) {
  return useQuery({
    queryKey: queryKeys.catalog(q, page),
    queryFn: () =>
      api<CatalogSearchResponse>(`/catalog/search?${new URLSearchParams({ q, page: String(page) }).toString()}`),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function fetchCatalogItem(externalId: string) {
  return api<CatalogItemDto>(`/catalog/items/${externalId}`);
}
