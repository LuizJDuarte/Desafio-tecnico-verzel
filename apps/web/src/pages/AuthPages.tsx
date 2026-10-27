import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { UserRole } from '@arremate/shared';
import { useAuth } from '../auth/auth-context';
import { Button, Field, TextInput } from '../components/ui';
import { ApiError } from '../lib/api';
import { cn } from '../lib/cn';

const DEMO_PASSWORD = 'arremate123';
const DEMO_ACCOUNTS = [
  { email: 'ana@example.com', name: 'Ana Souza', role: 'licitante' },
  { email: 'bruno@example.com', name: 'Bruno Lima', role: 'licitante' },
  { email: 'leiloeiro@example.com', name: 'Galeria Aurora Leilões', role: 'leiloeiro' },
];

function useRedirectTarget(fallback: string) {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('//') ? from : fallback;
}

function AuthShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">{title}</h1>
        <p className="mt-3 max-w-[48ch] text-[17px] text-ink-soft">{intro}</p>
        <div className="mt-8">{children}</div>
      </div>
      <aside className="self-start rounded-xl border border-line bg-surface p-6">
        <h2 className="font-semiwide text-lg font-bold">Contas de demonstração</h2>
        <p className="mt-1 text-[15px] text-ink-soft">
          Já vêm com saldo e lances em andamento. Abra a mesma sala com a Ana em uma janela e o Bruno em outra (ou em
          uma aba anônima) para ver a disputa ao vivo. Senha de todas:{' '}
          <strong className="font-mono">{DEMO_PASSWORD}</strong>
        </p>
        <DemoButtons />
      </aside>
    </div>
  );
}

function DemoButtons() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget('/');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (email: string) => {
    setBusy(email);
    setError(null);
    try {
      const user = await login(email, DEMO_PASSWORD);
      navigate(target !== '/' ? target : user.role === 'AUCTIONEER' ? '/painel' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      {DEMO_ACCOUNTS.map((account) => (
        <button
          key={account.email}
          type="button"
          disabled={busy !== null}
          onClick={() => enter(account.email)}
          className="flex w-full items-center justify-between rounded-lg border border-line-strong bg-raised px-4 py-3 text-left hover:border-ink-faint disabled:opacity-60"
        >
          <span>
            <span className="block font-semibold">{account.name}</span>
            <span className="text-sm text-ink-faint">{account.email}</span>
          </span>
          <span className="text-sm font-semibold text-brand-text">
            {busy === account.email ? 'Entrando…' : `Entrar como ${account.role}`}
          </span>
        </button>
      ))}
      {error && (
        <p className="text-sm text-lose" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget('/');
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const logged = await login(email, password);
      navigate(target !== '/' ? target : logged.role === 'AUCTIONEER' ? '/painel' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Entrar"
      intro="Licitantes dão lances e acompanham seus arremates. Leiloeiros criam e gerenciam lotes."
    >
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <Field label="E-mail" htmlFor={emailId}>
          <TextInput
            id={emailId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="Senha" htmlFor={passwordId}>
          <TextInput
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-lose-soft px-3 py-2 text-[15px]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={pending}>
          Entrar
        </Button>
        <p className="text-[15px] text-ink-soft">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-brand-text hover:underline">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget('/');
  const ids = { name: useId(), email: useId(), password: useId() };
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'BIDDER' as UserRole });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await register(form);
      navigate(created.role === 'AUCTIONEER' ? '/painel' : '/carteira', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Criar conta"
      intro="Escolha o seu papel. Licitantes começam com a carteira zerada e fazem um depósito simulado para dar lances."
    >
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Quero</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['BIDDER', 'Dar lances', 'Licitante'],
                ['AUCTIONEER', 'Leiloar obras', 'Leiloeiro'],
              ] as const
            ).map(([role, title, subtitle]) => (
              <label
                key={role}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-3',
                  form.role === role
                    ? 'border-ink bg-raised ring-1 ring-ink'
                    : 'border-line-strong bg-raised hover:border-ink-faint',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={form.role === role}
                  onChange={() => setForm((current) => ({ ...current, role }))}
                  className="sr-only"
                />
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-ink-faint">{subtitle}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Nome" htmlFor={ids.name} hint="Só você vê o seu nome. Nos lances, você aparece por um número.">
          <TextInput
            id={ids.name}
            autoComplete="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="E-mail" htmlFor={ids.email}>
          <TextInput
            id={ids.email}
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Senha" htmlFor={ids.password} hint="Pelo menos 8 caracteres.">
          <TextInput
            id={ids.password}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-lose-soft px-3 py-2 text-[15px]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={pending}>
          Criar conta
        </Button>
      </form>
    </AuthShell>
  );
}
