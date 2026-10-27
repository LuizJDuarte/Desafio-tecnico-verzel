import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { ImagesService } from '../images/images.service';
import { SettlementService } from './settlement.service';

/** Mesmo sem lotes vencendo, acorda periodicamente (rede de segurança). */
const MAX_SLEEP_MS = 10 * 60_000;
/** Evita laço apertado quando um lote vencido está travado por outra transação. */
const MIN_INTERVAL_MS = 250;

/**
 * Agenda a liquidação para o instante exato em que o próximo lote termina, em vez de consultar o banco
 * a cada segundo. Isso deixa o encerramento pontual e mantém o banco (Neon, plano gratuito) ocioso
 * quando não há nada para fazer. Como rede de segurança extra, a sala do lote também dispara a
 * liquidação "preguiçosa" ao ser aberta depois do prazo (útil quando o servidor estava hibernando).
 */
@Injectable()
export class SettlementScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SettlementScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private scheduledFor: number | null = null;
  private running = false;
  private pendingEarliest: number | null = null;
  private stopped = false;
  private paused = false;
  private lastRunAt = 0;
  private lastImageBackfillAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly settlement: SettlementService,
    private readonly images: ImagesService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.schedulerEnabled) return;
    this.logger.log('Agendador de liquidação iniciado.');
    this.scheduleAt(Date.now());
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Pausa o agendador e espera o ciclo em andamento terminar. Usado pela seed, que cria lotes com
   * datas no passado e precisa registrar os lances deles ANTES de qualquer liquidação automática.
   */
  async pause(): Promise<void> {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.scheduledFor = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 20));
  }

  resume(): void {
    this.paused = false;
    if (this.config.schedulerEnabled && !this.stopped) this.scheduleAt(Date.now());
  }

  /** Chamado quando um lote é criado: garante que o timer acorde a tempo do novo prazo. */
  notifyEndsAt(endsAt: Date): void {
    if (!this.config.schedulerEnabled || this.stopped || this.paused) return;
    const at = endsAt.getTime();
    if (this.running) {
      this.pendingEarliest = this.pendingEarliest === null ? at : Math.min(this.pendingEarliest, at);
      return;
    }
    if (this.scheduledFor === null || at < this.scheduledFor) this.scheduleAt(at);
  }

  private scheduleAt(at: number): void {
    if (this.stopped || this.paused) return;
    if (this.timer) clearTimeout(this.timer);
    const earliestAllowed = this.lastRunAt + MIN_INTERVAL_MS;
    const target = Math.max(at, earliestAllowed);
    this.scheduledFor = target;
    const delay = Math.min(Math.max(target - Date.now() + 25, 0), MAX_SLEEP_MS);
    this.timer = setTimeout(() => void this.run(), delay);
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped || this.paused) return;
    this.running = true;
    this.timer = null;
    this.scheduledFor = null;
    let next = Date.now() + MAX_SLEEP_MS;
    try {
      const settled = await this.settlement.settleDueLots();
      if (settled > 0) this.logger.log(`${settled} lote(s) liquidado(s).`);
      const nextDue = await this.settlement.nextDueAt();
      if (nextDue) next = Math.min(next, nextDue.getTime());
      await this.maybeBackfillImages();
    } catch (error) {
      this.logger.error('Falha no ciclo de liquidação; nova tentativa em 5 s.', (error as Error).stack);
      next = Date.now() + 5_000;
    } finally {
      this.lastRunAt = Date.now();
      this.running = false;
      if (this.pendingEarliest !== null) {
        next = Math.min(next, this.pendingEarliest);
        this.pendingEarliest = null;
      }
      this.scheduleAt(next);
    }
  }

  private async maybeBackfillImages(): Promise<void> {
    if (Date.now() - this.lastImageBackfillAt < 30 * 60_000) return;
    this.lastImageBackfillAt = Date.now();
    const stored = await this.images.backfillMissing();
    if (stored > 0) this.logger.log(`${stored} imagem(ns) de lote copiada(s) com atraso.`);
  }
}
