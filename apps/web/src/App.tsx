import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireRole } from './components/RequireRole';
import { AuctioneerDashboardPage } from './pages/AuctioneerDashboardPage';
import { AuditPage } from './pages/AuditPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { LotRoomPage } from './pages/LotRoomPage';
import { MyBidsPage } from './pages/MyBidsPage';
import { NewLotPage } from './pages/NewLotPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { WalletPage } from './pages/WalletPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ShowcasePage />} />
              <Route path="lotes/:id" element={<LotRoomPage />} />
              <Route path="auditoria/:id" element={<AuditPage />} />
              <Route path="comprovante/:code" element={<ReceiptPage />} />
              <Route path="entrar" element={<LoginPage />} />
              <Route path="cadastro" element={<RegisterPage />} />
              <Route path="como-funciona" element={<HowItWorksPage />} />
              <Route
                path="carteira"
                element={
                  <RequireRole role="BIDDER">
                    <WalletPage />
                  </RequireRole>
                }
              />
              <Route
                path="meus-arremates"
                element={
                  <RequireRole role="BIDDER">
                    <MyBidsPage />
                  </RequireRole>
                }
              />
              <Route
                path="painel"
                element={
                  <RequireRole role="AUCTIONEER">
                    <AuctioneerDashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="painel/novo-lote"
                element={
                  <RequireRole role="AUCTIONEER">
                    <NewLotPage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
