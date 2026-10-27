import type { LotPhase } from '@arremate/shared';
import { cn } from '../lib/cn';

const labels: Record<LotPhase, string> = {
  LIVE: 'Ao vivo',
  SCHEDULED: 'Agendado',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

export function PhaseTag({ phase, className }: { phase: LotPhase; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold',
        phase === 'LIVE' && 'bg-brand text-brand-ink',
        phase === 'SCHEDULED' && 'bg-raised text-ink ring-1 ring-line-strong',
        phase === 'CLOSED' && 'bg-ink text-wall',
        phase === 'CANCELLED' && 'bg-lose-soft text-lose',
        className,
      )}
    >
      {phase === 'LIVE' && <span className="live-dot bg-brand-ink!" aria-hidden />}
      {labels[phase]}
    </span>
  );
}
