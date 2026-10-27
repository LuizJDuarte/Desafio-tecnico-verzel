import { Link, useParams } from 'react-router';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { ArtworkImage } from '../components/ArtworkImage';
import { BidHistory } from '../components/BidHistory';
import { BidPanel } from '../components/BidPanel';
import { AttributeList, MuseumLabel } from '../components/MuseumLabel';
import { PhaseTag } from '../components/PhaseTag';
import { Button, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { useLotChannel } from '../hooks/useLotChannel';
import { ApiError } from '../lib/api';
import { formatDateTime, formatSpan } from '../lib/format';
import { useLotBids, useLotPage } from '../lib/queries';

export function LotRoomPage() {
  const { id = '' } = useParams();
  const page = useLotPage(id);
  const bids = useLotBids(id);
  useLotChannel(id);

  if (page.isPending) return <PageLoading label="Abrindo a sala do lote" />;
  if (page.isError) {
    const missing = page.error instanceof ApiError && (page.error.status === 404 || page.error.status === 400);
    return (
      <ErrorState
        title={missing ? 'Lote não encontrado' : 'Não foi possível abrir a sala'}
        message={missing ? 'O link pode estar incorreto ou o lote não existe mais.' : page.error.message}
        action={
          missing ? (
            <LinkButton to="/">Voltar para a vitrine</LinkButton>
          ) : (
            <Button onClick={() => void page.refetch()}>Tentar de novo</Button>
          )
        }
      />
    );
  }

  const { lot, viewer } = page.data;
  return (
    <div className="space-y-10">
      <nav aria-label="Trilha" className="flex flex-wrap items-center gap-2 text-sm text-ink-faint">
        <Link to="/" className="hover:text-ink">
          Vitrine
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">Lote {lot.number}</span>
        <PhaseTag phase={lot.phase} className="ml-2" />
      </nav>

      {/* No celular a ordem é obra, mesa de lances e só depois a ficha técnica; no desktop, duas colunas. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-12 lg:gap-y-8">
        <div className="lg:col-start-1 lg:row-start-1">
          <ArtworkImage image={lot.image} title={lot.title} className="aspect-[6/5] w-full" eager />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <MuseumLabel number={lot.number} artist={lot.artist} title={lot.title} attributes={lot.attributes} />
              {lot.description && (
                <p className="mt-4 max-w-[62ch] font-serif text-[17px] leading-relaxed text-ink-soft">
                  {lot.description}
                </p>
              )}
              <p className="mt-4 text-sm text-ink-faint">
                Leiloeiro: <span className="text-ink-soft">{lot.seller.name}</span>
              </p>
              <a
                href={lot.source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-text hover:underline"
              >
                Ver a obra no {lot.source.providerName}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
            <AttributeList attributes={lot.attributes} />
          </div>
        </div>

        <aside className="row-start-2 space-y-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <BidPanel page={page.data} />

          <section aria-labelledby="historico-titulo" className="rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 id="historico-titulo" className="font-semiwide font-bold">
                Histórico de lances
              </h2>
              <Link
                to={`/auditoria/${lot.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text hover:underline"
              >
                <ShieldCheck className="size-4" aria-hidden />
                Auditar
              </Link>
            </div>
            <div className="px-4">
              {bids.isPending ? (
                <p className="py-4 text-ink-faint">Carregando lances…</p>
              ) : (
                <BidHistory bids={bids.data ?? []} myAlias={viewer.alias} leaderAlias={lot.leaderAlias} />
              )}
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line px-5 py-4 text-sm">
            <div>
              <dt className="text-ink-faint">Início</dt>
              <dd className="text-ink-soft">{formatDateTime(lot.startsAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Fim previsto</dt>
              <dd className="text-ink-soft">{formatDateTime(lot.originalEndsAt)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-ink-faint">Prorrogação</dt>
              <dd className="text-ink-soft">
                Lance aceito nos últimos {formatSpan(lot.antiSniping.windowSeconds)} estende o fim para{' '}
                {formatSpan(lot.antiSniping.extensionSeconds)} depois dele.
              </dd>
            </div>
            {lot.cancelReason && (
              <div className="col-span-2">
                <dt className="text-ink-faint">Motivo do cancelamento</dt>
                <dd className="text-ink-soft">{lot.cancelReason}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </div>
  );
}
