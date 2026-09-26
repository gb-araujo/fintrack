import type { HealthResponse } from '@fintrack/shared';

export interface DatabasePinger {
  ping(): Promise<void>;
}

export interface HealthServiceOptions {
  version: string;
  /** Tempo máximo de espera pelo banco antes de considerá-lo indisponível. */
  databaseTimeoutMs?: number;
  now?: () => Date;
}

export class HealthService {
  private readonly startedAt: number;
  private readonly version: string;
  private readonly databaseTimeoutMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabasePinger,
    options: HealthServiceOptions,
  ) {
    this.version = options.version;
    this.databaseTimeoutMs = options.databaseTimeoutMs ?? 2_000;
    this.now = options.now ?? (() => new Date());
    this.startedAt = this.now().getTime();
  }

  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    const now = this.now();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: this.version,
      uptimeSeconds: Math.max(0, Math.floor((now.getTime() - this.startedAt) / 1000)),
      timestamp: now.toISOString(),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), this.databaseTimeoutMs);
    });
    try {
      await Promise.race([this.database.ping(), timeout]);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      clearTimeout(timer);
    }
  }
}
