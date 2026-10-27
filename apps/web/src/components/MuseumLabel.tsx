import type { LotAttribute } from '@arremate/shared';
import { cn } from '../lib/cn';

/**
 * Etiqueta de museu: artista em destaque, título da obra em itálico e os dados técnicos.
 * É o mesmo formato das etiquetas ao lado das obras no Art Institute of Chicago.
 */
export function MuseumLabel({
  number,
  artist,
  title,
  attributes,
  compact = false,
  className,
}: {
  number?: number;
  artist: string | null;
  title: string;
  attributes?: LotAttribute[];
  compact?: boolean;
  className?: string;
}) {
  const date = attributes?.find((attribute) => attribute.label === 'Data')?.value;
  const medium = attributes?.find((attribute) => attribute.label === 'Técnica')?.value;
  return (
    <div className={cn('text-ink', className)}>
      {number !== undefined && (
        <p className="font-narrow text-[13px] font-semibold text-ink-faint tabular">Lote {number}</p>
      )}
      {artist && <p className={cn('font-semibold', compact ? 'text-[15px]' : 'text-lg')}>{artist}</p>}
      <p className={cn('title-art leading-snug', compact ? 'line-clamp-2 text-[17px]' : 'text-2xl md:text-[1.7rem]')}>
        {title}
      </p>
      {!compact && (date || medium) && (
        <p className="mt-1 font-serif text-[17px] text-ink-soft">{[date, medium].filter(Boolean).join(', ')}</p>
      )}
    </div>
  );
}

/** Ficha técnica completa (atributos vindos da API do museu, gravados no lote). */
export function AttributeList({ attributes }: { attributes: LotAttribute[] }) {
  const shown = attributes.filter((attribute) => attribute.label !== 'Artista');
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {shown.map((attribute) => (
        <div key={attribute.label} className="contents">
          <dt className="text-sm font-semibold text-ink-faint">{attribute.label}</dt>
          <dd className="font-serif text-[17px] leading-snug text-ink">{attribute.value}</dd>
        </div>
      ))}
    </dl>
  );
}
