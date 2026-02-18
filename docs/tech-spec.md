# Polymancer Tech Spec

This document defines technical implementation details for the MVP. Product scope, UX, and feature goals live in `docs/design-spec.md` to avoid duplication.

## System Components

- Mobile app: Expo control hub (no chat, no trading logic).
- Telegram bot: primary user interaction channel (chat, analysis, trade suggestions).
- Backend API: Bun + Elysia (fast, user-facing HTTP).
- Worker: long-running Bun process (handles bot execution).
- Polyseer: Research pipeline invoked by Worker (not a scheduled daemon).
- ExecutionAdapter: paper implementation using pmxt, live adapter stubbed.
- Data: Postgres + Auth + job queue (see `docs/db-spec.md`).
- External services and credentials: see `docs/deployment-spec.md`.

## Repository Layout (Target)

```
apps/api                    # Elysia API (user-facing HTTP)
apps/worker                 # Bot execution worker (long-running)
apps/mobile                 # Expo app
packages/agent-core         # Decision Agent - our code (LLM orchestration)
packages/polyseer           # Polyseer research tool (git submodule)
packages/pamela-core        # Ported from Pamela (news, signals, confidence)
packages/database           # Supabase types, schema, client
packages/shared             # Shared types and utilities
```

Dependencies:

- pmxt is an external npm package (`pmxtjs`), installed in apps/api and apps/worker
  - Locked to version `2.8.0` (MVP)
- polyseer is a git submodule at packages/polyseer (forked to protect against upstream deletion)
- All apps use workspace packages via `workspace:*` protocol

## Agent Architecture

See `docs/agent-spec.md` for the complete agent system design, including:

- Decision Agent (conversation + decision authority)
- Signal Layer (reactive triggers)
- Worker execution pipeline
- Chat integration
- Reused components from Pamela

## Polyseer Integration

Polyseer is a third-party research tool, not part of our agent architecture.

We integrate Polyseer (github.com/yorkeccak/Polyseer) as a git submodule. It provides deep market research capabilities that our Decision Agent can invoke.

### What Polyseer Does

- Multi-agent AI research on prediction markets (Polymarket + Kalshi)
- Uses Valyu API for deep + web search
- Provides Bayesian probability analysis
- Outputs structured research reports

### How We Use Polyseer

```typescript
// Polyseer is a tool in our agent's toolkit
class PolyseerResearchTool {
  async research(marketUrl: string): Promise<ResearchResult> {
    // Invoke Polyseer's pipeline
    const result = await polyseer.runUnifiedForecastPipeline({
      marketUrl,
      onProgress: (step) => this.emitProgress(step),
    });

    return {
      forecastCard: result,
      pNeutral: result.pNeutral,
      pAware: result.pAware,
      drivers: result.drivers,
      markdownReport: result.markdownReport,
    };
  }
}
```

### When to Use Polyseer

| Scenario         | Use Polyseer? | Rationale                             |
| ---------------- | ------------- | ------------------------------------- |
| High-value trade | Yes           | Worth the research cost (~$0.10-0.30) |
| Uncertain market | Yes           | Need deep analysis                    |
| Routine check    | No            | Use simple market data + news         |
| Chat Q&A         | No            | Answer from portfolio history         |

### Cost Control

- Daily limit: $0.50 per bot (Valyu + OpenRouter combined)
- Polyseer calls are the expensive part
- Skip Polyseer when confidence is already high/low

## Runtime Model

- One bot per user (MVP).
- Polyseer is invoked as a **synchronous pipeline** by the Worker, not run as a scheduled daemon.
- Entry point: `runUnifiedForecastPipeline(opts)` - returns `ForecastCard` with p0, pNeutral, pAware, drivers, audit.
- Progress tracked via `onProgress(step, details)` callback.
- Concurrency guard: only one run per bot at a time (job claim with `FOR UPDATE SKIP LOCKED`).
- Runs are idempotent and safe to retry.
- `runs` is the job queue; scheduled runs are enqueued from `bots.next_run_at`, reactive/user runs are enqueued as they occur.

### Run Flow (Single Execution)

1. Worker picks up due run from the `runs` queue (scheduled, reactive, or user)
2. Open 5-minute decision window
3. Load bot config including user strategy prompt
4. Enforce kill switch, pause status, daily AI cost cap
5. Decision Agent analyzes market using tools:
   - Query pmxt for market data (prices, order book)
   - Query Pamela news service for signals
   - Optionally invoke Polyseer for deep research (if uncertain/high-value)
6. LLM synthesizes: user advice + research + market data + news
7. Generate decision intent (BUY/SELL/HOLD with reasoning)
8. Run risk checks (position size, daily loss, slippage)
9. Simulate FOK execution via pmxt paper adapter
10. Record decision, update positions, emit notifications
11. Close decision window

### Worker Loop (MVP)

- Tick every 30-60s.
- Enqueue scheduled runs for bots where `next_run_at <= now` (dedupe via `idempotency_key`).
- Requeue stale claims where `claimed_at` is older than 10 minutes.
- Claim pending runs ordered by `scheduled_for` using `FOR UPDATE SKIP LOCKED`.
- Set status `running`, execute the run flow, then mark `completed` or `failed`.
- Retry transient failures up to 3 times with exponential backoff.

### Run State Transitions

- `pending -> claimed -> running -> completed | failed`
- `claimed -> pending` if stale and not started

### Idempotency and Dedupe

**Run Enqueue Idempotency:**
- Scheduled runs: `idempotency_key` derived from `(bot_id, scheduled_for)` bucket.
- Reactive runs: key from `signal_events.id`.
- User runs: key from user request id.
- On conflict, skip enqueue and keep existing run.

**Trade Execution Idempotency:**
- Worker generates UUID right before execution
- Stored in `trade_logs.idempotency_key` (unique constraint prevents duplicates)
- Same key reused on retry → no duplicate trade

## pmxt Integration

pmxt is our trading infrastructure (github.com/pmxt-dev/pmxt).

### What pmxt Provides

- Unified API for **Polymarket + Kalshi** (and more)
- Market data fetching (prices, order book, events)
- Paper trading simulation
- Future: Live trading with same API

### How We Use pmxt

```typescript
import pmxt from "pmxtjs";

// Initialize
const exchange = new pmxt.Exchange();

// Market data
const events = await exchange.fetchEvents({ query: "Trump" });
const market = events[0].markets.match("specific market");

// Trading (paper mode for MVP)
const order = await exchange.createOrder({
  outcome: market.yes,
  side: "buy",
  type: "limit",
  price: 0.33,
  amount: 100,
});
```

### Why pmxt

- Do not build custom Polymarket integration
- Supports both markets we need (Polymarket + Kalshi)
- Same API for paper and live trading
- Handles order book walking, fees, execution

## User Advice Integration

User advice is stored as a strategy prompt on the bot and injected into the Decision Agent context. See `docs/agent-spec.md` for behavior rules and chat interactions.

## ExecutionAdapter

Built on top of pmxt SDK for unified market access across Polymarket and Kalshi.

### Interface (TypeScript)

```ts
export interface ExecutionAdapter {
  quoteOrder(input: OrderInput): Promise<OrderQuote>;
  placeOrder(input: OrderInput): Promise<OrderResult>;
  getPositions(userId: string): Promise<Position[]>;
  getMarketData(marketIds: string[]): Promise<MarketData[]>;
}

export type OrderInput = {
  marketId: string;
  side: "buy" | "sell";
  token: "yes" | "no";
  sizeUsd?: number;
  sizeShares?: number;
};
```

### Paper Adapter (MVP)

- Uses pmxt to fetch order book depth and simulate FOK fills.
- Applies real Polymarket/Kalshi fee schedule.
- Adds artificial latency (200-500ms) before confirming fills.
- Never signs or submits live orders.
- Integrates with pmxt's paper trading mode.

### Trade Execution Atomicity

**Database-First Pattern:**
1. Insert trade intent with `idempotency_key` (pending status)
2. Execute pmxt paper trading API
3. Update trade + positions in single transaction

**Idempotency Key:** `trade:{run_id}:{sequence}`
- Unique constraint on `trade_logs.idempotency_key`
- If retry with same key → returns cached result

**Crash Recovery (Reconciler):**
- Runs every minute via cron
- Finds trades `status='pending'` for >5 minutes
- Queries pmxt API: "Did this trade execute?"
- If yes: Replays position update, marks executed
- If no: Marks failed or retries

**Atomic Updates:**
```sql
BEGIN;
  UPDATE trade_logs SET status='executed', ... WHERE id=$1;
  UPDATE positions SET total_shares=..., closed_at=... WHERE id=$2;
COMMIT;
```

**Worker crash scenarios:**
- Pre-DB: Nothing recorded, safe to retry
- Post-DB intent: Reconciler recovers
- Post-API call: Reconciler recovers state from pmxt
- Post-transaction: Already complete

### Live Adapter

See `docs/post-mvp-spec.md` for future trading capabilities.

## Market Data Provider

- Abstract market data access behind a `MarketDataProvider` interface.
- MVP uses pmxt SDK for Polymarket (Kalshi in future).
- pmxt provides unified API across prediction markets.
- Full universe discovery via pmxt, then cap to 50 markets per run.
- Market selection is model-driven within these caps; no deterministic market set for MVP.
- No TTL caching in MVP.

## LLM Integration

- Primary research: Valyu API (Deep Search + Web Search) via Polyseer agents.
- Decision making: OpenRouter for final trading decisions.
- Daily cost cap: $0.50 per bot (combined Valyu + OpenRouter).
- Track cost per run and aggregate daily.

### Model Selection

Different contexts require different model qualities:

| Context | Purpose | Default Model |
|---------|---------|---------------|
| messaging | Telegram chat | minimax/minimax-m2.5 |
| research | Polyseer/news analysis | minimax/minimax-m2.5 |
| trading | Trading decisions | minimax/minimax-m2.5 |
| summarization | Daily summaries | minimax/minimax-m2.5 |

**Fallback:** deepseek/deepseek-v3.2 for all contexts

**Selection Logic:**
```typescript
async function getModelForContext(botId: string, context: string): Promise<string> {
  // 1. Check user override
  const override = await db.botModelConfigs.find({ bot_id: botId, context });
  if (override?.model_id) return override.model_id;

  // 2. Get user's tier
  const user = await db.users.find({ id: botId.user_id });
  
  // 3. Get tier default
  const default = await db.tierModelDefaults.find({ 
    tier: user.tier, 
    context 
  });
  
  return default.model_id;
}
```

**Fallback Chain:**
- If primary model fails (rate limit, error), try `fallback_model_id`
- If fallback fails, return error (no further fallback)

**Tables:**
- `tier_model_defaults` - Tier-level defaults (trial/paid)
- `bot_model_configs` - User overrides (nullable = use tier default)

## News Signals (MVP Storage)

- No persistent news article tables in MVP.
- `signal_events` stores trigger score/reason only.
- `runs.input_params` stores top article refs (title/url) for audit context.

### Valyu API Integration

Polyseer uses Valyu for comprehensive market research:

- **Deep Search**: Academic papers, proprietary datasets
- **Web Search**: Fresh news, market analysis, expert opinions
- **Evidence Classification**: Type A/B/C/D quality scoring
- **Search Seeds**: Generated by Planner Agent based on market questions

API key setup is documented in `docs/deployment-spec.md`.

Decision intent and Polyseer output schemas are defined in `docs/agent-spec.md`.

## Decision Normalization

- LLM outputs use uppercase enums (BUY/SELL/HOLD, YES/NO).
- Persist to DB using lowercase enums (buy/sell/hold, yes/no) via a single normalization step at the worker boundary.

## Polyseer Confidence (Derived)

- Polyseer returns a `ForecastCard` without an explicit confidence enum.
- Derive a numeric confidence score using the forecast card audit checklist and evidence count.
- Formula (clamped to 0-1):
  `0.35 + 0.05*ln(1+evidenceCount) + 0.10*baseRatePresent + 0.10*twoSidedSearch + 0.10*independenceChecked + 0.10*influenceUnderThreshold`
- Bands: HIGH >= 0.75, MED 0.55-0.74, LOW < 0.55.
- Store `ai_confidence` on `trade_logs` and persist the full `ForecastCard` (including `audit`, `clusters`, `provenance`) in `runs.output_result` for auditability.

## Risk and Policy Engine

Policy checks run in this order:

1. Bot status is active and not paused.
2. Daily AI cost cap not exceeded.
3. Max trades per day not exceeded.
4. Max daily loss not exceeded.
5. Max position size not exceeded.
6. Slippage threshold not exceeded.
7. Paper balance sufficient (including fees) using active paper session balance.

Malformed LLM response policy:

- Retry twice.
- If still invalid: pause bot and alert user.

## Paper Trading Simulation (FOK)

```
simulateFok(side, orderBook, sizeUsd or sizeShares):
  walk book on the correct side
  compute total fill size and avg price
  if not fully filled -> REJECTED
  compute slippage vs best bid/ask
  apply fees to derive net cost
```

No partial fills are recorded.

## Data Model (MVP)

### users

- id (uuid, pk) - Supabase auth user ID
- phone_e164 (text, unique) - Normalized E.164 phone number (for trial gating)
- phone_hash (text) - SHA-256 hash of phone for display
- tier (text, default 'trial') - 'trial', 'paid'
- revenuecat_app_user_id (text, unique)
- entitlement_status (text, default 'inactive') - 'active', 'trialing', 'expired', 'canceled'
- entitlement_expires_at (timestamptz)
- entitlement_product_id (text)
- trial_started_at (timestamptz)
- trial_ends_at (timestamptz)
- timezone (text, default 'UTC')
- notifications_enabled (bool, default true)
- telegram_linked_at (timestamptz)
- created_at, updated_at

Auth: Apple and Google OAuth only via Supabase Auth.

### bots

- id (uuid, pk)
- user_id (uuid, unique, fk → users.id)
- status (text, default 'paused') - 'active', 'paused', 'error'
- Model selection via `tier_model_defaults` + `bot_model_configs` (see below)
- strategy_prompt (text) - Custom instructions for the bot
- max_daily_loss_usd (numeric, default 100)
- max_position_size_usd (numeric, default 200)
- max_trades_per_day (int, default 10)
- slippage_threshold_percent (numeric, default 2)
- daily_ai_cost_usd (numeric, default 0) - Running total today
- daily_ai_limit_usd (numeric, default 0.50)
- daily_cost_reset_at (timestamptz) - Last time daily cost was reset (for idempotent resets)
- next_run_at (timestamptz) - When bot is next due
- run_interval_hours (int, default 4)
- decision_window_seconds (int, default 300)
- last_run_at (timestamptz)
- last_run_status (text) - 'success', 'failed', 'partial'
- created_at, updated_at

### runs

Job queue for bot executions. Workers claim due jobs with `FOR UPDATE SKIP LOCKED`.

- id (uuid, pk)
- bot_id (uuid, fk)
- status (pending, claimed, running, completed, failed)
- run_type (scheduled, reactive, user)
- scheduled_for (timestamptz)
- claimed_by (text) - Worker instance ID
- claimed_at (timestamptz)
- started_at (timestamptz)
- completed_at (timestamptz)
- decision_window_started_at (timestamptz)
- decision_window_ends_at (timestamptz)
- input_params (jsonb) - Market IDs, research params, top news article refs (title/url)
- output_result (jsonb) - Final decision, positions, P&L, forecast card/audit
- error_message (text)
- retry_count (int, default 0)
- idempotency_key (uuid, unique)
- created_at

### trade_logs

Every trading decision (including HOLD and REJECTED).

- id (uuid, pk)
- run_id (uuid, fk → runs.id)
- bot_id (uuid, fk)
- action (buy, sell, hold, rejected)
- execution_status (pending, executed, failed)
- market_id (text)
- token (yes, no)
- size_usd (numeric)
- size_shares (numeric)
- execution_price (numeric)
- slippage_percent (numeric)
- fee_usd (numeric)
- ai_confidence (numeric) - Derived confidence score from forecast card
- ai_reasoning (text)
- rejection_reason (text)
- error_message (text)
- order_book_snapshot (jsonb, top 5 levels)
- idempotency_key (uuid, unique)
- created_at

### positions

- id (uuid, pk)
- bot_id (uuid, fk)
- market_id (text)
- token (yes, no)
- total_shares (numeric)
- average_entry_price (numeric)
- closed_at (timestamptz, nullable) - Set when position reaches zero shares
- updated_at

**Position Updates:**
- Use atomic SQL updates with row-level locking
- When `total_shares` reaches 0, set `closed_at` instead of deleting
- Soft-closed positions retained for P&L history

### paper_sessions

- id (uuid, pk)
- bot_id (uuid, fk)
- starting_balance_usd (numeric)
- current_balance_usd (numeric)
- ended_balance_usd (numeric)
- started_at (timestamptz)
- ended_at (timestamptz, nullable)
- reset_reason (text)

One active session per bot: `ended_at` is null.

### bot_failures

AI or execution failures for diagnostics.

- id (uuid, pk)
- bot_id (uuid, fk)
- run_id (uuid, fk) - nullable
- error_type (text) - 'ai_failure', 'execution_failure', 'rate_limit', 'external_api'
- error_message (text)
- context (jsonb)
- created_at

### telegram_links

Telegram account linking.

- id (uuid, pk)
- user_id (uuid, fk, unique)
- telegram_user_id (text, unique)
- phone_hash (text) - Hash from Telegram
- phone_last4 (text) - Last 4 digits
- linked_at (timestamptz)
- status (text, default 'pending') - 'pending', 'linked'
- otp_code (text) - Current OTP (hashed)
- otp_expires_at (timestamptz)

### signal_events

Reactive triggers used for dedupe and audit.

- id (uuid, pk)
- bot_id (uuid, fk)
- signal_type (text) - 'news', 'price', 'liquidity', 'volume'
- score (numeric)
- reason (varchar(500)) - Short reason text (max 500 chars)
- window_start (timestamptz)
- window_end (timestamptz)
- status (text) - 'new', 'queued', 'ignored'
- run_id (uuid, fk, nullable)
- created_at (timestamptz)

### chat_messages

Telegram chat history with rolling retention.

- id (uuid, pk)
- user_id (uuid, fk)
- bot_id (uuid, fk)
- channel (text) - 'telegram'
- direction (text) - 'user', 'assistant', 'system'
- message_text (text)
- metadata (jsonb)
- created_at (timestamptz)

Retention: keep 90 days, purge older rows via scheduled job.

### daily_summaries

Cached daily summary for notifications (denormalized).

- id (uuid, pk)
- bot_id (uuid, fk)
- date (date)
- summary_text (text) - Generated summary
- pnl_change_usd (numeric) - P&L for the day
- trades_count (int)
- positions_count (int)
- generated_at (timestamptz)

Indexes:

- users(phone_e164) - unique, for trial gating
- users(revenuecat_app_user_id) - unique
- bots(user_id) - unique
- bots(next_run_at) - for scheduler polling
- runs(bot_id) - for looking up bot history
- runs(status, scheduled_for asc) - for worker polling
- runs(idempotency_key) - unique, for deduplication
- trade_logs(bot_id, created_at desc)
- trade_logs(run_id) - for linking to runs
- trade_logs(idempotency_key) - unique, for deduplication
- positions(bot_id, market_id, token) - unique composite
- paper_sessions(bot_id) - for history
- bot_failures(bot_id, created_at desc) - for diagnostics
- daily_summaries(bot_id, date) - unique
- signal_events(bot_id, signal_type, window_start) - unique
- chat_messages(user_id, created_at desc)

## Auth and RLS

- Supabase Auth with Apple and Google only.
- RLS: users read their own rows; backend service role writes trade logs and positions.
- No client access to service role or trading internals.

## Telegram Integration

### Webhook Architecture

**Pattern:** Webhook + Queue for reliability

```
Telegram Servers ──HTTPS webhook──► API (Elysia) ──enqueue──► Upstash Redis
                                                              │
                                                              ▼
                                                    Worker Service
                                                    (BullMQ consumers)
```

**Why this pattern:**
- Survives brief outages (queue buffers messages)
- Handles traffic spikes gracefully
- Prevents missed messages during deployments
- Scales beyond MVP

**Webhook Endpoint:** `POST /webhooks/telegram`
1. Validate `X-Telegram-Bot-Api-Secret-Token` header
2. Immediately return 200 OK (within 60s)
3. Enqueue message for async processing
4. Background worker processes from queue

### Linking Flow

1. User taps "Connect Telegram" in app
2. App generates link token (10 min expiry) → deep link: `https://t.me/PolymancerBot?start=TOKEN`
3. User taps Start in Telegram → bot requests contact share
4. User taps "Share Contact" → Telegram provides verified `phone_e164`
5. Bot links: `telegram_user_id` + `phone_e164` → `user_id`
6. App polls `GET /telegram/link-status?token=TOKEN` for completion

**Implementation Details:**
- Token: `crypto.randomBytes(32)` hashed with SHA-256, stored as hash only
- Rate limit: 5 tokens per user per hour
- Contact verification: Check `contact.user_id === message.from.id` (prevents spoofing)
- Phone format: E.164 from Telegram (e.g., `+14155552671`), strip `+` for storage
- Edge cases:
  - Token expired: Return 410, prompt regenerate
  - Token used: Return 409, already linked
  - No contact shared: Bot re-sends contact button on `/start`
  - Wrong user: Reject if phone doesn't match expected user

**Storage:** `telegram_links` table with `link_token` (hashed), `link_expires_at`, `phone_e164`

## Kill Switch

Emergency stop for all trading activity.

**Implementation:**
- Stored in `global_settings` table with `kill_switch_enabled` boolean
- Worker polls this flag at start of each run
- When enabled: all runs immediately fail with "kill switch active"
- Only accessible via protected admin endpoint

**Endpoint:** `POST /admin/kill-switch`
- Requires bearer token auth (admin only)
- Body: `{ "enabled": true/false }`
- Persists state until explicitly disabled

## Notifications

- 9am daily summary (local time per `users.timezone`; all stored timestamps remain UTC).
- Scheduler runs in UTC and computes local 9am for each user.
- Alerts: bot paused, daily loss hit, repeated errors, market resolution, large position change (>25% of paper balance).
- `daily_summaries` is unique per bot per local date.

## Billing (RevenueCat)

- Paid-only with 7-day trial.
- Trial gated by phone number from Telegram (unique per E.164 normalized number).
- $19.99/month.
- Webhook updates `tier`, `entitlement_status`, `entitlement_expires_at`, and `entitlement_product_id`.
- No free tier in MVP, but schema should allow it.

### Webhook Security

**Important:** RevenueCat does NOT provide signature verification (no HMAC like Stripe).

**Required security measures:**
1. **Validate Authorization header**: Bearer token matches `REVENUECAT_WEBHOOK_SECRET`
2. **Idempotency**: Store `event.id` in `processed_webhooks` table, reject duplicates
3. **Schema validation**: Use TypeBox to validate payload structure
4. **User verification**: Always check `event.app_user_id` exists before processing

**Table:**
```sql
CREATE TABLE processed_webhooks (
  event_id VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMP DEFAULT NOW()
);
```

**Endpoint:** `POST /webhooks/revenuecat`
- Return 200 OK immediately
- Process asynchronously if needed

## API Surface (MVP)

**Public endpoints (authenticated):**

- GET /me
- GET /bot
- PATCH /bot (update config, including status: active/paused)
- POST /bot/reset-paper (close current session, start new paper session)
- GET /runs (bot execution history)
  - Query: `?limit=50&cursor=<uuid>` (cursor-based pagination)
  - Default limit: 50, max: 100
- GET /trade-logs
  - Query: `?limit=50&cursor=<uuid>` (cursor-based pagination)
  - Default limit: 50, max: 100
- GET /positions
- POST /telegram/link (initiate linking, returns deep link URL)
- GET /telegram/link-status?token=<link_token> (poll for completion)

**Internal endpoints:**

- POST /webhooks/telegram (receives Telegram updates, validates secret token, enqueues)
- POST /webhooks/revenuecat
- POST /admin/kill-switch (protected by admin bearer token)
- GET /admin/health

## Deployment and Ops

See `docs/deployment-spec.md` for hosting, secrets, rate limits, and operational controls.

## Open Items (TBD)

See `docs/post-mvp-spec.md` for full roadmap.
