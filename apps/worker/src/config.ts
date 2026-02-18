export interface WorkerConfig {
  tickIntervalMs: number;
  claimStaleAfterMs: number;
  maxRetries: number;
  maxBatchSize: number;
  retryBaseMs: number;
  workerId: string;
}

const DEFAULTS: WorkerConfig = {
  tickIntervalMs: 30000,
  claimStaleAfterMs: 10 * 60 * 1000,
  maxRetries: 3,
  maxBatchSize: 10,
  retryBaseMs: 5000,
  workerId: "worker-local",
};

export function loadWorkerConfig(env: Record<string, string | undefined> = process.env): WorkerConfig {
  return {
    tickIntervalMs: getEnvNumber(env, "WORKER_TICK_INTERVAL_MS", DEFAULTS.tickIntervalMs),
    claimStaleAfterMs: getEnvNumber(env, "WORKER_CLAIM_STALE_MS", DEFAULTS.claimStaleAfterMs),
    maxRetries: getEnvNumber(env, "WORKER_MAX_RETRIES", DEFAULTS.maxRetries),
    maxBatchSize: getEnvNumber(env, "WORKER_MAX_BATCH_SIZE", DEFAULTS.maxBatchSize),
    retryBaseMs: getEnvNumber(env, "WORKER_RETRY_BASE_MS", DEFAULTS.retryBaseMs),
    workerId: env.WORKER_ID ?? DEFAULTS.workerId,
  };
}

function getEnvNumber(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
