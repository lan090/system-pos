// =========================================================================
// src/utils/telemetry/CircuitBreaker.ts
// FSRMS v2.0 — Per-Provider Circuit Breaker FSM
// =========================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly cooldownMs: number = 60_000,
  ) {}

  /**
   * Returns true if requests should be blocked.
   * If state is OPEN, check if cooldown period has elapsed. If so, transition to HALF_OPEN.
   */
  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (this.openedAt !== null && Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Record a successful request. Transitions HALF_OPEN -> CLOSED.
   */
  recordSuccess(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /**
   * Record a failed request. Transitions CLOSED -> OPEN or HALF_OPEN -> OPEN.
   */
  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      this.consecutiveFailures = 0;
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.state = 'OPEN';
        this.openedAt = Date.now();
      }
    } else {
      // In OPEN state, a failure shouldn't normally happen since requests are blocked.
      // But if it does (e.g. race condition or test override), update openedAt.
      this.openedAt = Date.now();
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitState {
    // If state is OPEN but cooldown has passed, calling getState should reflect the transition
    if (this.state === 'OPEN' && this.openedAt !== null && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }
}
