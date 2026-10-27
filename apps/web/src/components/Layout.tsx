import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { Toaster } from 'sonner';
import { formatBRL } from '@arremate/shared';
import { useAuth } from '../auth/auth-context';
import { useUserEvents } from '../hooks/useUserEvents';
import { cn } from '../lib/cn';
import { useWallet } from '../lib/queries';
import { useTheme } from '../lib/theme';
import { Button } from './ui';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label="Arremate, página inicial">
      <svg viewBox="0 0 40 48" className="h-8 w-auto" aria-hidden>
        <rect x="16" y="28" width="8" height="18" rx="2.5" className="fill-ink" />
        <ellipse cx="20" cy="18" rx="17" ry="15" className="fill-brand stroke-ink" strokeWidth="3" />
      </svg>
      <span className="font-wide text-[1.35rem] font-extrabold tracking-tight">Arremate</span>
    </Link>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-[15px] font-semibold transition-colors',
    isActive ? 'bg-raised text-ink ring-1 ring-line' : 'text-ink-soft hover:text-ink',
  );

function WalletChip() {
  const { data } = useWallet();
  if (!data) return null;
  return (
    <Link
      to="/carteira"
      className="hidden items-baseline gap-1.5 rounded-md px-3 py-1.5 text-sm ring-1 ring-line hover:ring-line-strong lg:flex"
      title="Saldo disponível para novos lances"
    >
      <span className="text-ink-faint">Disponível</span>
      <span className="font-semiwide font-bold tabular">{formatBRL(data.availableCents)}</span>
    </Link>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useUserEvents();

  useEffect(() => setOpen(false), [location.pathname]);

  const links = [
    { to: '/', label: 'Vitrine', end: true },
    ...(user?.role === 'BIDDER'
      ? [
          { to: '/meus-arremates', label: 'Meus arremates', end: false },
          { to: '/carteira', label: 'Carteira', end: false },
        ]
      : []),
    ...(user?.role === 'AUCTIONEER'
      ? [
          { to: '/painel', label: 'Painel', end: true },
          { to: '/painel/novo-lote', label: 'Novo lote', end: false },
        ]
      : []),
    { to: '/como-funciona', label: 'Como funciona', end: false },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-raised focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-line bg-wall/90 backdrop-blur supports-[backdrop-filter]:bg-wall/75 sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user?.role === 'BIDDER' && <WalletChip />}
            <button
              type="button"
              onClick={toggle}
              className="grid size-10 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            </button>
            {user ? (
              <div className="hidden items-center gap-3 md:flex">
                <span className="flex max-w-[13rem] flex-col text-right leading-tight" title={user.email}>
                  <span className="truncate text-sm font-semibold text-ink">{user.name}</span>
                  <span className="text-xs text-ink-faint">
                    {user.role === 'AUCTIONEER' ? 'Leiloeiro' : 'Licitante'}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Sair
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  to="/entrar"
                  state={{ from: location.pathname }}
                  className="px-2 text-[15px] font-semibold text-ink-soft hover:text-ink"
                >
                  Entrar
                </Link>
                <Link
                  to="/cadastro"
                  className="rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-wall hover:opacity-90"
                >
                  Criar conta
                </Link>
              </div>
            )}
            <button
              type="button"
              className="grid size-10 place-items-center rounded-md md:hidden"
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-4 pb-4 pt-2 md:hidden" aria-label="Menu">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
                  {link.label}
                </NavLink>
              ))}
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md px-3 py-2 text-left text-[15px] font-semibold text-ink-soft"
                >
                  Sair ({user.name})
                </button>
              ) : (
                <>
                  <NavLink to="/entrar" className={navLinkClass}>
                    Entrar
                  </NavLink>
                  <NavLink to="/cadastro" className={navLinkClass}>
                    Criar conta
                  </NavLink>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-6 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Obras em domínio público e dados do{' '}
            <a
              href="https://www.artic.edu"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Art Institute of Chicago
            </a>{' '}
            (CC0). Dinheiro simulado: nenhum pagamento real acontece aqui.
          </p>
          <div className="flex gap-4">
            <Link to="/como-funciona" className="hover:text-ink">
              Regras e auditoria
            </Link>
            <a href="/api/docs" className="hover:text-ink">
              API (Swagger)
            </a>
          </div>
        </div>
      </footer>
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </div>
  );
}
