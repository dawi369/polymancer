# Polymancer Tech Spec

This document defines technical implementation details for the MVP. Product scope, UX, and feature goals live in `docs/docs-mk3/design-spec.md` to avoid duplication.

## System Components

- Mobile app: Expo (UI only, no trading logic).
- Backend API: Bun + Elysia on Fly.io (fast, user-facing HTTP).
- Worker: Bun process on Fly.io (long-running, handles bot execution).
- Polyseer: Research pipeline invoked by Worker (not a scheduled daemon).
- ExecutionAdapter: paper implementation using pmxt, live adapter stubbed.
- Data: Supabase (Postgres + Auth + job queue).
- External services: OpenRouter, pmxt (Polymarket + Kalshi), Valyu API, RevenueCat, Telegram Bot API, Expo Push.

## Repository Layout (Target)

```
apps/api                # Elysia API (user-facing HTTP)
apps/worker             # Bot execution worker (long-running)
apps/mobile             # Expo app
packages/agent          # Polyseer (git submodule)
packages/pmxt           # pmxt SDK for market data + trading
packages/pamela-core    # Ported from Pamela (news, signals, confidence)
packages/simulator      # Paper trading simulation
packages/shared         # Shared types and utilities
```

## Agent Architecture

See `docs/agent-schema.md` for the complete agent system design, including:
- Decision Agent (conversation + decision authority)
- Signal Layer (reactive triggers)
- Worker execution pipeline
- Chat integration
- Reused components from Pamela

## Polyseer Agent Architecture

Polyseer is a multi-agent AI system that conducts deep research on prediction markets. It consists of six specialized agents working in concert:

### Agent Roles

1. **Orchestrator** - Coordinates the research workflow, manages state between agents
2. **Planner Agent** - Breaks down market questions into research pathways, generates subclaims and search seeds
3. **Researcher Agent** - Gathers evidence from multiple sources using Valyu Deep Search and Web Search
4. **Critic Agent** - Identifies evidence gaps, provides quality feedback, recommends follow-up searches
5. **Analyst Agent** - Performs Bayesian probability aggregation to compute final probabilities
6. **Reporter Agent** - Generates human-readable analysis reports

### Research Cycle

```
User Query -> Orchestrator -> Planner -> Researcher (PRO) / Researcher (CON)
                                              |
                                              v
                                        Valyu Search
                                              |
                                              v
                                        Evidence Classification (A/B/C/D)
                                              |
                                              v
                                        Critic Agent (gap analysis)
                                              |
                                              v
                                        Follow-up Research (if needed)
                                              |
                                              v
                                        Analyst (Bayesian aggregation)
                                              |
                                              v
                                        Reporter -> Final Verdict
```

### Evidence Quality Classification

| Type | Description | Weight Cap |
|------|-------------|------------|
| A | Primary Sources (official docs, press releases) | 2.0 |
| B | High-Quality Secondary (Reuters, Bloomberg, WSJ) | 1.6 |
| C | Standard Secondary (reputable news with citations) | 0.8 |
| D | Weak/Speculative (social media, rumors) | 0.3 |

### Bayesian Probability Aggregation

Key formulas:
- **Log Likelihood Ratio**: `LLR = log(P(evidence|YES) / P(evidence|NO))`
- **Probability Update**: `p_new = p_old * exp(LLR)`
- **Correlation Adjustment**: Accounts for evidence clustering and dependencies

Outputs:
- **pNeutral**: Objective assessment based purely on evidence
- **pAware**: Market-informed probability incorporating current prices

## Runtime Model

- One bot per user (MVP).
- Polyseer is invoked as a **synchronous pipeline** by the Worker, not run as a scheduled daemon.
- Entry point: `runUnifiedForecastPipeline(opts)` - returns `ForecastCard` with pNeutral, pAware, recommendation.
- Progress tracked via `onProgress(step, details)` callback.
- Concurrency guard: only one run per bot at a time (job claim with `FOR UPDATE SKIP LOCKED`).
- Runs are idempotent and safe to retry.

### Run Flow (Single Execution)

1) Worker picks up due bot (bots scheduled every 4 hours).
2) Opens 5-minute decision window.
3) Load bot config and status.
4) Enforce global kill switch and bot pause status.
5) Check daily AI cost cap.
6) Polyseer pipeline invoked: Planner generates research strategy.
7) Researcher Agent conducts PRO and CON research using Valyu API.
8) Evidence is classified by quality (A/B/C/D).
9) Critic Agent analyzes gaps and recommends follow-up research.
10) Second research cycle if gaps identified.
11) Analyst Agent performs Bayesian probability aggregation.
12) Reporter Agent generates final analysis with pNeutral and pAware.
13) System parses Polyseer output for trading decision.
14) Fetch market data via pmxt for selected markets.
15) Simulate FOK execution and compute fees/slippage via paper adapter.
16) Run risk checks and record decision.
17) Update positions and paper balance.
18) Emit notifications if thresholds are met.
19) Decision window closes (or earlier if no good opportunities).

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

### Live Adapter (Future)

- Present but disabled.
- Hard error if called while `LIVE_TRADING_ENABLED=false`.
- Will use pmxt's live trading capabilities with proper credentials.

## Market Data Provider

- Abstract market data access behind a `MarketDataProvider` interface.
- MVP uses pmxt SDK for Polymarket (Kalshi in future).
- pmxt provides unified API across prediction markets.
- Full universe discovery via pmxt, then cap to 50 markets per run.
- No TTL caching in MVP.

## LLM Integration

- Primary research: Valyu API (Deep Search + Web Search) via Polyseer agents.
- Decision making: OpenRouter for final trading decisions.
- Models: cost-efficient by default.
- Daily cost cap: $0.50 per bot (combined Valyu + OpenRouter).
- Track cost per run and aggregate daily.

### Valyu API Integration

Polyseer uses Valyu for comprehensive market research:

- **Deep Search**: Academic papers, proprietary datasets
- **Web Search**: Fresh news, market analysis, expert opinions
- **Evidence Classification**: Type A/B/C/D quality scoring
- **Search Seeds**: Generated by Planner Agent based on market questions

API key management:
- Valyu API key required for agent research capabilities
- Configured at deployment level (not per-user)

### Decision Schema (MVP)

```json
{
  "action": "BUY" | "SELL" | "HOLD",
  "market_id": "...",
  "token": "YES" | "NO",
  "size_usd": 25.0,
  "size_shares": 50.0,
  "confidence": 0.0,
  "reasoning": "..."
}
```

- Agent may return USD or shares. System normalizes both.
- Responses must be strict JSON. No tool calls in MVP.

### Polyseer Output Schema

Polyseer's Reporter Agent outputs:

```json
{
  "verdict": "YES" | "NO" | "UNCLEAR",
  "pNeutral": 0.65,
  "pAware": 0.72,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "evidence_summary": {
    "pro": ["point 1", "point 2"],
    "con": ["point 1"]
  },
  "key_factors": ["factor 1", "factor 2"],
  "recommendation": "BUY" | "SELL" | "HOLD"
}
```

## Risk and Policy Engine

Policy checks run in this order:

1) Bot status is active and not paused.
2) Daily AI cost cap not exceeded.
3) Max trades per day not exceeded.
4) Max daily loss not exceeded.
5) Max position size not exceeded.
6) Slippage threshold not exceeded.
7) Paper balance sufficient (including fees).

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

- id (uuid, pk)
- email (text)
- tier (text)
- timezone (text)
- notifications_enabled (bool)
- created_at, updated_at

Auth: Apple and Google OAuth only via Supabase Auth.

### bots

- id (uuid, pk)
- user_id (uuid, unique)
- status (paper, paused)
- model_id (text)
- strategy_prompt (text)
- max_daily_loss_usd (numeric)
- max_position_size_usd (numeric)
- max_trades_per_day (int)
- slippage_threshold_percent (numeric)
- daily_ai_cost_usd (numeric)
- daily_ai_limit_usd (numeric)
- last_run_at (timestamptz)
- created_at, updated_at

### trade_logs

- id (uuid, pk)
- execution_id (uuid, unique)
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
- ai_confidence (numeric)
- ai_reasoning (text)
- rejection_reason (text)
- error_message (text)
- order_book_snapshot (jsonb, top 5 levels)
- created_at

Every decision is logged, including HOLD and REJECTED.

### positions

- id (uuid, pk)
- bot_id (uuid, fk)
- market_id (text)
- token (yes, no)
- total_shares (numeric)
- average_entry_price (numeric)
- updated_at

### paper_sessions

- id (uuid, pk)
- bot_id (uuid, fk)
- starting_balance_usd (numeric)
- started_at (timestamptz)
- ended_at (timestamptz, nullable)
- reset_reason (text)

### bot_failures

- id (uuid, pk)
- bot_id (uuid, fk)
- error_type (text)
- error_message (text)
- created_at

### telegram_links

- id (uuid, pk)
- user_id (uuid, fk, unique)
- telegram_user_id (text, unique)
- phone_hash (text)
- phone_last4 (text)
- linked_at (timestamptz)
- status (linked, pending)

Indexes:

- trade_logs(bot_id, created_at desc)
- positions(bot_id, market_id, token unique)
- bots(user_id unique)

## Auth and RLS

- Supabase Auth with Apple and Google only.
- RLS: users read their own rows; backend service role writes trade logs and positions.
- No client access to service role or trading internals.

## Telegram Linking (Phone + OTP)

1) User initiates linking in app and enters phone number.
2) App generates one-time token and displays Telegram deep link.
3) User opens bot, submits token.
4) Bot sends OTP via Telegram message.
5) User enters OTP in app to complete linking.

Telegram is read-only in MVP.

## Notifications

- 9am daily summary (local time).
- Alerts: bot paused, daily loss hit, repeated errors, market resolution, large position change.
- Large position change threshold: TBD.

## Billing (RevenueCat)

- Paid-only with 7-day trial.
- Trial gated by phone number (unique per E.164 normalized number).
- $19.99/month.
- Webhook updates user tier and entitlements.
- No free tier in MVP, but schema should allow it.

## API Surface (MVP)

Public endpoints (authenticated):

- GET /me
- GET /bot
- PATCH /bot
- POST /bot/pause
- POST /bot/resume
- POST /bot/reset-paper
- GET /trade-logs
- GET /positions
- POST /telegram/link
- POST /telegram/verify

Internal endpoints:

- POST /webhooks/revenuecat
- POST /admin/kill-switch
- GET /admin/health

## Rate Limiting and Cost Controls

- API rate limit per user: default 60 req/min (tunable).
- AI daily cap enforced per bot: $0.50 (Valyu + OpenRouter combined).
- Backoff on pmxt/API errors.

## Observability and Ops

- Structured JSON logs for each run and decision.
- Health endpoint reports API + DB connectivity.
- Kill switch to pause all bots.

## Deployment

- **Fly.io** for both API and Worker services.
- API: Bun + Elysia, scales horizontally.
- Worker: Long-running Bun process, polls for due bots every 30-60s.
- Supabase for auth, database, and job queue.
- Valyu API key configured at deployment level.
- pmxt SDK for Polymarket (and future Kalshi) access.

## Open Items (TBD)

- pmxt SDK version and feature set.
- Valyu API rate limits and cost estimation.
- Caching strategy and TTL values.
- Large position change threshold.
- Polyseer schedule cadence configuration.
- Web UI surface for future release.
