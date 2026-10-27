import { cn } from '../lib/cn';

export type PaddleTone = 'win' | 'lose' | 'neutral' | 'muted' | 'brand';

const tones: Record<PaddleTone, string> = {
  win: 'bg-win text-win-ink ring-win',
  lose: 'bg-lose text-lose-ink ring-lose',
  neutral: 'bg-raised text-ink ring-line-strong',
  muted: 'bg-surface text-ink-faint ring-line',
  brand: 'bg-brand text-brand-ink ring-brand',
};

const sizes = {
  sm: 'h-7 min-w-[3.6rem] px-2 text-[11px] ring-1',
  md: 'h-11 min-w-[5.4rem] px-3 text-sm ring-2',
  lg: 'h-24 w-32 text-xl ring-[3px]',
};

/**
 * A "raquete" numerada do salão de leilões. Aqui o número é o pseudônimo do licitante no lote:
 * identifica quem deu cada lance sem revelar nome, e-mail ou id.
 */
export function Paddle({
  alias,
  tone = 'neutral',
  size = 'sm',
  handle = false,
  className,
  title,
}: {
  alias: string;
  tone?: PaddleTone;
  size?: keyof typeof sizes;
  handle?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn('paddle shrink-0', handle && 'paddle-handle', tones[tone], sizes[size], className)}
      title={title ?? `Licitante ${alias}`}
      aria-label={title ?? `Licitante ${alias}`}
    >
      {alias}
    </span>
  );
}
