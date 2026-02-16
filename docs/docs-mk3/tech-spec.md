# Polymancer Tech Spec (docs-mk3)

This document defines technical implementation details for the MVP. Product scope, UX, and feature goals live in `docs/docs-mk3/design-spec.md` to avoid duplication.

## System Components

- Mobile app: Expo (UI only, no trading logic).
- Backend API: Bun + Elysia on Railway.
- Agent runtime: Pamela fork (ElizaOS) embedded in the backend process.
- ExecutionAdapter: paper implementation for MVP, live adapter stubbed.
- Data: Supabase (Postgres + Auth).
- External services: OpenRouter, Polymarket APIs, RevenueCat, Telegram Bot API, Expo Push.

## Repository Layout (Target)

```
apps/api                # Elysia API + agent runtime
apps/mobile             # Expo app
packages/agent           # Pamela fork (git submodule)
packages/simulator       # Paper trading simulation
packages/shared          # Shared types and utilities
```

## Runtime Model

- One bot per user (MVP).
- Pamela scheduling loop runs as-is.
- Concurrency guard: only one run per bot at a time.
- Runs are idempotent and safe to retry.

### Run Flow (Single Execution)

1) Load bot config and status.
2) Enforce global kill switch and bot pause status.
3) Check daily AI cost cap.
4) Discover candidate markets via Pamela strategy.
5) Select up to 50 markets for context.
6) Fetch market metadata + L2 order book for those markets.
7) Build LLM context (rules, positions, P&L, market data).
8) Call OpenRouter and parse JSON response.
9) Validate response and retry twice on malformed output.
10) Simulate FOK execution and compute fees/slippage.
11) Run risk checks and record decision.
12) Update positions and paper balance.
13) Emit notifications if thresholds are met.

## ExecutionAdapter

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

- Uses order book depth to simulate FOK fills.
- Applies real Polymarket fee schedule.
- Adds artificial latency (200-500ms) before confirming fills.
- Never signs or submits live orders.

### Live Adapter (Future)

- Present but disabled.
- Hard error if called while `LIVE_TRADING_ENABLED=false`.

## Market Data Provider

- Abstract market data access behind a `MarketDataProvider` interface.
- MVP uses Polymarket official APIs (exact endpoints TBD due to updates).
- Full universe discovery, then cap to 50 markets per run.
- No TTL caching in MVP.

## LLM Integration

- Provider: OpenRouter.
- Models: cost-efficient by default.
- Daily cost cap: $0.50 per bot.
- Track cost per run and aggregate daily.

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

- Paid-only with 14-day trial.
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
- LLM daily cap enforced per bot: $0.50.
- Backoff on Polymarket API errors.

## Observability and Ops

- Structured JSON logs for each run and decision.
- Health endpoint reports API + DB connectivity.
- Kill switch to pause all bots.

## Deployment

- Railway for API + agent runtime.
- Supabase for auth and database.
- Optional future optimization: Cloudflare Workers + Durable Objects inspired by MAHORAGA.

## Open Items (TBD)

- Exact Polymarket API endpoints and versioning.
- Caching strategy and TTL values.
- Large position change threshold.
- Exact schedule cadence (inherits Pamela defaults for now).
- Web UI surface for future release.
