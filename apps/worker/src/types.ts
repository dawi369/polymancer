export type RunStatus = "pending" | "claimed" | "running" | "completed" | "failed";
export type RunType = "scheduled" | "reactive" | "user";

export interface ArticleRef {
  title: string;
  url: string;
}

export interface RunInputParams {
  marketIds?: string[];
  newsArticleRefs?: ArticleRef[];
  metadata?: Record<string, unknown>;
}

export interface RunOutputResult {
  decision?: DecisionIntent;
  forecastCard?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DecisionIntent {
  action: "BUY" | "SELL" | "HOLD";
  marketId: string;
  token: "YES" | "NO";
  sizeUsd: number;
  confidence: number;
  reasoning: string;
  sources: string[];
  runType: RunType;
}

export interface NormalizedDecisionIntent {
  action: "buy" | "sell" | "hold";
  marketId: string;
  token: "yes" | "no";
  sizeUsd: number;
  confidence: number;
  reasoning: string;
  sources: string[];
  runType: RunType;
}

export interface RunRecord {
  id: string;
  botId: string;
  status: RunStatus;
  runType: RunType;
  scheduledFor: Date;
  claimedBy?: string;
  claimedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  decisionWindowStartedAt?: Date;
  decisionWindowEndsAt?: Date;
  inputParams?: RunInputParams;
  outputResult?: RunOutputResult;
  errorMessage?: string;
  retryCount: number;
  idempotencyKey: string;
  createdAt: Date;
}

export interface RunExecutionResult {
  output: RunOutputResult;
}
