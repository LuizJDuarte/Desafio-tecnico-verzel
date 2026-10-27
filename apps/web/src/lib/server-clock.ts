/**
 * Relógio do servidor no navegador. Contagens regressivas usam a hora do SERVIDOR (enviada em
 * serverTime nas respostas e eventos), e não a do computador do usuário, que pode estar adiantado
 * ou atrasado e mostraria um prazo errado.
 */
let offsetMs = 0;
const listeners = new Set<() => void>();

export function syncServerClock(serverIso: string | undefined | null): void {
  if (!serverIso) return;
  const serverMs = Date.parse(serverIso);
  if (Number.isNaN(serverMs)) return;
  const next = serverMs - Date.now();
  // Ignora oscilações pequenas (latência) para a contagem não "pular".
  if (Math.abs(next - offsetMs) < 250) return;
  offsetMs = next;
  listeners.forEach((listener) => listener());
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function onServerClockChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
