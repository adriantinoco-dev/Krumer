import type { Book } from '../models/item';

export const COVER_RETRY_DELAYS_MS = [
  5_000,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
] as const;

type TimerHandle = ReturnType<typeof setTimeout>;

type CoverRetryOptions = {
  canApplyCover: (bookId: string) => boolean;
  extractCovers: (
    books: Book[],
    onCoverReady: (bookId: string, coverPath: string) => void,
    shouldContinue: () => boolean,
  ) => Promise<void>;
  getPendingBooks: () => Book[];
  onCoverReady: (bookId: string, coverPath: string) => void;
};

type CoverRetryTimers = {
  clearTimeout: (timer: TimerHandle) => void;
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
};

export function getCoverRetryDelay(retryIndex: number): number {
  const normalizedIndex = Number.isFinite(retryIndex)
    ? Math.max(0, Math.floor(retryIndex))
    : 0;
  return COVER_RETRY_DELAYS_MS[Math.min(normalizedIndex, COVER_RETRY_DELAYS_MS.length - 1)];
}

export class CoverRetryCoordinator {
  private active: boolean;
  private disposed = false;
  private restartRequested = false;
  private retryIndex = 0;
  private running = false;
  private timer: TimerHandle | null = null;

  constructor(
    private readonly options: CoverRetryOptions,
    initiallyActive = true,
    private readonly timers: CoverRetryTimers = {
      clearTimeout,
      setTimeout,
    },
  ) {
    this.active = initiallyActive;
  }

  requestImmediate(resetBackoff = false): void {
    if (this.disposed) return;

    if (resetBackoff) {
      this.retryIndex = 0;
    }
    this.clearScheduledRetry();

    if (!this.active) return;
    if (this.running) {
      this.restartRequested = true;
      return;
    }

    void this.run();
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;

    this.active = active;
    if (!active) {
      this.clearScheduledRetry();
      return;
    }

    this.requestImmediate(true);
  }

  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.restartRequested = false;
    this.clearScheduledRetry();
  }

  private clearScheduledRetry(): void {
    if (this.timer === null) return;
    this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleRetry(): void {
    if (this.disposed || !this.active || this.timer !== null) return;

    const delayMs = getCoverRetryDelay(this.retryIndex);
    this.retryIndex = Math.min(this.retryIndex + 1, COVER_RETRY_DELAYS_MS.length - 1);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      if (!this.disposed && this.active) void this.run();
    }, delayMs);
  }

  private async run(): Promise<void> {
    if (this.disposed || !this.active || this.running) return;

    this.running = true;
    try {
      do {
        this.restartRequested = false;
        const pending = this.options.getPendingBooks();
        if (!pending.length) {
          this.retryIndex = 0;
          return;
        }

        try {
          await this.options.extractCovers(
            pending,
            (bookId, coverPath) => {
              if (!this.disposed && this.options.canApplyCover(bookId)) {
                this.options.onCoverReady(bookId, coverPath);
              }
            },
            () => !this.disposed && this.active,
          );
        } catch {
          // Uma falha inesperada da rodada nao encerra as retentativas.
        }
      } while (!this.disposed && this.active && this.restartRequested);
    } finally {
      this.running = false;

      if (this.disposed || !this.active) return;
      if (this.options.getPendingBooks().length) {
        this.scheduleRetry();
      } else {
        this.retryIndex = 0;
      }
    }
  }
}
