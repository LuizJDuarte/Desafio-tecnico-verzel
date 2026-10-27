import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { formatBRL, type MyBidDto, type MyBidStatus } from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { DeadlineText } from '../components/Countdown';
import { Paddle } from '../components/Paddle';
import { Button, EmptyState, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { cn } from '../lib/cn';
import { useMyBids } from '../lib/queries';

type Group = 'disputando' | 'arrematados' | 'encerrados';

const GROUPS: Array<{ id: Group; label: string; statuses: MyBidStatus[] }> = [
  { id: 'disputando', label: 'Em disputa', statuses: ['LEADING', 'OUTBID', 'SCHEDULED'] },
  { id: 'arrematados', label: 'Arrematados', statuses: ['WON'] },
  { id: 'encerrados', label: 'Não arrematados', statuses: ['LOST', 'CANCELLED'] },
];

const STATUS_TEXT: Record<MyBidStatus, { text: string; tone: string }> = {
  LEADING: { text: 'Você está ganhando', tone: 'text-win' },
  OUTBID: { text: 'Você foi superado', tone: 'text-lose' },
  WON: { text: 'Arrematado por você', tone: 'text-win' },
  LOST: { text: 'Outro licitante arrematou', tone: 'text-ink-faint' },
  CANCELLED: { text: 'Lote cancelado (valor estornado)', tone: 'text-ink-faint' },
  SCHEDULED: { text: 'Agendado', tone: 'text-ink-faint' },
};

async function shareReceipt(code: string, title: string) {
  const url = `${window.location.origin}/comprovante/${code}`;
  if ('share' in navigator) {
    try {
      await navigator.share({ title: 'Comprovante de arremate', text: `Arrematei "${title}" no Arremate.`, url });
      return;
    } catch {
      // cancelado: cai para copiar
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link do comprovante copiado.');
  } catch {
    toast.message(url);
  }
}

function Row({ item }: { item: MyBidDto }) {
  const status = STATUS_TEXT[item.status];
  const lot = item.lot;
  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
      <Link to={`/lotes/${lot.id}`} tabIndex={-1} aria-hidden className="w-28">
        <ArtworkImage image={lot.image} title={lot.title} className="aspect-square w-28" thumb />
      </Link>
      <div className="min-w-0">
        <p className="text-sm text-ink-faint">Lote {lot.number}</p>
        <Link to={`/lotes/${lot.id}`} className="title-art line-clamp-2 text-[19px] leading-snug hover:underline">
          {lot.title}
        </Link>
        {lot.artist && <p className="text-[15px] font-semibold">{lot.artist}</p>}
        <p className={cn('mt-1 font-semibold', status.tone)}>{status.text}</p>
        <p className="text-sm text-ink-soft">
          Seu maior lance {formatBRL(item.myMaxBidCents)} em {item.myBidCount} lance(s).{' '}
          {lot.phase === 'LIVE' && (
            <>
              Lance atual {formatBRL(lot.currentPriceCents ?? lot.startingPriceCents)}.{' '}
              <span className="tabular">
                <DeadlineText phase={lot.phase} startsAt={lot.startsAt} endsAt={lot.endsAt} />
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <Paddle
          alias={item.myAlias}
          tone={
            item.status === 'LEADING' || item.status === 'WON' ? 'win' : item.status === 'OUTBID' ? 'lose' : 'muted'
          }
        />
        {item.receiptCode ? (
          <div className="flex gap-2">
            <LinkButton to={`/comprovante/${item.receiptCode}`} size="sm" variant="win">
              Comprovante
            </LinkButton>
            <Button size="sm" variant="secondary" onClick={() => shareReceipt(item.receiptCode!, lot.title)}>
              Compartilhar
            </Button>
          </div>
        ) : (
          lot.phase === 'LIVE' && (
            <LinkButton to={`/lotes/${lot.id}`} size="sm" variant={item.status === 'OUTBID' ? 'primary' : 'secondary'}>
              {item.status === 'OUTBID' ? 'Cobrir lance' : 'Abrir sala'}
            </LinkButton>
          )
        )}
      </div>
    </li>
  );
}

export function MyBidsPage() {
  const query = useMyBids();
  const [group, setGroup] = useState<Group>('disputando');

  if (query.isPending) return <PageLoading label="Carregando seus lances" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar seus lances"
        message={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Tentar de novo</Button>}
      />
    );
  }

  const counts = Object.fromEntries(
    GROUPS.map((item) => [item.id, query.data.items.filter((bid) => item.statuses.includes(bid.status)).length]),
  ) as Record<Group, number>;
  const current = GROUPS.find((item) => item.id === group)!;
  const items = query.data.items.filter((bid) => current.statuses.includes(bid.status));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">Meus arremates</h1>
        <p className="mt-2 max-w-[60ch] text-[17px] text-ink-soft">
          Os lotes em que você deu lance, os que você venceu (com comprovante para compartilhar) e os que terminaram com
          outro arrematante.
        </p>
      </div>

      <div role="tablist" aria-label="Situação" className="flex gap-1 overflow-x-auto border-b border-line-strong">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={group === item.id}
            onClick={() => setGroup(item.id)}
            className={cn(
              'flex items-baseline gap-2 border-b-[3px] px-3 pb-2 pt-1 font-semiwide text-lg font-bold',
              group === item.id ? 'border-brand text-ink' : 'border-transparent text-ink-faint hover:text-ink',
            )}
          >
            {item.label}
            <span className="text-sm tabular">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title={group === 'arrematados' ? 'Você ainda não arrematou nenhum lote.' : 'Nada por aqui.'}>
          <Link to="/" className="font-semibold text-brand-text hover:underline">
            Ver lotes ao vivo
          </Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <Row key={item.lot.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
