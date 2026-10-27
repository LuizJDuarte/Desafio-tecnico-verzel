import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  formatBRL,
  type LotSoldEvent,
  type LotWonEvent,
  type OutbidEvent,
  SocketEvents,
  type WalletDto,
  type WalletUpdatedEvent,
} from '@arremate/shared';
import { useAuth } from '../auth/auth-context';
import { queryKeys } from '../lib/queries';
import { getSocket } from '../lib/socket';

/** Avisos pessoais que chegam em qualquer página: superado, arrematou, vendeu, carteira. */
export function useUserEvents(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onOutbid = (event: OutbidEvent) => {
      toast.warning(`Você foi superado em "${event.lotTitle}"`, {
        description: `Lance atual: ${formatBRL(event.currentPriceCents)}. Os ${formatBRL(event.releasedCents)} comprometidos voltaram ao seu saldo disponível.`,
        action: { label: 'Ver lote', onClick: () => navigate(`/lotes/${event.lotId}`) },
        duration: 8000,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myBids });
    };

    const onWallet = (event: WalletUpdatedEvent) => {
      queryClient.setQueryData<WalletDto>(queryKeys.wallet, (old) =>
        old
          ? {
              ...old,
              balanceCents: event.balanceCents,
              heldCents: event.heldCents,
              availableCents: event.availableCents,
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    };

    const onWon = (event: LotWonEvent) => {
      toast.success(`Você arrematou "${event.lotTitle}" por ${formatBRL(event.amountCents)}`, {
        action: { label: 'Ver comprovante', onClick: () => navigate(`/comprovante/${event.receiptCode}`) },
        duration: 12000,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myBids });
    };

    const onSold = (event: LotSoldEvent) => {
      toast.success(`"${event.lotTitle}" foi arrematado por ${formatBRL(event.amountCents)}`, {
        description: 'O valor já foi creditado na sua carteira.',
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    };

    socket.on(SocketEvents.OUTBID, onOutbid);
    socket.on(SocketEvents.WALLET_UPDATED, onWallet);
    socket.on(SocketEvents.LOT_WON, onWon);
    socket.on(SocketEvents.LOT_SOLD, onSold);
    return () => {
      socket.off(SocketEvents.OUTBID, onOutbid);
      socket.off(SocketEvents.WALLET_UPDATED, onWallet);
      socket.off(SocketEvents.LOT_WON, onWon);
      socket.off(SocketEvents.LOT_SOLD, onSold);
    };
  }, [user, queryClient, navigate]);
}
