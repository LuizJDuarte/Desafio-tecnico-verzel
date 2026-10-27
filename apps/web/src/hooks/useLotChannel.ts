import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  type BidDto,
  type LotBidEvent,
  type LotCancelledEvent,
  type LotClosedEvent,
  type LotPageDto,
  SocketEvents,
  type SubscribeAck,
} from '@arremate/shared';
import { queryKeys } from '../lib/queries';
import { syncServerClock } from '../lib/server-clock';
import { getSocket } from '../lib/socket';

/** Aplica um lance recebido em tempo real ao estado da sala, sem esperar uma nova requisição. */
export function applyBidEvent(page: LotPageDto, event: LotBidEvent): LotPageDto {
  if (event.bidCount <= page.lot.bidCount) return page; // evento antigo ou repetido
  const isMine = page.viewer.alias !== null && page.viewer.alias === event.leaderAlias;
  return {
    ...page,
    lot: {
      ...page.lot,
      currentPriceCents: event.currentPriceCents,
      minNextBidCents: event.minNextBidCents,
      bidCount: event.bidCount,
      endsAt: event.endsAt,
      leaderAlias: event.leaderAlias,
      extended: page.lot.extended || event.extended,
    },
    viewer: { ...page.viewer, isLeader: isMine, hasBid: page.viewer.hasBid || isMine },
  };
}

/**
 * Inscreve a página na sala do lote via Socket.IO e mantém o cache do React Query atualizado:
 * lance atual, prazo (prorrogação), histórico, encerramento e cancelamento, tudo sem recarregar.
 */
export function useLotChannel(lotId: string, onBid?: (event: LotBidEvent) => void): void {
  const queryClient = useQueryClient();
  const onBidRef = useRef(onBid);
  useEffect(() => {
    onBidRef.current = onBid;
  });

  useEffect(() => {
    if (!lotId) return;
    const socket = getSocket();

    const subscribe = () =>
      socket.emit(SocketEvents.LOT_SUBSCRIBE, { lotId }, (ack: SubscribeAck | undefined) => {
        if (ack?.serverTime) syncServerClock(ack.serverTime);
      });

    const refreshAll = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lot(lotId) });
    };

    const handleConnect = () => {
      subscribe();
      refreshAll(); // depois de uma queda de conexão, ressincroniza o que pode ter mudado
    };

    const handleBid = (event: LotBidEvent) => {
      if (event.lotId !== lotId) return;
      syncServerClock(event.serverTime);
      const before = queryClient.getQueryData<LotPageDto>(queryKeys.lot(lotId));
      queryClient.setQueryData<LotPageDto>(queryKeys.lot(lotId), (old) => (old ? applyBidEvent(old, event) : old));
      queryClient.setQueryData<BidDto[]>(queryKeys.bids(lotId), (old) =>
        old && !old.some((bid) => bid.seq === event.bid.seq) ? [event.bid, ...old] : old,
      );
      // Posição, maior lance e saldo de quem está olhando vêm do servidor.
      if (before?.viewer.authenticated) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lot(lotId), exact: true });
      }
      onBidRef.current?.(event);
    };

    const handleClosed = (event: LotClosedEvent) => {
      if (event.lotId !== lotId) return;
      syncServerClock(event.serverTime);
      refreshAll();
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myBids });
    };

    const handleCancelled = (event: LotCancelledEvent) => {
      if (event.lotId !== lotId) return;
      refreshAll();
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    };

    socket.on('connect', handleConnect);
    socket.on(SocketEvents.LOT_BID, handleBid);
    socket.on(SocketEvents.LOT_CLOSED, handleClosed);
    socket.on(SocketEvents.LOT_CANCELLED, handleCancelled);
    if (socket.connected) subscribe();

    return () => {
      socket.emit(SocketEvents.LOT_UNSUBSCRIBE, { lotId });
      socket.off('connect', handleConnect);
      socket.off(SocketEvents.LOT_BID, handleBid);
      socket.off(SocketEvents.LOT_CLOSED, handleClosed);
      socket.off(SocketEvents.LOT_CANCELLED, handleCancelled);
    };
  }, [lotId, queryClient]);
}
