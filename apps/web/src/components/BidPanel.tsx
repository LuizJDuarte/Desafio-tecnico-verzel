import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CircleAlert, CircleCheck, Timer } from 'lucide-react';
import {
  bidRejectionMessage,
  bidRejectionTitle,
  centsToInputValue,
  formatBRL,
  isBidRejectionCode,
  parseBRLToCents,
  type BidDto,
  type BidRejectionDetails,
  type LotPageDto,
  type PlaceBidResponse,
} from '@arremate/shared';
import { useServerNow } from '../hooks/useNow';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime, formatSpan } from '../lib/format';
import { queryKeys } from '../lib/queries';
import { Countdown } from './Countdown';
import { MoneyInput } from './MoneyInput';
import { Paddle, type PaddleTone } from './Paddle';
import { Button, LinkButton } from './ui';

type Feedback = { tone: 'error' | 'success'; title: string; message: string };

interface ViewerStatus {
  tone: PaddleTone;
  headline: string;
  detail: string;
}

function viewerStatus(page: LotPageDto): ViewerStatus | null {
  const { lot, viewer } = page;
  if (!viewer.authenticated || viewer.role !== 'BIDDER' || !viewer.alias) return null;
  const minimum = formatBRL(lot.minNextBidCents);
  const myMax = viewer.myMaxBidCents !== null ? formatBRL(viewer.myMaxBidCents) : null;

  switch (lot.phase) {
    case 'LIVE':
      if (viewer.isLeader) {
        return {
          tone: 'win',
          headline: 'Você está ganhando',
          detail: `Seu lance de ${formatBRL(lot.currentPriceCents ?? 0)} é o maior. Se alguém cobrir, o valor volta na hora para o seu saldo disponível.`,
        };
      }
      if (viewer.hasBid) {
        return {
          tone: 'lose',
          headline: 'Você foi superado',
          detail: `Seu maior lance foi ${myMax}. Para voltar à liderança, dê pelo menos ${minimum}.`,
        };
      }
      return {
        tone: 'neutral',
        headline: 'Seu número neste lote',
        detail: 'É assim que você aparece no histórico e na auditoria, sem expor seu nome.',
      };
    case 'SCHEDULED':
      return {
        tone: 'neutral',
        headline: 'Lote agendado',
        detail: `Os lances abrem em ${formatDateTime(lot.startsAt)}.`,
      };
    case 'CANCELLED':
      return {
        tone: 'muted',
        headline: 'Lote cancelado',
        detail: viewer.hasBid
          ? 'O leiloeiro cancelou este lote. Se você liderava, o valor comprometido voltou ao seu saldo disponível.'
          : 'O leiloeiro cancelou este lote.',
      };
    case 'CLOSED':
      if (viewer.isLeader && lot.bidCount > 0) {
        return {
          tone: 'win',
          headline: 'Você arrematou',
          detail: `O lote é seu por ${formatBRL(lot.finalPriceCents ?? lot.currentPriceCents ?? 0)}.`,
        };
      }
      return viewer.hasBid
        ? {
            tone: 'muted',
            headline: 'Não foi desta vez',
            detail: `Seu maior lance foi ${myMax}. O valor não ficou comprometido.`,
          }
        : { tone: 'muted', headline: 'Lote encerrado', detail: 'Os lances deste lote foram encerrados.' };
  }
}

export function BidPanel({ page }: { page: LotPageDto }) {
  const { lot, viewer } = page;
  const queryClient = useQueryClient();
  const location = useLocation();
  const inputId = useId();
  const now = useServerNow(500);

  const [amountText, setAmountText] = useState(() => centsToInputValue(lot.minNextBidCents));
  const [edited, setEdited] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Enquanto o licitante não digitar um valor próprio, o campo acompanha o mínimo atual em tempo real.
  useEffect(() => {
    if (!edited) setAmountText(centsToInputValue(lot.minNextBidCents));
  }, [lot.minNextBidCents, edited]);

  // Mensagens de lance perdem o sentido quando o lote muda de fase (abriu, encerrou, foi cancelado).
  useEffect(() => {
    setFeedback(null);
  }, [lot.phase]);

  // O valor só "pisca" quando chega um lance novo, não na primeira renderização.
  const initialBidCount = useRef(lot.bidCount);
  const priceChanged = lot.bidCount !== initialBidCount.current;

  const status = viewerStatus(page);
  const statusKey = status?.headline ?? 'none';
  const previousStatus = useRef(statusKey);
  const [raise, setRaise] = useState(false);
  useEffect(() => {
    if (previousStatus.current !== statusKey) {
      previousStatus.current = statusKey;
      setRaise(true);
      const timer = setTimeout(() => setRaise(false), 700);
      return () => clearTimeout(timer);
    }
  }, [statusKey]);

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      api<PlaceBidResponse>(`/lots/${lot.id}/bids`, { method: 'POST', json: { amountCents } }),
    onSuccess: (data) => {
      queryClient.setQueryData<LotPageDto>(queryKeys.lot(lot.id), {
        lot: data.lot,
        viewer: data.viewer,
        serverTime: data.serverTime,
      });
      queryClient.setQueryData<BidDto[]>(queryKeys.bids(lot.id), (old) =>
        old && !old.some((bid) => bid.seq === data.bid.seq) ? [data.bid, ...old] : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myBids });
      setEdited(false);
      setFeedback({
        tone: 'success',
        title: 'Lance registrado',
        message: `Seu lance de ${formatBRL(data.bid.amountCents)} é o maior agora.${
          data.bid.extended ? ' Como foi nos últimos 2 minutos, o encerramento foi prorrogado.' : ''
        }`,
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && isBidRejectionCode(error.code)) {
        setFeedback({
          tone: 'error',
          title: bidRejectionTitle(error.code),
          message: bidRejectionMessage(error.code, error.details as BidRejectionDetails, formatDateTime),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.lot(lot.id) });
      } else {
        setFeedback({
          tone: 'error',
          title: 'Lance não enviado',
          message: error instanceof Error ? error.message : 'Tente novamente.',
        });
      }
    },
  });

  const amountCents = parseBRLToCents(amountText);
  const submit = (cents: number | null) => {
    setFeedback(null);
    if (cents === null || cents <= 0) {
      setFeedback({
        tone: 'error',
        title: 'Valor inválido',
        message: 'Digite um valor em reais, por exemplo 1.250,00.',
      });
      return;
    }
    mutation.mutate(cents);
  };

  const remainingMs = Date.parse(lot.endsAt) - now;
  const finalStretch = lot.phase === 'LIVE' && remainingMs > 0 && remainingMs <= lot.antiSniping.windowSeconds * 1000;
  const isBidder = viewer.authenticated && viewer.role === 'BIDDER';
  const canBid = isBidder && lot.phase === 'LIVE';
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.lot(lot.id) });

  return (
    <section aria-labelledby="bid-desk-title" className="rounded-xl border border-line bg-surface">
      <h2 id="bid-desk-title" className="sr-only">
        Mesa de lances
      </h2>

      {/* Situação de quem está olhando: a raquete muda de cor ao ganhar ou ser superado. */}
      <div className="flex items-center gap-5 border-b border-line p-5" aria-live="polite">
        {status && viewer.alias ? (
          <>
            <div className="pb-6">
              <Paddle
                alias={viewer.alias}
                tone={status.tone}
                size="lg"
                handle
                className={cn(raise && 'paddle-raise')}
              />
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'font-serif text-[1.65rem] leading-tight',
                  status.tone === 'win' && 'text-win',
                  status.tone === 'lose' && 'text-lose',
                )}
              >
                {status.headline}
              </p>
              <p className="mt-1 text-[15px] text-ink-soft">{status.detail}</p>
              {viewer.position !== null && lot.phase === 'LIVE' && (
                <p className="mt-1 text-sm font-semibold text-ink-soft">
                  Sua posição: {viewer.position}º de {viewer.totalBidders} licitante(s)
                </p>
              )}
              {lot.phase === 'CLOSED' && viewer.receiptCode && (
                <LinkButton to={`/comprovante/${viewer.receiptCode}`} variant="win" size="sm" className="mt-3">
                  Ver comprovante de arremate
                </LinkButton>
              )}
            </div>
          </>
        ) : !viewer.authenticated ? (
          <div>
            <p className="font-serif text-[1.65rem] leading-tight">Entre para dar lances</p>
            <p className="mt-1 text-[15px] text-ink-soft">
              Qualquer pessoa acompanha a sala ao vivo. Para disputar, use uma conta de licitante.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton to="/entrar" state={{ from: location.pathname }} size="sm">
                Entrar
              </LinkButton>
              <LinkButton to="/cadastro" state={{ from: location.pathname }} variant="secondary" size="sm">
                Criar conta
              </LinkButton>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-serif text-[1.65rem] leading-tight">
              {viewer.isSeller ? 'Este lote é seu' : 'Você está como leiloeiro'}
            </p>
            <p className="mt-1 text-[15px] text-ink-soft">
              {viewer.isSeller
                ? 'Acompanhe os lances em tempo real. Leiloeiros não podem dar lances.'
                : 'Leiloeiros acompanham a sala, mas não podem dar lances.'}
            </p>
            {viewer.isSeller && lot.phase === 'CLOSED' && viewer.receiptCode && (
              <LinkButton to={`/comprovante/${viewer.receiptCode}`} variant="secondary" size="sm" className="mt-3">
                Ver comprovante emitido
              </LinkButton>
            )}
          </div>
        )}
      </div>

      {/* Quadro de lances: valor atual em destaque e, abaixo, o prazo. */}
      <div className="space-y-4 p-5">
        <div>
          <p className="text-sm text-ink-faint">
            {lot.phase === 'CLOSED'
              ? lot.hasWinner
                ? 'Arrematado por'
                : 'Lance final'
              : lot.bidCount > 0
                ? 'Lance atual'
                : 'Lance inicial'}
          </p>
          <p
            key={lot.bidCount}
            className={cn(
              'inline-block rounded font-wide text-[clamp(1.9rem,6vw,2.6rem)] font-extrabold leading-tight tabular',
              priceChanged && 'bid-arrive',
            )}
          >
            {lot.phase === 'CLOSED' && !lot.hasWinner && lot.bidCount === 0
              ? 'Sem lances'
              : formatBRL(lot.finalPriceCents ?? lot.currentPriceCents ?? lot.startingPriceCents)}
          </p>
          <p className="text-sm text-ink-soft">
            {lot.bidCount} lance(s), incremento de {formatBRL(lot.minIncrementCents)}
          </p>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-4">
          <p className="text-sm text-ink-faint">
            {lot.phase === 'SCHEDULED' ? 'Abre em' : lot.phase === 'LIVE' ? 'Termina em' : 'Encerrado em'}
          </p>
          {lot.phase === 'SCHEDULED' || lot.phase === 'LIVE' ? (
            <Countdown
              target={lot.phase === 'SCHEDULED' ? lot.startsAt : lot.endsAt}
              onElapsed={refresh}
              className={cn('font-wide text-[1.6rem] font-extrabold leading-none', finalStretch && 'text-lose')}
            />
          ) : (
            <p className="font-semiwide text-lg font-bold">
              {formatDateTime(lot.phase === 'CANCELLED' && lot.cancelledAt ? lot.cancelledAt : lot.endsAt)}
            </p>
          )}
          {lot.extended && lot.phase === 'LIVE' && (
            <p className="w-full text-sm font-semibold text-brand-text">Prorrogado por lances de última hora</p>
          )}
        </div>
      </div>

      {finalStretch && (
        <p className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-brand/20 px-3 py-2 text-sm text-ink">
          <Timer className="mt-0.5 size-4 shrink-0" aria-hidden />
          Reta final: um lance agora estende o encerramento para {formatSpan(lot.antiSniping.extensionSeconds)} depois
          dele.
        </p>
      )}

      {/* Formulário de lance. */}
      {canBid && (
        <form
          className="space-y-3 border-t border-line p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit(amountCents);
          }}
        >
          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={mutation.isPending}
            onClick={() => submit(lot.minNextBidCents)}
          >
            Dar lance de {formatBRL(lot.minNextBidCents)}
          </Button>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            <span className="h-px flex-1 bg-line" />
            ou escolha o valor
            <span className="h-px flex-1 bg-line" />
          </div>
          <label htmlFor={inputId} className="sr-only">
            Valor do lance em reais
          </label>
          <div className="flex gap-2">
            <MoneyInput
              id={inputId}
              size="lg"
              className="flex-1"
              value={amountText}
              invalid={feedback?.tone === 'error' && feedback.title === bidRejectionTitle('BELOW_MINIMUM')}
              onValueChange={(text) => {
                setEdited(true);
                setAmountText(text);
              }}
            />
            <Button type="submit" variant="secondary" size="lg" loading={mutation.isPending}>
              Dar lance
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[2, 5, 10].map((steps) => {
              const value = lot.minNextBidCents + (steps - 1) * lot.minIncrementCents;
              return (
                <button
                  key={steps}
                  type="button"
                  className="rounded-full border border-line-strong px-3 py-1 text-sm font-semibold tabular hover:border-ink-faint"
                  onClick={() => {
                    setEdited(true);
                    setAmountText(centsToInputValue(value));
                  }}
                >
                  {formatBRL(value)}
                </button>
              );
            })}
          </div>
          {viewer.availableCents !== null && (
            <p className="text-sm text-ink-soft">
              Disponível na carteira: <strong className="tabular">{formatBRL(viewer.availableCents)}</strong>{' '}
              <Link to="/carteira" className="font-semibold text-brand-text underline-offset-2 hover:underline">
                Depositar
              </Link>
            </p>
          )}
        </form>
      )}

      {isBidder && lot.phase === 'SCHEDULED' && (
        <p className="border-t border-line p-5 text-[15px] text-ink-soft">
          {bidRejectionMessage('LOT_NOT_STARTED', { startsAt: lot.startsAt }, formatDateTime)}
        </p>
      )}

      {feedback && (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'mx-5 mb-5 flex gap-3 rounded-lg px-4 py-3',
            feedback.tone === 'error' ? 'bg-lose-soft text-ink' : 'bg-win-soft text-ink',
          )}
        >
          {feedback.tone === 'error' ? (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-lose" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-win" aria-hidden />
          )}
          <div>
            <p className="font-semibold">{feedback.title}</p>
            <p className="text-[15px] text-ink-soft">{feedback.message}</p>
            {feedback.title === bidRejectionTitle('INSUFFICIENT_FUNDS') && (
              <Link to="/carteira" className="mt-1 inline-block text-sm font-semibold text-brand-text hover:underline">
                Ir para a carteira
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
