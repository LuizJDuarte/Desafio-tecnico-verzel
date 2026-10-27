import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL, type AuctioneerLotDto, type AuctioneerLotResult } from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeadlineText } from '../components/Countdown';
import { Paddle } from '../components/Paddle';
import { Button, EmptyState, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { formatShortDateTime } from '../lib/format';
import { queryKeys, useDashboard } from '../lib/queries';

const RESULT_TEXT: Record<AuctioneerLotResult, { label: string; className: string }> = {
  LIVE: { label: 'Ao vivo', className: 'bg-brand text-brand-ink' },
  SCHEDULED: { label: 'Agendado', className: 'ring-1 ring-line-strong text-ink' },
  AWAITING_SETTLEMENT: { label: 'Encerrando', className: 'ring-1 ring-line-strong text-ink' },
  SOLD: { label: 'Arrematado', className: 'bg-win text-white' },
  UNSOLD: { label: 'Sem lances', className: 'bg-surface text-ink-soft ring-1 ring-line' },
  CANCELLED: { label: 'Cancelado', className: 'bg-lose-soft text-lose' },
};

export function AuctioneerDashboardPage() {
  const dashboard = useDashboard();
  const queryClient = useQueryClient();
  const [toCancel, setToCancel] = useState<AuctioneerLotDto | null>(null);
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: (lot: AuctioneerLotDto) =>
      api(`/lots/${lot.id}/cancel`, { method: 'POST', json: { reason: reason.trim() || undefined } }),
    onSuccess: (_data, lot) => {
      toast.success(
        lot.cancelRefundsLeader
          ? `Lote ${lot.number} cancelado. O valor comprometido do licitante líder foi estornado.`
          : `Lote ${lot.number} cancelado.`,
      );
      setToCancel(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.showcaseAll });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível cancelar.'),
  });

  if (dashboard.isPending) return <PageLoading label="Carregando o painel" />;
  if (dashboard.isError) {
    return (
      <ErrorState
        title="Não foi possível abrir o painel"
        message={dashboard.error.message}
        action={<Button onClick={() => void dashboard.refetch()}>Tentar de novo</Button>}
      />
    );
  }
  const { lots, summary } = dashboard.data;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">Painel do leiloeiro</h1>
          <p className="mt-2 max-w-[60ch] text-[17px] text-ink-soft">
            Seus lotes, o resultado de cada um e quanto você já recebeu.
          </p>
        </div>
        <LinkButton to="/painel/novo-lote" size="lg">
          <Plus className="size-5" aria-hidden />
          Criar lote
        </LinkButton>
      </div>

      <dl className="grid gap-6 border-y border-line-strong py-6 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div>
          <dt className="text-sm text-ink-faint">Total recebido</dt>
          <dd className="font-wide text-4xl font-extrabold tabular text-win">
            {formatBRL(summary.totalReceivedCents)}
          </dd>
        </div>
        {(
          [
            ['Arrematados', summary.soldCount],
            ['Ao vivo', summary.liveCount],
            ['Agendados', summary.scheduledCount],
            ['Sem lances', summary.unsoldCount],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-ink-faint">{label}</dt>
            <dd className="font-wide text-2xl font-bold tabular">{value}</dd>
          </div>
        ))}
      </dl>

      {lots.length === 0 ? (
        <EmptyState title="Você ainda não criou lotes.">
          <Link to="/painel/novo-lote" className="font-semibold text-brand-text hover:underline">
            Buscar uma obra no catálogo do museu
          </Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-[15px]">
            <thead className="text-sm text-ink-faint">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-semibold">Lote</th>
                <th className="py-2 pr-4 font-semibold">Situação</th>
                <th className="py-2 pr-4 text-right font-semibold">Lances</th>
                <th className="py-2 pr-4 text-right font-semibold">Valor</th>
                <th className="py-2 pr-4 font-semibold">Arrematante ou líder</th>
                <th className="py-2 pr-4 font-semibold">Prazo</th>
                <th className="py-2 font-semibold">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lots.map((lot) => {
                const result = RESULT_TEXT[lot.result];
                const value = lot.finalPriceCents ?? lot.currentPriceCents;
                return (
                  <tr key={lot.id} className="align-middle">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <ArtworkImage
                          image={lot.image}
                          title={lot.title}
                          className="aspect-square w-14 shrink-0 p-1"
                          thumb
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-ink-faint">Lote {lot.number}</p>
                          <Link to={`/lotes/${lot.id}`} className="title-art line-clamp-1 text-[17px] hover:underline">
                            {lot.title}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-semibold', result.className)}>
                        {result.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular">{lot.bidCount}</td>
                    <td className="py-3 pr-4 text-right font-semibold tabular">
                      {value !== null ? (
                        formatBRL(value)
                      ) : (
                        <span className="font-normal text-ink-faint">{formatBRL(lot.startingPriceCents)} inicial</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {lot.winnerAlias ? (
                        <Paddle
                          alias={lot.winnerAlias}
                          tone="win"
                          title={`Arrematado pelo licitante ${lot.winnerAlias}`}
                        />
                      ) : lot.leaderAlias && lot.state === 'OPEN' ? (
                        <span className="flex items-center gap-2 text-sm text-ink-faint">
                          <Paddle
                            alias={lot.leaderAlias}
                            tone="neutral"
                            title={`Liderando: licitante ${lot.leaderAlias}`}
                          />
                          lidera
                        </span>
                      ) : (
                        <span className="text-ink-faint">Nenhum</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm text-ink-soft tabular">
                      {lot.result === 'LIVE' || lot.result === 'SCHEDULED' ? (
                        <DeadlineText phase={lot.phase} startsAt={lot.startsAt} endsAt={lot.endsAt} />
                      ) : (
                        formatShortDateTime(lot.endsAt)
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {lot.receiptCode && (
                          <LinkButton to={`/comprovante/${lot.receiptCode}`} size="sm" variant="ghost">
                            Comprovante
                          </LinkButton>
                        )}
                        <LinkButton to={`/auditoria/${lot.id}`} size="sm" variant="ghost">
                          Auditoria
                        </LinkButton>
                        {lot.canCancel && (
                          <Button size="sm" variant="danger" onClick={() => setToCancel(lot)}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title={toCancel ? `Cancelar o lote ${toCancel.number}?` : ''}
        confirmLabel="Cancelar lote"
        cancelLabel="Manter lote"
        danger
        loading={cancel.isPending}
        onClose={() => {
          setToCancel(null);
          setReason('');
        }}
        onConfirm={() => toCancel && cancel.mutate(toCancel)}
      >
        {toCancel?.cancelRefundsLeader ? (
          <p>
            Este lote já tem {toCancel.bidCount} lance(s). Ao cancelar, o valor comprometido do licitante que lidera (
            {formatBRL(toCancel.currentPriceCents ?? 0)}) volta automaticamente para o saldo disponível dele.
          </p>
        ) : (
          <p>O lote sai da vitrine e não aceitará lances. Esta ação não pode ser desfeita.</p>
        )}
        <label className="block pt-2 text-sm font-semibold text-ink">
          Motivo (opcional, aparece na sala do lote)
          <input
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-raised px-3 font-normal"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
