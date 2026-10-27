import { Link } from 'react-router';
import { formatBRL, type LotSummaryDto } from '@arremate/shared';
import { pluralize } from '../lib/format';
import { ArtworkImage } from './ArtworkImage';
import { DeadlineText } from './Countdown';
import { MuseumLabel } from './MuseumLabel';
import { PhaseTag } from './PhaseTag';

function priceLine(lot: LotSummaryDto): { label: string; value: string | null } {
  if (lot.phase === 'CLOSED') {
    return lot.hasWinner || lot.currentPriceCents !== null
      ? { label: 'Arrematado por', value: formatBRL(lot.finalPriceCents ?? lot.currentPriceCents ?? 0) }
      : { label: 'Encerrado sem lances', value: null };
  }
  if (lot.bidCount > 0 && lot.currentPriceCents !== null) {
    return { label: 'Lance atual', value: formatBRL(lot.currentPriceCents) };
  }
  return { label: 'Lance inicial', value: formatBRL(lot.startingPriceCents) };
}

/** Obra "pendurada" com sua etiqueta, como numa parede de galeria. */
export function LotCard({ lot, showPhase = false }: { lot: LotSummaryDto; showPhase?: boolean }) {
  const price = priceLine(lot);
  return (
    <Link
      to={`/lotes/${lot.id}`}
      className="group flex flex-col rounded-[3px] focus-visible:outline-offset-4"
      aria-label={`Lote ${lot.number}: ${lot.title}${lot.artist ? `, de ${lot.artist}` : ''}`}
    >
      <ArtworkImage image={lot.image} title={lot.title} className="aspect-[5/4]" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <MuseumLabel compact number={lot.number} artist={lot.artist} title={lot.title} />
        {showPhase && <PhaseTag phase={lot.phase} className="mt-0.5 shrink-0" />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
        <div>
          <p className="text-[13px] text-ink-faint">{price.label}</p>
          {price.value && <p className="font-wide text-lg font-bold tabular leading-tight">{price.value}</p>}
        </div>
        <div className="text-right text-[13px] leading-snug text-ink-soft">
          <p className="tabular">
            <DeadlineText phase={lot.phase} startsAt={lot.startsAt} endsAt={lot.endsAt} />
          </p>
          {lot.phase !== 'SCHEDULED' && <p>{pluralize(lot.bidCount, 'lance', 'lances')}</p>}
        </div>
      </div>
    </Link>
  );
}
