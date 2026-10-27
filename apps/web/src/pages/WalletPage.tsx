import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { formatBRL, WALLET_LIMITS, type WalletDto, type WalletTransactionType } from '@arremate/shared';
import { MoneyInput } from '../components/MoneyInput';
import { Button, EmptyState, ErrorState, PageLoading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime, formatShortDateTime } from '../lib/format';
import { queryKeys, useWallet } from '../lib/queries';

const TYPE_LABELS: Record<WalletTransactionType, string> = {
  DEPOSIT: 'Depósito',
  HOLD: 'Comprometido',
  RELEASE: 'Liberado',
  CAPTURE: 'Arremate pago',
  SALE_CREDIT: 'Venda recebida',
};

const QUICK_AMOUNTS = [5_000_00, 25_000_00, 100_000_00];

export function WalletPage() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [text, setText] = useState('');
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deposit = useMutation({
    mutationFn: (amountCents: number) => api<WalletDto>('/wallet/deposits', { method: 'POST', json: { amountCents } }),
    onSuccess: (data, amountCents) => {
      queryClient.setQueryData(queryKeys.wallet, data);
      toast.success(`Depósito de ${formatBRL(amountCents)} feito.`);
      setText('');
      setCents(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível depositar.'),
  });

  if (wallet.isPending) return <PageLoading label="Carregando a carteira" />;
  if (wallet.isError) {
    return (
      <ErrorState
        title="Não foi possível abrir a carteira"
        message={wallet.error.message}
        action={<Button onClick={() => void wallet.refetch()}>Tentar de novo</Button>}
      />
    );
  }
  const data = wallet.data;
  const heldShare = data.balanceCents > 0 ? (data.heldCents / data.balanceCents) * 100 : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (cents === null) return setError('Digite um valor em reais, por exemplo 2.500,00.');
    if (cents < WALLET_LIMITS.minDepositCents)
      return setError(`O depósito mínimo é de ${formatBRL(WALLET_LIMITS.minDepositCents)}.`);
    if (cents > WALLET_LIMITS.maxDepositCents)
      return setError(`O depósito máximo por operação é de ${formatBRL(WALLET_LIMITS.maxDepositCents)}.`);
    deposit.mutate(cents);
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">Carteira</h1>
        <p className="mt-2 max-w-[60ch] text-[17px] text-ink-soft">
          Enquanto você lidera um lote, o valor do lance fica comprometido. Se alguém cobrir, ele volta na hora para o
          disponível. Só o arremate é debitado.
        </p>
      </div>

      <section aria-label="Saldos" className="space-y-4">
        <dl className="grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-faint">Saldo total</dt>
            <dd className="font-wide text-3xl font-extrabold tabular">{formatBRL(data.balanceCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Comprometido em lances</dt>
            <dd className="font-wide text-3xl font-extrabold tabular text-brand-text">{formatBRL(data.heldCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Disponível para novos lances</dt>
            <dd className="font-wide text-3xl font-extrabold tabular text-win">{formatBRL(data.availableCents)}</dd>
          </div>
        </dl>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-win/80"
          role="img"
          aria-label={`${Math.round(heldShare)}% do saldo comprometido`}
        >
          <div className="h-full bg-brand" style={{ width: `${heldShare}%` }} />
        </div>
        <p className="text-sm text-ink-faint">Disponível = total menos comprometido.</p>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-8">
          <section aria-labelledby="depositar" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="depositar" className="font-semiwide text-lg font-bold">
              Depósito simulado
            </h2>
            <p className="mt-1 text-[15px] text-ink-soft">
              Nenhum dinheiro real é movimentado. Até {formatBRL(WALLET_LIMITS.maxDepositCents)} por depósito.
            </p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label htmlFor={inputId} className="sr-only">
                Valor do depósito
              </label>
              <div className="flex gap-2">
                <MoneyInput
                  id={inputId}
                  className="flex-1"
                  value={text}
                  placeholder="0,00"
                  invalid={Boolean(error)}
                  onValueChange={(value, parsed) => {
                    setText(value);
                    setCents(parsed);
                    setError(null);
                  }}
                />
                <Button type="submit" loading={deposit.isPending}>
                  Depositar
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="rounded-full border border-line-strong px-3 py-1 text-sm font-semibold tabular hover:border-ink-faint"
                    onClick={() => {
                      setText((amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                      setCents(amount);
                      setError(null);
                    }}
                  >
                    {formatBRL(amount)}
                  </button>
                ))}
              </div>
              {error && (
                <p className="text-sm text-lose" role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>

          <section aria-labelledby="compromissos">
            <h2 id="compromissos" className="font-semiwide text-lg font-bold">
              Onde seu saldo está comprometido
            </h2>
            {data.holds.length === 0 ? (
              <p className="mt-2 text-[15px] text-ink-soft">Você não está liderando nenhum lote agora.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.holds.map((hold) => (
                  <li key={hold.lotId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link to={`/lotes/${hold.lotId}`} className="title-art line-clamp-1 text-[17px] hover:underline">
                        {hold.lotTitle}
                      </Link>
                      <p className="text-sm text-ink-faint">Termina em {formatShortDateTime(hold.endsAt)}</p>
                    </div>
                    <span className="font-semiwide font-bold tabular">{formatBRL(hold.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="extrato">
          <h2 id="extrato" className="font-semiwide text-lg font-bold">
            Extrato
          </h2>
          {data.transactions.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Nenhuma movimentação ainda.">
                Faça um depósito simulado para começar a dar lances.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-[15px]">
                <thead className="text-sm text-ink-faint">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-semibold">Quando</th>
                    <th className="py-2 pr-3 font-semibold">Movimento</th>
                    <th className="py-2 pr-3 text-right font-semibold">Valor</th>
                    <th className="py-2 text-right font-semibold">Disponível depois</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.transactions.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 pr-3 align-top text-sm text-ink-faint">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="py-2.5 pr-3 align-top">
                        <span className="font-semibold">{TYPE_LABELS[entry.type]}</span>
                        <span className="block text-sm text-ink-soft">{entry.description}</span>
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap py-2.5 pr-3 text-right align-top font-semibold tabular',
                          (entry.type === 'DEPOSIT' || entry.type === 'SALE_CREDIT' || entry.type === 'RELEASE') &&
                            'text-win',
                          (entry.type === 'CAPTURE' || entry.type === 'HOLD') && 'text-lose',
                        )}
                      >
                        {entry.type === 'CAPTURE' || entry.type === 'HOLD' ? '−' : '+'} {formatBRL(entry.amountCents)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right align-top tabular text-ink-soft">
                        {formatBRL(entry.balanceAfterCents - entry.heldAfterCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
