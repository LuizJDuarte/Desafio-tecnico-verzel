import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CircleAlert, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  centsToInputValue,
  formatBRL,
  LOT_LIMITS,
  parseBRLToCents,
  type CatalogItemDto,
  type CreateLotRequest,
  type LotDetailDto,
} from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { MoneyInput } from '../components/MoneyInput';
import { MuseumLabel } from '../components/MuseumLabel';
import { Button, EmptyState, Field, TextInput } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { localInputToIso, toLocalInputValue } from '../lib/format';
import { queryKeys, useCatalogSearch } from '../lib/queries';

const DURATIONS = [
  { label: '3 min', ms: 3 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 dia', ms: 24 * 60 * 60_000 },
  { label: '7 dias', ms: 7 * 24 * 60 * 60_000 },
];

function CatalogBrowser({
  selected,
  onSelect,
}: {
  selected: CatalogItemDto | null;
  onSelect(item: CatalogItemDto): void;
}) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useCatalogSearch(query, page);

  return (
    <section aria-labelledby="catalogo" className="space-y-4">
      <div>
        <h2 id="catalogo" className="font-semiwide text-lg font-bold">
          1. Escolha a obra no acervo do Art Institute of Chicago
        </h2>
        <p className="text-[15px] text-ink-soft">Somente obras em domínio público e com imagem.</p>
      </div>
      <label className="relative block">
        <span className="sr-only">Buscar obra por título, artista ou estilo</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex.: Monet, Hokusai, impressionism, portrait"
          className="h-11 w-full rounded-lg border border-line-strong bg-raised pl-9 pr-3 text-[15px] placeholder:text-ink-faint focus:border-focus focus:outline-none"
        />
      </label>

      {search.data?.meta.degraded && (
        <p className="flex gap-2 rounded-lg bg-brand/20 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {search.data.meta.message}
        </p>
      )}
      {search.isError && (
        <p className="flex gap-2 rounded-lg bg-lose-soft px-3 py-2 text-sm" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-lose" aria-hidden />
          {search.error.message}
        </p>
      )}
      {search.isPending && <p className="text-ink-faint">Buscando no acervo do museu…</p>}

      {search.data && search.data.items.length === 0 && (
        <EmptyState title="Nenhuma obra encontrada.">Tente outro termo, em inglês.</EmptyState>
      )}

      <ul className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3', search.isPlaceholderData && 'opacity-60')}>
        {search.data?.items.map((item) => {
          const isSelected = selected?.externalId === item.externalId;
          return (
            <li key={item.externalId}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={isSelected}
                className={cn(
                  'w-full rounded-md p-1.5 text-left ring-offset-2 ring-offset-wall',
                  isSelected ? 'ring-[3px] ring-brand' : 'hover:ring-1 hover:ring-line-strong',
                )}
              >
                <ArtworkImage
                  image={{ url: item.thumbnailUrl, lqip: item.lqip, alt: item.altText, stored: false }}
                  title={item.title}
                  className="aspect-square"
                  thumb
                />
                <p className="mt-2 line-clamp-1 text-sm font-semibold">{item.artist ?? 'Artista desconhecido'}</p>
                <p className="title-art line-clamp-2 text-[15px] leading-snug">{item.title}</p>
              </button>
            </li>
          );
        })}
      </ul>

      {search.data && search.data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-ink-faint">
            Página {search.data.page} de {search.data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= search.data.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </section>
  );
}

export function NewLotPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ids = {
    title: useId(),
    description: useId(),
    start: useId(),
    increment: useId(),
    startsAt: useId(),
    endsAt: useId(),
  };
  const [item, setItem] = useState<CatalogItemDto | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startText, setStartText] = useState(centsToInputValue(10_000_00));
  const [incrementText, setIncrementText] = useState(centsToInputValue(500_00));
  const [startNow, setStartNow] = useState(true);
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
  const [endsAt, setEndsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 24 * 60 * 60_000)));
  const [error, setError] = useState<string | null>(null);

  const startingPrice = parseBRLToCents(startText);
  const increment = parseBRLToCents(incrementText);

  const create = useMutation({
    mutationFn: (body: CreateLotRequest) => api<LotDetailDto>('/lots', { method: 'POST', json: body }),
    onSuccess: (lot) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.showcaseAll });
      toast.success(`Lote ${lot.number} criado.`);
      navigate(`/lotes/${lot.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível criar o lote.'),
  });

  const applyDuration = (ms: number) => {
    const base = startNow ? new Date() : new Date(localInputToIso(startsAt) ?? Date.now());
    setEndsAt(toLocalInputValue(new Date(base.getTime() + ms)));
  };

  const previewImage = useMemo(
    () => (item ? { url: item.imageUrl, lqip: item.lqip, alt: item.altText, stored: false } : null),
    [item],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!item) return setError('Escolha uma obra no catálogo.');
    if (startingPrice === null || startingPrice < LOT_LIMITS.minPriceCents)
      return setError('Informe um lance inicial de pelo menos R$ 1,00.');
    if (increment === null || increment < LOT_LIMITS.minIncrementCents)
      return setError('Informe um incremento mínimo de pelo menos R$ 1,00.');
    const endsIso = localInputToIso(endsAt);
    const startsIso = startNow ? undefined : (localInputToIso(startsAt) ?? undefined);
    if (!endsIso) return setError('Informe a data de encerramento.');
    if (!startNow && !startsIso) return setError('Informe a data de início.');
    create.mutate({
      externalId: item.externalId,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      startingPriceCents: startingPrice,
      minIncrementCents: increment,
      startNow,
      startsAt: startsIso,
      endsAt: endsIso,
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">Criar lote</h1>
        <p className="mt-2 max-w-[62ch] text-[17px] text-ink-soft">
          Os dados e a imagem da obra são copiados para o leilão no momento da criação. Se a API do museu cair depois, o
          lote continua funcionando normalmente.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CatalogBrowser
          selected={item}
          onSelect={(chosen) => {
            setItem(chosen);
            setTitle('');
          }}
        />

        <form onSubmit={submit} className="space-y-5 lg:sticky lg:top-24 lg:self-start" noValidate>
          <h2 className="font-semiwide text-lg font-bold">2. Defina as condições do lote</h2>
          {item && previewImage ? (
            <div className="flex gap-4 rounded-xl border border-line bg-surface p-4">
              <ArtworkImage image={previewImage} title={item.title} className="aspect-square w-28 shrink-0" thumb />
              <MuseumLabel compact artist={item.artist} title={title.trim() || item.title} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong p-4 text-[15px] text-ink-soft">
              Nenhuma obra escolhida ainda.
            </p>
          )}

          <Field label="Título do lote" htmlFor={ids.title} hint="Opcional. Por padrão, o título da obra no museu.">
            <TextInput
              id={ids.title}
              value={title}
              maxLength={300}
              placeholder={item?.title ?? ''}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field
            label="Descrição"
            htmlFor={ids.description}
            hint="Opcional: estado de conservação, observações do leiloeiro."
          >
            <textarea
              id={ids.description}
              value={description}
              maxLength={2000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-[15px] focus:border-focus focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lance inicial" htmlFor={ids.start}>
              <MoneyInput
                id={ids.start}
                value={startText}
                onValueChange={(text) => setStartText(text)}
                invalid={startingPrice === null}
              />
            </Field>
            <Field label="Incremento mínimo" htmlFor={ids.increment}>
              <MoneyInput
                id={ids.increment}
                value={incrementText}
                onValueChange={(text) => setIncrementText(text)}
                invalid={increment === null}
              />
            </Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Início</legend>
            <div className="flex gap-2">
              {[
                [true, 'Começar agora'],
                [false, 'Agendar'],
              ].map(([value, label]) => (
                <label
                  key={String(value)}
                  className={cn(
                    'cursor-pointer rounded-lg border px-3 py-2 text-[15px] font-semibold',
                    startNow === value ? 'border-ink ring-1 ring-ink' : 'border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={startNow === value}
                    onChange={() => setStartNow(value as boolean)}
                  />
                  {label as string}
                </label>
              ))}
            </div>
            {!startNow && (
              <Field label="Data e hora de início" htmlFor={ids.startsAt}>
                <TextInput
                  id={ids.startsAt}
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
            )}
          </fieldset>

          <Field
            label="Data e hora de encerramento"
            htmlFor={ids.endsAt}
            hint="Lances nos últimos 2 minutos prorrogam o encerramento."
          >
            <TextInput
              id={ids.endsAt}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-faint">Duração rápida:</span>
            {DURATIONS.map((duration) => (
              <button
                key={duration.label}
                type="button"
                onClick={() => applyDuration(duration.ms)}
                className="rounded-full border border-line-strong px-3 py-1 font-semibold hover:border-ink-faint"
              >
                {duration.label}
              </button>
            ))}
          </div>

          {startingPrice !== null && increment !== null && (
            <p className="text-sm text-ink-soft">
              Primeiro lance a partir de {formatBRL(startingPrice)}; depois, sempre pelo menos {formatBRL(increment)}{' '}
              acima do lance atual.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-lose-soft px-3 py-2 text-[15px]" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={create.isPending} disabled={!item}>
            Publicar lote
          </Button>
        </form>
      </div>
    </div>
  );
}
