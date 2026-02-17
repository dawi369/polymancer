# Polymancer Agent Schema

A comprehensive, actionable plan for building the interactive, reactive trading agent system.

---

## Executive Summary

This document defines the complete agent architecture for Polymancer. The system combines:
- **Pamela's reusable components** (news service, signal scoring, confidence)
- **Polyseer** as a deep-research tool
- **Custom Decision Agent** for conversation and decision authority
- **Reactive signal layer** for real-time market awareness
- **Worker runtime** with job queue for scalable execution

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POLYMANCER SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │  Mobile App  │     │   Telegram   │     │  Web/API    │               │
│  │   (Expo)     │     │    Bot       │     │   (Elysia)  │               │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘               │
│         │                    │                    │                        │
│         └────────────────────┼────────────────────┘                        │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                 │
│                    │    Decision Agent   │◄── Conversation + Tools        │
│                    │   (Agent Runtime)   │◄── Tool: Polyseer              │
│                    │                     │◄── Tool: NewsService           │
│                    │                     │◄── Tool: MarketData            │
│                    │                     │◄── Tool: Positions             │
│                    └──────────┬──────────┘                                 │
│                               │                                             │
│         ┌─────────────────────┼─────────────────────┐                      │
│         │                     │                     │                      │
│         ▼                     ▼                     ▼                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│  │  Scheduled  │     │  Reactive   │     │    Chat    │                 │
│  │    Runs     │     │  Triggers   │     │  Triggers   │                 │
│  │ (4hr cycle)│     │(news/price) │     │(run now)    │                 │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                 │
│         │                    │                    │                        │
│         └────────────────────┼────────────────────┘                        │
│                              ▼                                              │
│                    ┌─────────────────────┐                                 │
│                    │   Job Queue (DB)    │                                 │
│                    │   runs + signals     │                                 │
│                    └──────────┬──────────┘                                 │
│                               │                                             │
│         ┌─────────────────────┼─────────────────────┐                      │
│         │                     │                     │                      │
│         ▼                     ▼                     ▼                      │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │                     WORKER RUNTIME                       │               │
│  │  ┌─────────────────────────────────────────────────┐    │               │
│  │  │              Execution Pipeline                 │    │               │
│  │  │  1. Claim job (FOR UPDATE SKIP LOCKED)        │    │               │
│  │  │  2. Check risk rules                          │    │               │
│  │  │  3. Decision Agent evaluates                  │    │               │
│  │  │  4. If needed: invoke Polyseer                │    │               │
│  │  │  5. Paper trade simulation (FOK)             │    │               │
│  │  │  6. Record decision + result                 │    │               │
│  │  │  7. Update positions + emit notifications    │    │               │
│  │  └─────────────────────────────────────────────────┘    │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Reusable Components (from Pamela)

The following Pamela components will be ported directly into `packages/pamela-core/`:

### 2.1 NewsService (`src/services/news/news-service.ts`)

**Purpose**: Fetch, cache, and analyze news for trading signals.

**Key capabilities**:
- Multi-source news fetching (NewsAPI, extensible)
- Relevance scoring based on market keywords
- Sentiment analysis (positive/negative/neutral)
- Market keyword extraction
- Caching layer with TTL

**Porting**: Copy `src/services/news/` wholesale, adapt to Bun + TypeScript.

**Integration point**: Called by Signal Layer and Decision Agent.

```typescript
// Usage example
const newsService = getNewsService();
const articles = await newsService.searchNews("election");
const signal = await newsService.getMarketSignals("Will Trump win?");
```

### 2.2 ConfidenceScorer (`src/services/news/confidence-scorer.ts`)

**Purpose**: Calculate multi-factor confidence scores for trading decisions.

**Factors**:
- News sentiment (40% weight)
- Market volume (30% weight)
- Time to resolution (30% weight)

**Porting**: Copy `src/services/news/confidence-scorer.ts`, adapt to Bun.

**Integration point**: Used by Decision Agent when evaluating trades.

### 2.3 Signal Providers (`src/providers/news-context-provider.ts`)

**Purpose**: Inject news context into agent conversations.

**Providers**:
- `NEWS_CONTEXT`: Recent headlines
- `MARKET_INTELLIGENCE`: Topic-specific news
- `TRADING_SIGNALS`: Active signals

**Porting**: Copy providers, adapt to custom agent runtime.

**Integration point**: Injected into Decision Agent state for every request.

### 2.4 News Actions (`src/actions/news-analysis.ts`, `market-confidence.ts`)

**Purpose**: Enable agent to discuss news and confidence.

**Actions**:
- `NEWS_ANALYSIS`: Summarize news, assess market impact
- `MARKET_CONFIDENCE`: Explain confidence scoring

**Porting**: Convert to tool definitions for custom agent.

---

## 3. Decision Agent

### 3.1 Role

The Decision Agent is the **single authority** for:
1. Conversing with users (24/7 via Telegram)
2. Making trading decisions
3. Explaining past decisions

It does NOT directly execute trades—it outputs a `DecisionIntent` that the Execution Pipeline validates and executes.

### 3.2 Interface

```typescript
interface DecisionAgent {
  // Conversation
  chat(userId: string, message: string): Promise<AgentResponse>;

  // Decision-making
  evaluate(params: DecisionParams): Promise<DecisionIntent>;

  // Explainability
  explain(runId: string): Promise<Explanation>;
}

interface DecisionParams {
  botId: string;
  trigger: 'scheduled' | 'reactive' | 'user_requested';
  signals?: Signal[];
}

interface DecisionIntent {
  action: 'BUY' | 'SELL' | 'HOLD';
  marketId: string;
  token: 'yes' | 'no';
  sizeUsd: number;
  confidence: number;
  reasoning: string;
  evidence: EvidenceRef[];
}

interface AgentResponse {
  text: string;              // Human-readable response
  actions: string[];         // Action intents (e.g., "run_analysis")
  data?: Record<string, any>; // Structured data
}
```

### 3.3 Tools Available to Agent

| Tool | Description | Used By |
|------|-------------|---------|
| `getBotStatus` | Current bot config, status, daily stats | Chat, Decision |
| `getPositions` | Open positions with P&L | Chat, Decision |
| `getTradeLogs` | Recent trades (last N) | Chat, Decision |
| `getLastRunSummary` | Last decision + reasoning | Chat |
| `getNewsSignals` | Current news sentiment for topic | Decision |
| `runPolyseerAnalysis` | Invoke Polyseer for deep research | Decision |
| `enqueueRunNow` | Request an immediate decision run | Chat |
| `explainTrade` | Detailed why for a past trade | Chat |

### 3.4 Decision Flow

```
1. Receive trigger (scheduled / reactive / chat)
2. Load bot context (positions, daily stats, risk limits)
3. Get market signals (news sentiment, price moves)
4. IF confidence > HIGH_THRESHOLD (0.7):
   → Skip Polyseer, decide directly
5. ELSE IF confidence > MEDIUM_THRESHOLD (0.5):
   → Invoke Polyseer for deeper analysis
   → Re-evaluate with Polyseer output
6. ELSE:
   → HOLD, log reasoning
7. Apply risk rules (hard boundary)
8. Output DecisionIntent + explanation
```

### 3.5 Model Selection

| Context | Model | Rationale |
|---------|-------|-----------|
| Chat conversation | Cheap model (e.g., GPT-4o-mini) | High volume, simple responses |
| Decision evaluation | Medium model (e.g., GPT-4o) | Balance cost/quality |
| Polyseer deep research | Via Polyseer pipeline | Already optimized |

---

## 4. Signal Layer (Reactive System)

### 4.1 Signal Sources

| Source | Type | Implementation |
|--------|------|----------------|
| News sentiment | Continuous | `NewsService.getMarketSignals()` |
| Price movement | Event | Monitor order book, trigger on % change |
| Liquidity shift | Event | Monitor depth, trigger on threshold |
| Volume spike | Event | Monitor 24hr volume changes |
| User request | On-demand | Telegram "run now" command |

### 4.2 Reactive Trigger Thresholds (Initial)

```typescript
const REACTIVE_THRESHOLDS = {
  // News
  newsSentiment: {
    bullish: 0.7,    // Trigger on bullish sentiment > 0.7
    bearish: 0.7,    // Trigger on bearish sentiment > 0.7
  },

  // Price
  priceMove: {
    percentChange: 5,   // 5% move
    windowMinutes: 10, // within 10 minutes
  },

  // Liquidity
  liquidityChange: {
    percentChange: 20, // 20% depth change
    windowMinutes: 30,
  },

  // Volume
  volumeSpike: {
    multiplier: 2, // 2x normal volume
    windowHours: 1,
  },
};
```

### 4.3 Signal Scoring

```typescript
interface Signal {
  source: 'news' | 'price' | 'liquidity' | 'volume' | 'user';
  topic?: string;           // e.g., "election", "crypto"
  sentiment?: number;        // -1 to 1
  magnitude: number;        // 0 to 1 (normalized)
  timestamp: Date;
}

// Aggregate signals into trigger score
function calculateTriggerScore(signals: Signal[]): number {
  // Weighted average, normalized to 0-1
  const weights = { news: 0.3, price: 0.3, liquidity: 0.2, volume: 0.1, user: 0.1 };
  // ... computation
  return score;
}
```

### 4.4 Trigger → Run Mapping

```typescript
const TRIGGER_CONFIG = {
  // Always enqueue if score > 0.8
  enqueueThreshold: 0.8,

  // If score > 0.5, enqueue but deprioritize
  lowPriorityThreshold: 0.5,

  // Max reactive runs per bot per day
  maxReactiveRunsPerDay: 10,

  // Cooldown between reactive runs (minutes)
  cooldownMinutes: 30,
};
```

---

## 5. Worker Runtime

### 5.1 Job Queue

Jobs are stored in the `runs` table (see `docs/db-specs.md`).

```sql
-- Worker polling query
SELECT * FROM runs
WHERE status = 'pending'
  AND scheduled_at <= NOW()
ORDER BY priority DESC, scheduled_at ASC
LIMIT :concurrency
FOR UPDATE SKIP LOCKED;
```

### 5.2 Concurrency Model

**Recommended settings** (per worker instance):

| Metric | Value | Rationale |
|--------|-------|-----------|
| Max concurrent runs | **5-10** | Limits CPU + LLM contention |
| Max chat requests handled | **20-50** | I/O bound, lower CPU |
| Worker instances | Scale horizontally | Each handles N bots |

**Initial recommendation**: Start with **5 concurrent runs** per worker, monitor latency, adjust up/down.

```typescript
const WORKER_CONFIG = {
  concurrency: {
    runs: 5,           // Max parallel decision runs
    chat: 30,          // Max parallel chat requests
  },
  timeouts: {
    decisionRun: 300,  // 5 minutes max per run
    chatResponse: 30,  // 30 seconds max per chat
    polyseer: 180,     // 3 minutes max for Polyseer
  },
  retries: {
    maxAttempts: 2,
    backoffMs: 5000,
  },
};
```

### 5.3 Execution Pipeline

```typescript
async function executeRun(run: Run): Promise<RunResult> {
  // 1. Load bot config
  const bot = await db.getBot(run.botId);

  // 2. Check kill switch / pause
  if (globalKillSwitch || bot.status === 'paused') {
    return { status: 'skipped', reason: 'bot_paused' };
  }

  // 3. Check risk limits
  const riskCheck = await riskEngine.check(bot);
  if (!riskCheck.allowed) {
    return { status: 'rejected', reason: riskCheck.reason };
  }

  // 4. Decision Agent evaluates
  const intent = await decisionAgent.evaluate({
    botId: bot.id,
    trigger: run.trigger,
    signals: run.signals,
  });

  // 5. If BUY/SELL, execute paper trade
  if (intent.action === 'BUY' || intent.action === 'SELL') {
    const tradeResult = await paperAdapter.execute({
      ...intent,
      botId: bot.id,
      idempotencyKey: run.idempotencyKey,
    });

    await db.recordTrade(tradeResult);
    await positions.update(bot.id, tradeResult);
  }

  // 6. Record decision
  await db.updateRun(run.id, {
    status: 'completed',
    result: intent,
  });

  // 7. Emit notifications
  await notifications.sendIfNeeded(bot, intent);

  return { status: 'completed', intent };
}
```

---

## 6. Chat Integration

### 6.1 Telegram Bot

The Telegram bot is a direct interface to the Decision Agent.

**Capabilities**:
- **Any question**: The agent can answer about anything (general mode)
- **Run now**: `"/run"` or "analyze now" → enqueues a reactive run
- **Explain**: "why did you buy X?" → retrieves run explanation
- **Status**: `"/status"` → current positions + daily P&L

**Message flow**:
```
User message
    │
    ▼
Telegram API → Webhook → API endpoint
    │
    ▼
Decision Agent.chat()
    │
    ├─► Simple response (no tool)
    │
    └─► Tool calls (if needed)
          │
          ├─► getPositions()
          ├─► getTradeLogs()
          ├─► runPolyseerAnalysis()
          └─► enqueueRunNow()
    │
    ▼
Response → Telegram
```

### 6.2 Rate Limits

```typescript
const RATE_LIMITS = {
  // Per user, per minute
  chatRequestsPerMinute: 10,

  // Per user, per day
  runNowRequestsPerDay: 20,

  // Cost cap per bot (includes chat LLM calls)
  dailyAiCostUsd: 0.50,
};
```

---

## 7. Scheduling

### 7.1 Scheduled Runs

- **Frequency**: Every 4 hours (configurable per bot)
- **Window**: 5 minutes (configurable)
- **Implementation**: `next_run_at` column in `bots` table

```sql
-- At end of each run, schedule next
UPDATE bots
SET next_run_at = NOW() + (run_interval_hours || ' hours')::interval
WHERE id = :botId;
```

### 7.2 Reactive Runs

- **Triggered by**: Signal layer when thresholds exceeded
- **Priority**: Lower than scheduled runs
- **Cooldown**: 30 minutes between reactive runs per bot

### 7.3 User-Requested Runs

- **Trigger**: Telegram "run now" or `/run` command
- **Validation**: Rate limit check
- **Priority**: Same as scheduled

---

## 8. Risk Engine (Hard Boundary)

The Decision Agent outputs decisions, but the Risk Engine has **veto power**.

### 8.1 Rules (Always Enforced)

| Rule | Default | Configurable |
|------|---------|--------------|
| Max daily loss | $100 | Yes |
| Max position size | $200 | Yes |
| Max trades per day | 10 | Yes |
| Slippage threshold | 2% | Yes |
| Daily AI cost cap | $0.50 | Yes |
| Paper balance check | Required | No |

### 8.2 Implementation

```typescript
class RiskEngine {
  async check(bot: Bot, intent?: DecisionIntent): Promise<RiskCheck> {
    // 1. Check daily loss
    const todayPnL = await this.getTodayPnL(bot.id);
    if (todayPnL <= -bot.maxDailyLossUsd) {
      return { allowed: false, reason: 'daily_loss_limit' };
    }

    // 2. Check trade count
    const todayTrades = await this.getTodayTradeCount(bot.id);
    if (todayTrades >= bot.maxTradesPerDay) {
      return { allowed: false, reason: 'daily_trade_limit' };
    }

    // 3. Check AI cost
    if (bot.dailyAiCostUsd >= bot.dailyAiLimitUsd) {
      return { allowed: false, reason: 'ai_cost_limit' };
    }

    // 4. Check position size (if intent)
    if (intent && intent.sizeUsd > bot.maxPositionSizeUsd) {
      return { allowed: false, reason: 'position_size_limit' };
    }

    // 5. Check paper balance
    const balance = await this.getPaperBalance(bot.id);
    if (balance < intent?.sizeUsd) {
      return { allowed: false, reason: 'insufficient_balance' };
    }

    return { allowed: true };
  }
}
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Set up monorepo structure with `packages/pamela-core/`
- [ ] Port NewsService + ConfidenceScorer from Pamela
- [ ] Create basic Decision Agent skeleton with tool definitions
- [ ] Set up Worker process with job queue polling
- [ ] Implement basic execution pipeline (no Polyseer yet)
- [ ] Write unit tests for core components

**Deliverable**: Worker can run scheduled decisions with risk checks.

### Phase 2: Polyseer Integration (Week 2-3)

- [ ] Integrate Polyseer as research tool
- [ ] Implement decision flow with conditional Polyseer invocation
- [ ] Add run explanation storage
- [ ] Wire up Position tracking + Paper trading simulation

**Deliverable**: Full decision loop with Polyseer research.

### Phase 3: Reactive Signals (Week 3-4)

- [ ] Build Signal Ingest layer (news polling)
- [ ] Implement price/liquidity monitoring (pmxt webhooks or polling)
- [ ] Create trigger threshold logic
- [ ] Add reactive run enqueueing

**Deliverable**: Agent reacts to news + market movements.

### Phase 4: Chat + Interaction (Week 4-5)

- [ ] Build Telegram bot webhook endpoint
- [ ] Implement Decision Agent chat mode
- [ ] Add tool calls for chat (positions, logs, explanations)
- [ ] Implement "/run" command
- [ ] Add rate limiting

**Deliverable**: Users can chat with their agent 24/7.

### Phase 5: Polish + Ops (Week 5-6)

- [ ] Add monitoring + alerting
- [ ] Implement graceful shutdown + recovery
- [ ] Load test with simulated users
- [ ] Document operational procedures
- [ ] Deploy to staging, then production

**Deliverable**: Production-ready system.

---

## 10. Data Flow Summary

```
User (Telegram)
    │
    ▼
Decision Agent.chat()
    │
    ├─► Tools: getPositions, getNewsSignals, runPolyseer, enqueueRunNow
    │
    ▼
Response (or enqueued run)

─────── OR ───────

Scheduler (every 4h) ──┐
Signal Layer (news/price) ──┼──► Job Queue (runs table)
User "/run" ───────────┘
    │
    ▼
Worker picks up job
    │
    ▼
Risk Engine.check()
    │
    ▼
Decision Agent.evaluate()
    │
    ├─► If confidence > 0.7: decide directly
    │
    └─► If confidence 0.5-0.7: runPolyseer → re-evaluate
    │
    ▼
Paper Adapter.execute() (if BUY/SELL)
    │
    ▼
Record to DB + Notifications
```

---

## 11. Key Interfaces

### 11.1 Bot Configuration

```typescript
interface BotConfig {
  id: string;
  userId: string;
  status: 'active' | 'paused';

  // Scheduling
  runIntervalHours: number;       // default: 4
  decisionWindowSeconds: number;   // default: 300 (5 min)

  // Risk limits
  maxDailyLossUsd: number;        // default: 100
  maxPositionSizeUsd: number;      // default: 200
  maxTradesPerDay: number;         // default: 10
  slippageThresholdPercent: number; // default: 2
  dailyAiLimitUsd: number;         // default: 0.50

  // Current state
  dailyAiCostUsd: number;
  nextRunAt: Date;
  lastRunAt: Date;
}
```

### 11.2 Run Record

```typescript
interface Run {
  id: string;
  botId: string;
  trigger: 'scheduled' | 'reactive' | 'user_requested';
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed';
  priority: number;

  // Timing
  scheduledAt: Date;
  claimedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Input
  signals?: Signal[];

  // Output
  decision?: DecisionIntent;
  tradeResult?: TradeResult;
  error?: string;

  // Idempotency
  idempotencyKey: string;
}
```

---

## 12. Open Questions (to resolve during implementation)

1. **News API**: Which provider(s) beyond NewsAPI? (GDELT, Twitter/X?)
2. **Price monitoring**: Polling interval for order book changes?
3. **Polyseer invocation**: When exactly to call vs skip (confidence thresholds)?
4. **Cost tracking**: How to attribute chat LLM costs vs decision costs?
5. **Failover**: What happens if Polyseer API is down mid-run?

These will be resolved in Phase 1-2 as we build and learn.

---

## 13. Dependencies

| Component | Source | Status |
|-----------|--------|--------|
| NewsService | Pamela (ported) | To port |
| ConfidenceScorer | Pamela (ported) | To port |
| Signal Providers | Pamela (ported) | To port |
| Polyseer | Yorkeccak/Polyseer | Existing |
| pmxt SDK | pmxt-dev/pmxt | Existing |
| Database | Supabase | Existing |
| Hosting | Fly.io | Planned |

---

## 14. Next Steps

1. **Start Phase 1**: Create `packages/pamela-core/` and port NewsService
2. **Set up Worker**: Basic job queue + polling
3. **Test the loop**: Scheduled run → decision → risk check → log

---

*Last updated: 2026-02-17*
