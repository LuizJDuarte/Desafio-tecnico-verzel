export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Falhas consecutivas (já contando as retentativas) que abrem o circuito. */
  failureThreshold: number;
  /** Tempo que o circuito fica aberto antes de permitir uma chamada de teste. */
  openMs: number;
  now?: () => number;
}

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
  openUntil: number | null;
}

/**
 * Circuit breaker clássico (CLOSED -> OPEN -> HALF_OPEN -> CLOSED).
 * Quando a API externa está fora do ar, parar de chamá-la por alguns segundos evita que cada busca
 * do leiloeiro fique pendurada até o timeout e reduz a pressão sobre um serviço que já está com problema.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;
  private lastFailureAt: number | null = null;
  private lastFailureReason: string | null = null;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  canRequest(): boolean {
    this.refreshState();
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') return false;
    if (this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.trialInFlight = false;
  }

  recordFailure(reason: string): void {
    this.failures++;
    this.lastFailureAt = this.now();
    this.lastFailureReason = reason;
    this.trialInFlight = false;
    if (this.state === 'HALF_OPEN' || this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = this.now();
    }
  }

  snapshot(): CircuitSnapshot {
    this.refreshState();
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      lastFailureAt: this.lastFailureAt,
      lastFailureReason: this.lastFailureReason,
      openUntil: this.state === 'OPEN' ? this.openedAt + this.options.openMs : null,
    };
  }

  private refreshState(): void {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.options.openMs) {
      this.state = 'HALF_OPEN';
      this.trialInFlight = false;
    }
  }
}
