import { useEffect, useState } from 'react';
import { onServerClockChange, serverNow } from '../lib/server-clock';

/** Hora do servidor, atualizada no intervalo indicado (padrão: 1 s). */
export function useServerNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const tick = () => setNow(serverNow());
    const timer = setInterval(tick, intervalMs);
    const unsubscribe = onServerClockChange(tick);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [intervalMs]);
  return now;
}
