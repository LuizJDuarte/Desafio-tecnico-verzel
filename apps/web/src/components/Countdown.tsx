import { useEffect, useRef } from 'react';
import type { LotPhase } from '@arremate/shared';
import { useServerNow } from '../hooks/useNow';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';

/**
 * Contagem regressiva baseada na hora do servidor. Ao chegar a zero chama onElapsed, para a página
 * buscar o novo estado (lote que abriu ou que encerrou).
 */
export function Countdown({
  target,
  onElapsed,
  className,
}: {
  target: string;
  onElapsed?: () => void;
  className?: string;
}) {
  const now = useServerNow(250);
  const remaining = Date.parse(target) - now;
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (remaining <= 0 && firedFor.current !== target) {
      firedFor.current = target;
      onElapsed?.();
    }
  }, [remaining, target, onElapsed]);

  return (
    <span className={cn('tabular', className)} aria-live="off">
      {formatDuration(remaining)}
    </span>
  );
}

/** Texto curto de prazo para cards e listas. */
export function DeadlineText({ phase, startsAt, endsAt }: { phase: LotPhase; startsAt: string; endsAt: string }) {
  if (phase === 'SCHEDULED') {
    return (
      <>
        Abre em <Countdown target={startsAt} />
      </>
    );
  }
  if (phase === 'LIVE') {
    return (
      <>
        Termina em <Countdown target={endsAt} />
      </>
    );
  }
  if (phase === 'CANCELLED') return <>Cancelado</>;
  return <>Encerrado</>;
}
