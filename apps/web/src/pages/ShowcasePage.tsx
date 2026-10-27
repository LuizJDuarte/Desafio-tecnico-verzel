import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { formatBRL, type LotSummaryDto, type ShowcaseSort, type ShowcaseTab } from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { Countdown } from '../components/Countdown';
import { LotCard } from '../components/LotCard';
import { MuseumLabel } from '../components/MuseumLabel';
import { PhaseTag } from '../components/PhaseTag';
import { Button, EmptyState, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { cn } from '../lib/cn';
import { pluralize } from '../lib/format';
import { useShowcase } from '../lib/queries';

const TABS: Array<{ id: ShowcaseTab; label: string }> = [
  { id: 'live', label: 'Ao vivo' },
  { id: 'scheduled', label: 'Agendados' },
  { id: 'closed', label: 'Encerrados' },
];

const SORTS: Array<{ id: ShowcaseSort; label: string }> = [
  { id: 'relevance', label: 'Padrão da aba' },
  { id: 'ending', label: 'Termina antes' },
  { id: 'newest', label: 'Mais recentes' },
  { id: 'price_asc', label: 'Menor valor' },
  { id: 'price_desc', label: 'Maior valor' },
];

const EMPTY_MESSAGES: Record<ShowcaseTab, string> = {
  live: 'Nenhum lote em disputa agora.',
  scheduled: 'Nenhum lote agendado no momento.',
  closed: 'Nenhum lote encerrado ainda.',
};

/** Lote em destaque: o ao vivo com mais lances (a disputa mais quente da casa). */
function pickFeatured(lots: LotSummaryDto[]): LotSummaryDto | null {
  if (lots.length === 0) return null;
  return [...lots].sort((a, b) => b.bidCount - a.bidCount || Date.parse(a.endsAt) - Date.parse(b.endsAt))[0];
}

function FeaturedLot({ lot }: { lot: LotSummaryDto }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div className="order-2 lg:order-1">
        <h1 className="max-w-[18ch] font-serif text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.05] tracking-tight">
          Leilões ao vivo de obras em domínio público
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] text-ink-soft">
          Cada obra vem do acervo aberto do Art Institute of Chicago. Todo lance entra em um histórico encadeado e
          assinado que qualquer pessoa pode auditar.
        </p>

        <div className="mt-8 border-t border-line-strong pt-6">
          <div className="flex items-center gap-3">
            <PhaseTag phase="LIVE" />
            <span className="text-sm text-ink-faint">Disputa mais movimentada agora</span>
          </div>
          <MuseumLabel number={lot.number} artist={lot.artist} title={lot.title} className="mt-3" />
          <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <p className="text-sm text-ink-faint">{lot.bidCount > 0 ? 'Lance atual' : 'Lance inicial'}</p>
              <p className="font-wide text-3xl font-extrabold tabular">
                {formatBRL(lot.currentPriceCents ?? lot.startingPriceCents)}
              </p>
            </div>
            <div>
              <p className="text-sm text-ink-faint">Termina em</p>
              <Countdown target={lot.endsAt} className="font-wide text-3xl font-extrabold" />
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {pluralize(lot.bidCount, 'lance', 'lances')}, próximo lance a partir de {formatBRL(lot.minNextBidCents)}
          </p>
          <LinkButton to={`/lotes/${lot.id}`} size="lg" className="mt-6">
            Entrar na sala do lote {lot.number}
          </LinkButton>
        </div>
      </div>
      <Link to={`/lotes/${lot.id}`} className="order-1 block lg:order-2" tabIndex={-1} aria-hidden>
        <ArtworkImage image={lot.image} title={lot.title} className="aspect-[6/5] w-full" eager />
      </Link>
    </div>
  );
}

export function ShowcasePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((item) => item.id === params.get('aba')) ? params.get('aba') : 'live') as ShowcaseTab;
  const sort = (
    SORTS.some((item) => item.id === params.get('ordem')) ? params.get('ordem') : 'relevance'
  ) as ShowcaseSort;
  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);
  const query = params.get('busca') ?? '';
  const [searchText, setSearchText] = useState(query);

  // Busca com espera de 300 ms após a digitação (evita uma requisição por tecla).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() === query) return;
      const next = new URLSearchParams(params);
      if (searchText.trim()) next.set('busca', searchText.trim());
      else next.delete('busca');
      next.delete('pagina');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, query, params, setParams]);

  const showcase = useShowcase(tab, query, sort, page);
  const featuredSource = useShowcase('live', '', 'relevance', 1);
  const featured = useMemo(() => pickFeatured(featuredSource.data?.items ?? []), [featuredSource.data]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  if (showcase.isPending && featuredSource.isPending) return <PageLoading label="Carregando a vitrine" />;
  if (showcase.isError && !showcase.data) {
    return (
      <ErrorState
        title="Não foi possível carregar a vitrine"
        message={showcase.error.message}
        action={<Button onClick={() => void showcase.refetch()}>Tentar de novo</Button>}
      />
    );
  }

  const data = showcase.data;
  return (
    <div className="space-y-14">
      {featured ? (
        <FeaturedLot lot={featured} />
      ) : (
        <div>
          <h1 className="font-serif text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.05] tracking-tight">
            Vitrine de lotes
          </h1>
          <p className="mt-3 max-w-[60ch] text-[17px] text-ink-soft">
            Obras em domínio público do Art Institute of Chicago. Não há disputas ao vivo neste momento; veja os lotes
            agendados.
          </p>
        </div>
      )}

      <section aria-labelledby="vitrine-titulo" className="space-y-6">
        <h2 id="vitrine-titulo" className="sr-only">
          Lotes
        </h2>
        <div className="flex flex-col gap-4 border-b border-line-strong pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div role="tablist" aria-label="Situação dos lotes" className="flex gap-1 overflow-x-auto">
            {TABS.map((item) => {
              const selected = item.id === tab;
              return (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => update({ aba: item.id, pagina: null })}
                  className={cn(
                    'flex items-baseline gap-2 rounded-t-md border-b-[3px] px-3 pb-2 pt-1 font-semiwide text-lg font-bold transition-colors',
                    selected ? 'border-brand text-ink' : 'border-transparent text-ink-faint hover:text-ink',
                  )}
                >
                  {item.label}
                  <span className="text-sm font-semibold tabular text-ink-faint">{data?.counts[item.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">Buscar por obra, artista ou número do lote</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Obra, artista ou nº do lote"
                className="h-10 w-full rounded-lg border border-line-strong bg-raised pl-9 pr-3 text-[15px] placeholder:text-ink-faint focus:border-focus focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="whitespace-nowrap">Ordenar</span>
              <select
                value={sort}
                onChange={(event) =>
                  update({ ordem: event.target.value === 'relevance' ? null : event.target.value, pagina: null })
                }
                className="h-10 rounded-lg border border-line-strong bg-raised px-2 text-[15px] text-ink"
              >
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {data && data.items.length === 0 ? (
          <EmptyState title={query ? `Nada encontrado para "${query}" nesta aba.` : EMPTY_MESSAGES[tab]}>
            {query ? (
              <button
                type="button"
                className="font-semibold text-brand-text hover:underline"
                onClick={() => setSearchText('')}
              >
                Limpar busca
              </button>
            ) : tab === 'live' ? (
              <button
                type="button"
                className="font-semibold text-brand-text hover:underline"
                onClick={() => update({ aba: 'scheduled' })}
              >
                Ver lotes agendados
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div
            className={cn(
              'grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3',
              showcase.isPlaceholderData && 'opacity-60',
            )}
          >
            {data?.items.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <nav className="flex items-center justify-between border-t border-line pt-4" aria-label="Paginação">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ pagina: String(page - 1) })}
            >
              Anterior
            </Button>
            <span className="text-sm text-ink-soft">
              Página {data.page} de {data.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => update({ pagina: String(page + 1) })}
            >
              Próxima
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
