import { useEffect, useRef, useState } from 'react';
import { formatBRL, type BidDto } from '@arremate/shared';
import { cn } from '../lib/cn';
import { formatClock, formatShortDateTime } from '../lib/format';
import { Paddle } from './Paddle';

/** Histórico de lances em tempo real (mais recente primeiro). O lance que acabou de chegar pisca. */
export function BidHistory({
  bids,
  myAlias,
  leaderAlias,
  limit = 12,
}: {
  bids: BidDto[];
  myAlias: string | null;
  leaderAlias: string | null;
  limit?: number;
}) {
  const latestSeq = bids[0]?.seq ?? 0;
  const seen = useRef(latestSeq);
  const [freshSeq, setFreshSeq] = useState<number | null>(null);

  useEffect(() => {
    if (latestSeq > seen.current) {
      setFreshSeq(latestSeq);
      seen.current = latestSeq;
    }
  }, [latestSeq]);

  if (bids.length === 0) {
    return (
      <p className="py-4 text-ink-soft">
        Nenhum lance ainda. O primeiro lance precisa ser de pelo menos o valor inicial.
      </p>
    );
  }

  const shown = bids.slice(0, limit);
  return (
    <ol className="divide-y divide-line" aria-label="Histórico de lances">
      {shown.map((bid) => {
        const mine = myAlias !== null && bid.bidderAlias === myAlias;
        const leading = bid.bidderAlias === leaderAlias && bid.seq === latestSeq;
        return (
          <li
            key={bid.seq}
            className={cn('flex items-center gap-3 py-2.5 pl-1 pr-2', freshSeq === bid.seq && 'bid-arrive')}
          >
            <span className="w-8 text-right text-[13px] text-ink-faint tabular">#{bid.seq}</span>
            <Paddle alias={bid.bidderAlias} tone={leading ? 'win' : mine ? 'neutral' : 'muted'} />
            <div className="min-w-0 flex-1">
              <p className="font-semiwide font-bold tabular">{formatBRL(bid.amountCents)}</p>
              <p className="text-[13px] text-ink-faint">
                <time dateTime={bid.createdAt} title={formatShortDateTime(bid.createdAt)}>
                  {formatClock(bid.createdAt)}
                </time>
                {mine && <span className="ml-2 font-semibold text-ink-soft">você</span>}
                {bid.extended && <span className="ml-2 font-semibold text-brand-text">prorrogou o fim</span>}
              </p>
            </div>
          </li>
        );
      })}
      {bids.length > limit && (
        <li className="py-2 text-center text-[13px] text-ink-faint">
          e mais {bids.length - limit} lance(s) anteriores na auditoria
        </li>
      )}
    </ol>
  );
}
