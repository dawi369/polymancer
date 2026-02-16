# Polymancer - Paper Trading MVP Design Spec

**Platform**: iOS & Android via Expo SDK 55  
**Goal**: Mobile app for non-technical users to create, configure, and deploy AI-powered paper trading bots on Polymarket  
**Current Phase**: Paper Trading MVP (Zero Live Trading)  
**Target Timeline**: 2-3 months for solo developer  
**Future Phase**: Live Trading (see docs/live-trading-architecture.md)

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │───▶│  Elysia API     │───▶│    Supabase     │
│  (Expo + RN)    │◄────│   (Bun)         │◄────│  (PostgreSQL)   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌────────────┐ ┌──────────┐ ┌──────────────┐
            │ OpenRouter │ │ Inngest  │ │  Polymarket  │
            │  (AI)      │ │ (Jobs)   │ │  (Gamma API) │
            └────────────┘ └──────────┘ └──────────────┘
```

**Note**: Live trading components (credential decryption, order signing, CLOB submission) shown in gray are Phase 2 only. See docs/live-trading-architecture.md.

### Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Mobile | Expo SDK 55 + React Native + NativeWind + gluestack-ui | iOS/Android UI |
| Backend | Bun + Elysia | REST API, business logic |
| Database | Supabase (PostgreSQL) | All persistent data, auth |
| AI | OpenRouter (via Vercel AI SDK) | Multi-model inference |
| Scheduling | Inngest | Per-bot durable execution |
| Hosting | Railway | Backend + Inngest worker |
| Auth | Supabase Auth | Apple + Google OAuth |
| Payments | RevenueCat | iOS + Google Play subscriptions |
| Notifications | Expo Push Notifications | End-of-day summaries |

### Phase 2 Components (Not in MVP)

- ❌ Live trading execution
- ❌ Credential management / key storage
- ❌ Real-time WebSocket dashboard
- ❌ Multiple bots per user
- ❌ AI-powered market discovery
- ❌ Historical backtesting

---

## Authentication

Apple + Google OAuth only (no email/password).

**Flow**:
1. App launches, check for existing Supabase session in Expo SecureStore
2. No session: show login screen with "Sign in with Apple" / "Sign in with Google"
3. Supabase `signInWithOAuth()` handles the OAuth exchange
4. On first login: Supabase trigger on `auth.users` inserts row into `public.users`
5. Session token persisted to Expo SecureStore
6. Token refresh handled automatically by Supabase SDK
7. All Elysia API calls include `Authorization: Bearer <token>`, validated via `supabase.auth.getUser()`

---

## Core Features (MVP)

### 1. Bot Creation

- Natural language strategy prompt with templates
- AI model selection (all tiers use cost-efficient models initially)
- Hard-coded safety rules:
  - Max daily loss USD
  - Max position size USD
  - Allowed market categories (from curated 50 markets)
  - Max trades per day (default 10)
  - Slippage threshold (default 2%)
- User-defined starting paper balance ($100 - $100,000 USD)
- **Note**: No credential import required for paper trading

### 2. Paper Trading Engine

Simulates trading against 50 curated Polymarket markets.

- Fetches real-time order book from Polymarket CLOB API
- Simulates FOK (Fill or Kill) execution against live order book depth
- Calculates real slippage from order book walk
- Simulates taker fees (2% default)
- Tracks paper balance (decreases on buys, increases on sells, includes fees)
- Rejects trades when paper balance is insufficient
- Tracks P&L via average cost basis method
- All trades logged with full AI reasoning

**Curated Markets**: 50 static markets organized by category (see docs/markets.md):
- Politics (15 markets)
- Crypto (15 markets)
- Sports (10 markets)
- Science/Tech (5 markets)
- Pop Culture (5 markets)

### 3. Dashboard

- P&L summary (realized from trade_logs)
- Current positions with entry price
- Trade log with AI reasoning, confidence, slippage, fees
- Paper balance remaining
- Pause/resume bot
- **Note**: No emergency stop needed (paper only)

### 4. Safety & Security

- All risk rules enforced server-side in Elysia
- **Note**: No credential encryption needed for paper-only MVP
- Platform safety via Inngest pause/resume

---

## Strategy Templates

| Template | Strategy Prompt | Default Rules |
|----------|----------------|---------------|
| **Conservative** | "Only buy YES tokens when probability is below 20% and market volume exceeds $100k in the last 24h. Hold until probability reaches 50% or higher, then sell." | max_loss: $50, max_position: $200, max_trades: 5 |
| **Momentum** | "Buy YES tokens in trending markets where probability has increased by 10%+ in the last 24 hours. Sell if probability drops 5% from peak." | max_loss: $100, max_position: $500, max_trades: 10 |
| **Contrarian** | "Look for markets where probability recently dropped sharply (15%+ in 24h) but fundamentals suggest recovery. Buy YES on dips, sell on recovery to prior levels." | max_loss: $100, max_position: $300, max_trades: 8 |

---

## Data Flow

### Bot Execution Loop

Each bot runs as an independent Inngest function with concurrency limit of 1. Triggered on a cron schedule: Free=4h (6x/day), Pro=2h (12x/day).

```
For a single bot execution cycle:

1. PREFLIGHT CHECKS
   - Load bot config from Supabase (status, rules, strategy_prompt)
   - Check daily AI cost cap: if exceeded, skip with rejection log
   - If bot.status != 'paper', skip (all bots are paper in MVP)
   - If bot.consecutive_failures >= 5:
     * set status='paused'
     * send push notification
     * skip
   - **CRITICAL FIX**: Only reset consecutive_failures on EXECUTED trades, not HOLD/rejected

2. LOAD CURATED MARKETS
   - Query market_cache for the 50 curated markets
   - Filter by allowed_categories if set
   - Include markets where bot has open positions
   - Fetch order book for each from Polymarket CLOB API
   - Cache results in market_cache (5min TTL)

3. BUILD AI CONTEXT
   - Load current positions from Supabase
   - Query trade_logs: count today's trades, sum today's realized P&L
   - Load last 10 trades for recent context
   - Assemble context (see AI Context section)

4. AI DECISION
   - Call OpenRouter with assembled context
   - Parse and validate response (see AI Response Validation)
   - On parse/validation failure:
     * increment consecutive_failures
     * log as 'rejected'
     * skip to step 7
   - On success: pass to risk validation

5. FOK SIMULATION
   - Simulate FOK execution against order book
   - If simulation returns REJECTED (insufficient liquidity):
     * log as 'rejected'
     * skip to step 7
   - Calculate projected slippage, fees

6. RISK VALIDATION
   - **CRITICAL FIX**: Check paper balance using FOK results
   - Run all 6 checks (see Risk Validation section)
   - On any failure: log as 'rejected' with reason, skip to step 7

7. EXECUTE & RECORD (CRITICAL FIX: Proper Idempotency)
   
   Step 7a: Generate execution_id (UUIDv4)
   Step 7b: Insert PENDING trade_log:
     ```
     INSERT INTO trade_logs (
       execution_id, execution_status, bot_id, market_id, ...
     ) VALUES (
       'uuid', 'pending', ...
     )
     ```
   
   Step 7c: Execute paper trade simulation (already done in step 5)
   
   Step 7d: Update trade_log to EXECUTED:
     ```
     UPDATE trade_logs SET
       execution_status = 'executed',
       size = [shares],
       execution_price = [price],
       fee_usd = [fee],
       ...
     WHERE execution_id = 'uuid'
     ```
   
   Step 7e: Triggers automatically update:
     - positions table (via trigger_update_positions)
     - paper_balance_usd (via trigger_update_paper_balance)
   
   Step 7f: If execution fails after pending insert:
     UPDATE trade_logs SET execution_status = 'failed', error_message = '...'

8. POST-EXECUTION
   - Update bot.last_run_at, bot.last_run_status
   - **CRITICAL FIX**: Reset consecutive_failures = 0 ONLY if trade was executed
   - Increment daily_ai_cost_usd
   - No push notification (end-of-day summary only)
```

### AI Context (Sent to OpenRouter)

```typescript
{
  strategy_prompt: string,         // User's natural language strategy
  risk_rules: {
    max_daily_loss_usd: number,
    max_position_size_usd: number,
    allowed_categories: string[],
    max_trades_per_day: number,
    slippage_threshold_percent: number,
    paper_balance_remaining_usd: number
  },

  current_positions: Position[],   // From positions table
  todays_pnl_usd: number,         // Sum of realized_pnl_usd from today's trade_logs
  trades_today: number,            // Count from trade_logs
  recent_trades: Trade[],          // Last 10 trades

  markets: {                       // From curated 50 markets
    market_id: string,
    question: string,
    outcome_prices: { yes: number, no: number },
    volume_24h: number,
    order_book: {
      asks: { price: number, size: number }[],
      bids: { price: number, size: number }[]
    }
  }[],

  current_time: string,            // ISO 8601
  type: 'paper'                    // Always paper in MVP
}
```

### AI Response Format

```typescript
{
  action: 'BUY' | 'SELL' | 'HOLD',
  market_id: string,              // Must match a market_id from context
  token: 'YES' | 'NO',
  size_usd: number,
  reasoning: string,              // → stored as trade_logs.ai_reasoning
  confidence: number              // → stored as trade_logs.ai_confidence
}
```

**Case mapping**: AI returns uppercase (`BUY`, `YES`). Application lowercases before DB insert.

### AI Response Validation

```
1. PARSE: Attempt JSON.parse()
   - Failure: log rejection_reason='malformed_ai_response', increment consecutive_failures

2. SCHEMA CHECK:
   - action must be 'BUY', 'SELL', or 'HOLD'
   - If action != 'HOLD':
     * market_id must match one from context
     * token must be 'YES' or 'NO'
     * size_usd must be positive number
   - confidence must be 0-1

3. HALLUCINATION CHECK:
   - Reject if market_id not in provided markets list

4. On any validation failure:
   - Log raw response in ai_reasoning
   - Set action='rejected', rejection_reason='[specific reason]'
   - Increment consecutive_failures
   - Continue to next cycle
```

### FOK Simulation Algorithm

```
simulate_fok_buy(asks: OrderBookLevel[], size_usd: number, fee_rate: number):
  remaining_usd = size_usd
  total_shares = 0

  for each level in asks (sorted by price ASC):
    affordable_shares = remaining_usd / level.price
    fill_shares = min(affordable_shares, level.size)
    cost = fill_shares * level.price
    total_shares += fill_shares
    remaining_usd -= cost
    if remaining_usd <= 0.01: break

  if remaining_usd > 0.01:
    return { status: 'REJECTED', reason: 'insufficient_liquidity' }

  actual_cost = size_usd - remaining_usd
  avg_fill_price = actual_cost / total_shares
  best_ask = asks[0].price
  slippage_pct = ((avg_fill_price - best_ask) / best_ask) * 100
  fee_usd = actual_cost * fee_rate

  return {
    status: 'FILLED',
    size: total_shares,             // → trade_logs.size
    execution_price: avg_fill_price, // → trade_logs.execution_price
    slippage_percent: slippage_pct,
    fee_usd: fee_usd,
    size_usd: actual_cost
  }

simulate_fok_sell(bids: OrderBookLevel[], shares: number, fee_rate: number):
  // Mirror logic walking bids DESC
```

---

## Risk Rule Validation

Six server-side checks. Run sequentially after FOK simulation, reject on first failure.

1. **Daily AI Cost Cap Check**:
   - Reject if `daily_ai_cost_usd >= daily_ai_limit`
   - Reason: `'daily_ai_cost_limit_exceeded'`
   - Limits: Free=$0.50/day, Pro=$1/day

2. **Paper Balance Check**:
   - If action=BUY: reject if `fok.size_usd + fok.fee_usd > paper_balance_usd`
   - Reason: `'insufficient_paper_balance'`

3. **Daily Loss Check**:
   - Query: `SELECT COALESCE(SUM(realized_pnl_usd), 0) FROM trade_logs WHERE bot_id = $1 AND created_at >= CURRENT_DATE AND action = 'sell'`
   - Reject if `abs(todays_loss) + size_usd > max_daily_loss_usd`
   - Reason: `'daily_loss_limit_exceeded'`

4. **Position Size Check**:
   - Query positions table for current holdings
   - For BUY: reject if `current_position_value + size_usd > max_position_size_usd`
   - Reason: `'position_size_limit_exceeded'`

5. **Trade Frequency Check**:
   - Query: `SELECT COUNT(*) FROM trade_logs WHERE bot_id = $1 AND created_at >= CURRENT_DATE AND action IN ('buy', 'sell')`
   - Reject if `trades_today >= max_trades_per_day`
   - Reason: `'max_trades_per_day_exceeded'`

6. **Slippage Check**:
   - Use slippage_percent from FOK simulation
   - Reject if `slippage_percent > slippage_threshold_percent`
   - Reason: `'slippage_threshold_exceeded'`

---

## Onboarding Flow

1. **Welcome**: App introduction, risk warnings, disclaimer acceptance
2. **Sign In**: Apple or Google OAuth (Supabase Auth)
3. **Create First Bot** (no credential import needed):
   - Choose template or write custom strategy prompt
   - Set risk rules (pre-filled from template)
   - Set paper balance ($100 - $100,000)
   - Select AI model
4. **Paper Trading Begins Immediately**:
   - Bot starts in `status='paper'`
   - No unlock mechanism (paper only)
   - Trade immediately

**Note**: All trading is paper-only. No credential import, no unlock gates, no live activation.

---

## Monetization (Flat Fee Subscriptions)

| Tier | Price | Polling | Models | Daily AI Cap |
|------|-------|---------|--------|--------------|
| **Free** | $0 | 4h (6x/day) | Cost-efficient | $0.50 |
| **Pro** | $29/mo | 2h (12x/day) | Cost-efficient | $1.00 |

**Cost Controls**:
- Strict `max_tokens` per AI call
- Polling frequency enforced by Inngest cron
- Hard daily AI cost caps (no trades if exceeded)
- Per-user daily cost tracking in `bots.daily_ai_cost_usd`

### RevenueCat Integration

```
1. Mobile: RevenueCat SDK presents paywall
2. RevenueCat manages subscription lifecycle
3. RevenueCat webhook → Elysia POST /webhooks/revenuecat:
   - Event 'INITIAL_PURCHASE' or 'RENEWAL': set user.tier to purchased tier
   - Event 'CANCELLATION' or 'EXPIRATION': set user.tier = 'free'
4. On tier change:
   - Update user.tier in Supabase
   - Cancel existing Inngest cron for bot
   - Register new cron with updated polling_frequency_minutes (240 or 120)
5. Entitlement IDs: 'pro' (free = no entitlement)
```

**Webhook Security**:
- Verify RevenueCat webhook signatures
- Implement idempotency with event IDs
- Store processed event IDs for 24+ hours

---

## Notification Strategy

**End-of-Day Summary Only** (no per-trade notifications)

**Timing**: 9:00 AM user's local time

**Content**:
```
Yesterday's Trading Summary for {bot_name}:

Trades: {count}
P&L: ${pnl} ({percent}%)
Current Balance: ${balance}
Positions: {count} open

[View Dashboard]
```

**High Priority Alerts** (always sent, bypass user toggle):
- Bot auto-paused (5 consecutive failures)
- Daily loss limit hit

**Implementation**:
- Inngest daily cron at 9am per user timezone
- Query trade_logs for previous day's activity
- Send via Expo Push Notifications
- Store `expo_push_token` in `users` table

---

## Inngest Configuration

### Functions

| Function ID | Trigger | Concurrency | Purpose |
|-------------|---------|-------------|---------|
| `bot/execute-{bot_id}` | Cron (240min or 120min) | 1 per bot | Main execution loop |
| `bot/on-tier-change` | Event: `user/tier.changed` | 1 per user | Re-register bot cron on tier change |
| `notifications/daily-summary` | Cron: 9:00 per user timezone | 1 per user | Send daily summary push |
| `system/cleanup-cache` | Cron: daily 03:00 UTC | 1 | Delete stale market_cache rows |
| `system/reset-ai-costs` | Cron: daily 00:00 UTC | 1 | Reset daily_ai_cost_usd for all bots |

### Retry Policy

- Bot execution: 1 retry for transient failures (network timeout)
- Tier change handler: 3 retries with exponential backoff
- Daily notifications: 3 retries

### Bot Lifecycle

```
Bot created → register Inngest cron
Bot paused  → cancel Inngest cron
Bot resumed → re-register Inngest cron
Bot deleted → cancel Inngest cron, soft-delete bot
Tier changed → cancel old cron, register new cron
```

---

## Database Backup & Disaster Recovery

### Supabase PITR (Point-in-Time Recovery)

- **Enabled**: Yes (Supabase Pro includes 7-day PITR)
- **Retention**: 7 days of granular recovery
- **Recovery Time**: 15-30 minutes to restore to any point

### Daily Dumps (Future Implementation)

**Status**: Not implemented for MVP (7-day PITR sufficient)

**Future Plan**:
- Schedule: Daily at 02:00 UTC
- Destination: S3 or R2 (TBD)
- Retention: 1 year
- Format: pg_dump compressed
- Monthly restore testing

### Data Retention Policies

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| trade_logs | 1 year | Primary trading history |
| market_cache | 30 days | Ephemeral market data |
| positions | Until closed | Current holdings |
| bot execution logs | 90 days | Inngest execution history |
| user activity | 1 year | Auth and tier changes |

### Disaster Recovery Runbook

**Scenario 1: Accidental Data Deletion**
1. Identify deletion timestamp
2. Use Supabase PITR to restore to 5 minutes before deletion
3. Export affected data
4. Restore production to current time
5. Import exported data
6. Verify data consistency

**Scenario 2: Complete Database Loss**
1. Create new Supabase project
2. Restore from most recent PITR point
3. Update DATABASE_URL in Railway
4. Restart Inngest workers
5. Verify all bots resume correctly

**Scenario 3: Bot Data Corruption**
1. Pause affected bot via dashboard
2. Query trade_logs for inconsistencies
3. Manual reconciliation if needed
4. Reset bot state if necessary
5. Resume bot

---

## Error Handling

### OpenRouter Failures
- **Response**: Default to HOLD
- **Retry**: 1 retry for transient failures
- **Escalation**: After 5 consecutive failures, auto-pause bot + push notification
- **Recovery**: User resumes manually, consecutive_failures resets on next successful EXECUTED trade

### Polymarket API Failures
- **Retry**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Categories**:
  - Rate limit (429): Exponential backoff with jitter
  - Auth failure (401/403): Alert admin immediately
  - Transient (5xx): Retry with backoff
  - Invalid request (400): Log and skip (don't retry)

### Database Failures
- **Critical**: Execution halts, Inngest function throws
- **Recovery**: Manual intervention required
- **Monitoring**: Railway alerts on error rate > 5%

### Consecutive Failures Tracking (CRITICAL FIX)

**Reset Logic**:
```typescript
// CORRECT - Only reset on executed trades
if (tradeExecuted && action !== 'hold' && action !== 'rejected') {
  await db.bots.update(bot.id, { consecutive_failures: 0 });
}

// INCORRECT - Don't do this (resets on any success)
// await db.bots.update(bot.id, { consecutive_failures: 0 });
```

---

## Monitoring & Observability

- **Logging**: Structured JSON to Railway native logs
- **Alerts**: Railway alerts on error rate > 5%
- **Health**: `GET /health` returns DB connectivity + Polymarket API reachability + Inngest status
- **Metrics**: Per-user trade volume, bot uptime (Supabase query)
- **Inngest Dashboard**: Built-in observability for execution history

---

## Security

| Layer | Implementation |
|-------|---------------|
| **In Transit** | TLS 1.3 for all API communication |
| **Auth** | Supabase Auth (Apple/Google OAuth), JWT validation |
| **Rate Limiting** | Elysia middleware: 100 req/min per user |
| **Paper Trading** | No sensitive credentials stored (Phase 2 only) |

**Note**: No credential encryption needed for paper-only MVP. See docs/live-trading-architecture.md for Phase 2 security requirements.

---

## Roadmap

### Phase 1: Paper Trading MVP (Current)
- ✅ 50 curated markets
- ✅ Paper trading with simulated execution
- ✅ End-of-day notifications
- ✅ RevenueCat subscriptions
- ✅ Cost controls ($0.50/$1 daily caps)

### Phase 2: Live Trading (Future)
- Credential management and encryption
- Real order execution on Polymarket
- KYC/AML compliance
- Regulatory licensing
- Enhanced security (see docs/live-trading-architecture.md)

### Phase 3: Scale
- Multiple bots per user
- AI-powered market discovery
- Historical backtesting
- Strategy marketplace

---

## Risks & Disclaimers (Shown Everywhere)

- **Paper Trading**: Results are simulated and do not guarantee live performance
- **No Live Trading**: This is a paper trading platform only
- **No Guarantees**: AI bots can and will lose simulated money
- **High Risk**: Prediction markets involve total loss possibility
- **Not Financial Advice**: Users trade at own risk

---

## Critical Bug Fixes Summary

### Fix 1: Consecutive Failures Reset Logic
**Problem**: Resetting on any "success" includes HOLD decisions
**Solution**: Only reset on EXECUTED trades (not HOLD or rejected)
**Location**: Step 7f of execution loop

### Fix 2: Idempotency (Proper Implementation)
**Problem**: execution_id generated after trade, vulnerable to network timeouts
**Solution**: Insert PENDING trade_log first, then update to EXECUTED
**Location**: Step 7 of execution loop

### Fix 3: Daily AI Cost Enforcement
**Problem**: Soft tracking mentioned but not implemented
**Solution**: Hard stop when daily_ai_cost_usd >= limit
**Location**: Step 1 of execution loop, Risk Rule 1

### Fix 4: Paper Balance Validation Timing
**Problem**: Risk validation happens before FOK simulation
**Solution**: Run FOK simulation first (Step 5), use results in validation (Step 6)
**Location**: Execution loop reordered

### Fix 5: Cost Tracking
**Problem**: No mechanism to track cumulative AI costs
**Solution**: Add `daily_ai_cost_usd` column with daily reset cron
**Location**: supabase-schema.md, bots table

---

## Files Reference

- **docs/markets.md**: 50 curated markets template
- **docs/supabase-schema.md**: Database schema with critical fixes
- **docs/live-trading-architecture.md**: Phase 2 architecture (not implemented)
- **docs-old/**: Reference documentation (keep for historical context)
