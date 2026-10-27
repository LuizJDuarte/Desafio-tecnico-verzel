import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { UserRole } from '@arremate/shared';
import { useAuth } from '../auth/auth-context';
import { ErrorState, LinkButton, PageLoading } from './ui';

export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (user.role !== role) {
    return (
      <ErrorState
        title={role === 'AUCTIONEER' ? 'Área do leiloeiro' : 'Área do licitante'}
        message={
          role === 'AUCTIONEER'
            ? 'Esta página é para quem cria e gerencia lotes. Entre com uma conta de leiloeiro.'
            : 'Esta página é para quem dá lances. Entre com uma conta de licitante.'
        }
        action={<LinkButton to="/">Voltar para a vitrine</LinkButton>}
      />
    );
  }
  return <>{children}</>;
}
