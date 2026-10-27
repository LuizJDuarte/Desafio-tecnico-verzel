export { formatBRL } from '@arremate/shared';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const secondsFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** "27/10/2026 às 14:30" no fuso do navegador. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormatter.format(date)} às ${timeFormatter.format(date)}`;
}

/** "27 de out. às 14:30" */
export function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  return `${shortDateFormatter.format(date)} às ${timeFormatter.format(date)}`;
}

export function formatClock(iso: string): string {
  return secondsFormatter.format(new Date(iso));
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Tempo restante: "3d 04h 12m", "04:12:09" ou "12:09". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Converte "AAAA-MM-DDTHH:mm" (input datetime-local, horário local) em ISO UTC. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converte uma data em valor para input datetime-local (horário local). */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 120 -> "2 minutos", 60 -> "1 minuto", 90 -> "90 segundos". */
export function formatSpan(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }
  return `${seconds} segundos`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
