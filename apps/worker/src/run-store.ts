import { randomUUID, createHash } from "node:crypto";
import { type RunInputParams, type RunRecord, type RunType } from "./types";

export interface ScheduledBot {
  botId: string;
  nextRunAt: Date;
  runIntervalHours: number;
}

export interface EnqueueRunInput {
  botId: string;
  runType: RunType;
  scheduledFor: Date;
  idempotencyKey: string;
  inputParams?: RunInputParams;
}

export interface RunStore {
  enqueueRun(input: EnqueueRunInput): Promise<RunRecord | null>;
  enqueueScheduledRuns(now: Date): Promise<number>;
  requeueStaleClaims(now: Date, staleAfterMs: number): Promise<number>;
  claimDueRuns(now: Date, limit: number): Promise<RunRecord[]>;
  markRunning(runId: string, now: Date): Promise<void>;
  markCompleted(runId: string, now: Date, output: RunRecord["outputResult"]): Promise<void>;
  markFailed(
    runId: string,
    now: Date,
    errorMessage: string,
    retryCount: number,
    rescheduleFor?: Date,
  ): Promise<void>;
}

export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly bots = new Map<string, ScheduledBot>();
  private readonly workerId: string;

  constructor(workerId: string) {
    this.workerId = workerId;
  }

  setBots(bots: ScheduledBot[]): void {
    for (const bot of bots) {
      this.bots.set(bot.botId, bot);
    }
  }

  async enqueueRun(input: EnqueueRunInput): Promise<RunRecord | null> {
    if (this.findByIdempotencyKey(input.idempotencyKey)) {
      return null;
    }

    const now = new Date();
    const run: RunRecord = {
      id: randomUUID(),
      botId: input.botId,
      status: "pending",
      runType: input.runType,
      scheduledFor: input.scheduledFor,
      inputParams: input.inputParams,
      retryCount: 0,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
    };

    this.runs.set(run.id, run);
    return { ...run };
  }

  async enqueueScheduledRuns(now: Date): Promise<number> {
    let count = 0;

    for (const bot of this.bots.values()) {
      if (bot.nextRunAt > now) continue;
      const scheduledFor = bot.nextRunAt;
      const idempotencyKey = createDeterministicIdempotencyKey(
        `scheduled:${bot.botId}:${scheduledFor.toISOString()}`,
      );

      const created = await this.enqueueRun({
        botId: bot.botId,
        runType: "scheduled",
        scheduledFor,
        idempotencyKey,
      });

      if (created) {
        count += 1;
      }

      bot.nextRunAt = new Date(scheduledFor.getTime() + bot.runIntervalHours * 60 * 60 * 1000);
    }

    return count;
  }

  async requeueStaleClaims(now: Date, staleAfterMs: number): Promise<number> {
    let count = 0;
    const staleBefore = new Date(now.getTime() - staleAfterMs);

    for (const run of this.runs.values()) {
      if (run.status !== "claimed" || !run.claimedAt) continue;
      if (run.claimedAt > staleBefore) continue;

      run.status = "pending";
      run.claimedAt = undefined;
      run.claimedBy = undefined;
      count += 1;
    }

    return count;
  }

  async claimDueRuns(now: Date, limit: number): Promise<RunRecord[]> {
    const eligible = Array.from(this.runs.values())
      .filter((run) => run.status === "pending" && run.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .slice(0, limit);

    for (const run of eligible) {
      run.status = "claimed";
      run.claimedBy = this.workerId;
      run.claimedAt = now;
    }

    return eligible.map((run) => ({ ...run }));
  }

  async markRunning(runId: string, now: Date): Promise<void> {
    const run = this.getRun(runId);
    run.status = "running";
    run.startedAt = now;
  }

  async markCompleted(runId: string, now: Date, output: RunRecord["outputResult"]): Promise<void> {
    const run = this.getRun(runId);
    run.status = "completed";
    run.completedAt = now;
    run.outputResult = output;
  }

  async markFailed(
    runId: string,
    now: Date,
    errorMessage: string,
    retryCount: number,
    rescheduleFor?: Date,
  ): Promise<void> {
    const run = this.getRun(runId);
    run.errorMessage = errorMessage;
    run.retryCount = retryCount;

    if (rescheduleFor) {
      run.status = "pending";
      run.scheduledFor = rescheduleFor;
      run.claimedAt = undefined;
      run.claimedBy = undefined;
      run.startedAt = undefined;
      run.completedAt = undefined;
    } else {
      run.status = "failed";
      run.completedAt = now;
    }
  }

  private getRun(runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  private findByIdempotencyKey(key: string): RunRecord | undefined {
    for (const run of this.runs.values()) {
      if (run.idempotencyKey === key) return run;
    }
    return undefined;
  }
}

function createDeterministicIdempotencyKey(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
