# Polymancer Database Spec

This document defines the complete database schema for the MVP.

## Overview

- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (Apple, Google OAuth)
- **RLS**: Row-level security enabled on all tables
- **Time**: All timestamps stored in UTC; `users.timezone` is used for notification scheduling only
- **Retention**: indefinite

## Table: users

Primary user record linked to Supabase Auth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | Supabase auth user ID |
| phone_e164 | text | unique | Normalized E.164 phone number (for trial gating) |
| phone_hash | text | | SHA-256 hash of phone for display |
| tier | text | default 'trial' | 'trial', 'paid' |
| revenuecat_app_user_id | text | unique | RevenueCat app user ID |
| entitlement_status | text | default 'inactive' | 'active', 'trialing', 'expired', 'canceled' |
| entitlement_expires_at | timestamptz | | When paid entitlement expires |
| entitlement_product_id | text | | Active product SKU |
| trial_started_at | timestamptz | | When trial began |
| trial_ends_at | timestamptz | | When trial expires |
| timezone | text | default 'UTC' | User timezone for notifications |
| notifications_enabled | bool | default true | Push notification preference |
| telegram_linked_at | timestamptz | | When Telegram was linked |
| deleted_at | timestamptz | nullable | Soft delete timestamp |
| created_at | timestamptz | default now | |
| updated_at | timestamptz | default now | |

### Indexes
- `users(id)` - primary key
- `users(phone_e164)` - unique, for trial gating
- `users(revenuecat_app_user_id)` - unique
- `users(deleted_at)` - for querying active users

### RLS
- Users can read/update their own row
- Service role can read/write all

---

## Table: bots

One bot per user. Contains configuration and scheduling.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| user_id | uuid | unique, fk -> users.id | |
| status | text | default 'paused' | 'active', 'paused', 'error' |
| strategy_prompt | text | | Custom instructions for the bot |
| max_daily_loss_usd | numeric | default 100 | |
| max_position_size_usd | numeric | default 200 | |
| max_trades_per_day | int | default 10 | |
| slippage_threshold_percent | numeric | default 2 | |
| daily_ai_cost_usd | numeric | default 0 | Running total today |
| daily_ai_limit_usd | numeric | default 0.50 | Daily AI budget cap |
| daily_cost_reset_at | timestamptz | | Last time daily cost was reset |
| next_run_at | timestamptz | | When bot is next due |
| run_interval_hours | int | default 4 | How often to run |
| decision_window_seconds | int | default 300 | 5-minute decision window |
| last_run_at | timestamptz | | Last run timestamp |
| last_run_status | text | | 'success', 'failed', 'partial' |
| created_at | timestamptz | default now | |
| updated_at | timestamptz | default now | |

### Indexes
- `bots(id)` - primary key
- `bots(user_id)` - unique
- `bots(next_run_at)` - for scheduler polling

### RLS
- Users can read/update their own bot
- Service role can read/write all

---

## Table: runs

Job queue for bot executions. Workers claim due jobs with `FOR UPDATE SKIP LOCKED`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| status | text | default 'pending' | 'pending', 'claimed', 'running', 'completed', 'failed' |
| run_type | text | default 'scheduled' | 'scheduled', 'reactive', 'user' |
| scheduled_for | timestamptz | | When run is eligible |
| claimed_by | text | | Worker instance ID |
| claimed_at | timestamptz | | When job was claimed |
| started_at | timestamptz | | When execution started |
| completed_at | timestamptz | | When execution finished |
| decision_window_started_at | timestamptz | | When 5-min window opened |
| decision_window_ends_at | timestamptz | | When 5-min window closes |
| input_params | jsonb | | Market IDs, research params, top news article refs (title/url) |
| output_result | jsonb | | Final decision, positions, P&L, forecast card/audit |
| error_message | text | | Error if failed |
| retry_count | int | default 0 | Number of retries |
| idempotency_key | uuid | unique | For deduplication |
| created_at | timestamptz | default now | |

### Indexes
- `runs(id)` - primary key
- `runs(bot_id)` - for looking up bot history
- `runs(status, scheduled_for asc)` - for worker polling
- `runs(idempotency_key)` - unique

### RLS
- Users can read their own runs
- Service role can read/write all

---

## Table: signal_events

Reactive trigger events used for deduping and audit.

For news triggers, detailed article refs live in `runs.input_params`; signal events keep only score/reason metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| signal_type | text | | 'news', 'price', 'liquidity', 'volume' |
| score | numeric | | Trigger score |
| reason | varchar(500) | | Short reason (max 500 chars) |
| window_start | timestamptz | | Window start (UTC) |
| window_end | timestamptz | | Window end (UTC) |
| status | text | default 'new' | 'new', 'queued', 'ignored' |
| run_id | uuid | fk -> runs.id | nullable |
| created_at | timestamptz | default now | |

### Indexes
- `signal_events(id)` - primary key
- `signal_events(bot_id, created_at desc)` - for diagnostics
- `signal_events(bot_id, signal_type, window_start)` - unique, dedupe within window

### RLS
- Users can read their own signal events
- Service role can read/write all

---

## Table: trade_logs

Every trading decision (including HOLD and REJECTED).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| run_id | uuid | fk -> runs.id | |
| bot_id | uuid | fk -> bots.id | |
| action | text | | 'buy', 'sell', 'hold', 'rejected' |
| execution_status | text | default 'pending' | 'pending', 'executed', 'failed' |
| market_id | text | | Market ID from pmxt |
| token | text | | 'yes' or 'no' |
| size_usd | numeric | | Order size in USD |
| size_shares | numeric | | Order size in shares |
| execution_price | numeric | | Actual fill price |
| slippage_percent | numeric | | Slippage vs best price |
| fee_usd | numeric | | Fees paid |
| ai_confidence | numeric | | Derived confidence score from Polyseer forecast card |
| ai_reasoning | text | | Reasoning from Polyseer |
| rejection_reason | text | | Why rejected |
| error_message | text | | Error if failed |
| order_book_snapshot | jsonb | | Top 5 levels at decision time |
| idempotency_key | uuid | unique | For trade deduplication |
| created_at | timestamptz | default now | |

### Trade Statement (WIP)

Each trade should include a short statement (stored in `trade_notes`) with:
- why
- timeframe
- influencers
- watchouts

### Indexes
- `trade_logs(id)` - primary key
- `trade_logs(bot_id, created_at desc)` - for history queries
- `trade_logs(run_id)` - for linking to runs
- `trade_logs(idempotency_key)` - unique

### RLS
- Users can read their own trade logs
- Service role can read/write all

---

## Table: positions

Current paper holdings per market.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| market_id | text | | Market ID from pmxt |
| token | text | | 'yes' or 'no' |
| total_shares | numeric | | Number of shares held |
| average_entry_price | numeric | | Weighted average entry |
| closed_at | timestamptz | nullable | Set when position reaches zero shares |
| updated_at | timestamptz | default now | |

### Indexes
- `positions(id)` - primary key
- `positions(bot_id, market_id, token)` - unique composite

### Atomic Position Updates

Use atomic SQL updates with row-level locking:

```sql
-- Update position with locking
UPDATE positions
SET 
  total_shares = total_shares + $new_shares,
  average_entry_price = 
    CASE 
      WHEN total_shares + $new_shares = 0 THEN 0
      ELSE ((total_shares * average_entry_price) + ($new_shares * $price)) / (total_shares + $new_shares)
    END,
  closed_at = CASE WHEN total_shares + $new_shares = 0 THEN NOW() ELSE NULL END,
  updated_at = NOW()
WHERE id = $position_id
RETURNING *;
```

### RLS
- Users can read their own positions
- Service role can read/write all

---

## Table: paper_sessions

Paper balance resets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| starting_balance_usd | numeric | | Balance at session start |
| current_balance_usd | numeric | | Current balance within session |
| ended_balance_usd | numeric | | Balance at session end |
| started_at | timestamptz | | Session start |
| ended_at | timestamptz | nullable | Session end |
| reset_reason | text | | 'user_reset', 'daily_loss' |

### Indexes
- `paper_sessions(id)` - primary key
- `paper_sessions(bot_id)` - for history

### RLS
- Users can read their own sessions
- Service role can read/write all

One active session per bot: the row with `ended_at` null.

---

## Table: bot_failures

AI or execution failures for diagnostics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| run_id | uuid | fk -> runs.id | nullable |
| error_type | text | | 'ai_failure', 'execution_failure', 'rate_limit', 'external_api' |
| error_message | text | | Error details |
| context | jsonb | | Additional context |
| created_at | timestamptz | default now | |

### Indexes
- `bot_failures(id)` - primary key
- `bot_failures(bot_id, created_at desc)` - for diagnostics

### RLS
- Users can read their own failures
- Service role can read/write all

---

## Table: telegram_links

Telegram account linking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| user_id | uuid | fk -> users.id, unique | |
| telegram_user_id | text | unique | Telegram user ID |
| phone_e164 | text | unique | Phone from Telegram Contact (E.164) |
| phone_hash | text | | Hash of phone for display |
| linked_at | timestamptz | | When linked |
| status | text | default 'pending' | 'pending', 'linked' |
| link_token | text | unique | One-time token for deep link (hashed, expires 10 min) |
| link_expires_at | timestamptz | | When link token expires |

### Indexes
- `telegram_links(id)` - primary key
- `telegram_links(user_id)` - unique
- `telegram_links(telegram_user_id)` - unique
- `telegram_links(link_token)` - unique, for deep link lookups
- `telegram_links(phone_e164)` - unique, for trial gating

### RLS
- Users can read their own link
- Service role can read/write all

---

## Table: chat_messages

Telegram chat history (rolling retention).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| user_id | uuid | fk -> users.id | |
| bot_id | uuid | fk -> bots.id | |
| channel | text | default 'telegram' | Message source |
| direction | text | | 'user', 'assistant', 'system' |
| message_text | text | | Message content |
| metadata | jsonb | | Message IDs, reply references |
| created_at | timestamptz | default now | |

### Indexes
- `chat_messages(id)` - primary key
- `chat_messages(user_id, created_at desc)` - for history

### RLS
- Users can read their own messages
- Service role can read/write all

Retention: keep 90 days, purge older rows via cron job.

**Soft Delete Pattern:**
Users table uses `deleted_at` for soft deletes. On account closure:
- Set `users.deleted_at = NOW()`
- Bot continues running until trial expires (if active)
- Telegram link preserved for audit trail
- Data retained indefinitely (compliance)

---

## Table: trade_notes

Per-trade notes that explain rationale and watchouts (predictable format).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| trade_log_id | uuid | fk -> trade_logs.id | |
| bot_id | uuid | fk -> bots.id | |
| note_text | text | | Note content |
| created_at | timestamptz | default now | |
| deleted_at | timestamptz | nullable | Soft delete when position closes |

### Indexes
- `trade_notes(id)` - primary key
- `trade_notes(bot_id, created_at desc)` - for daily summaries
- `trade_notes(trade_log_id)` - for linking to trades

### RLS
- Users can read their own notes
- Service role can read/write all

Retention: soft delete when related position closes.

---

## Table: daily_summaries

Cached daily summary for notifications (denormalized).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| date | date | | Summary date |
| summary_text | text | | Generated summary |
| pnl_change_usd | numeric | | P&L for the day |
| trades_count | int | | Number of trades |
| positions_count | int | | Open positions |
| generated_at | timestamptz | | When generated |

### Indexes
- `daily_summaries(id)` - primary key
- `daily_summaries(bot_id, date)` - unique

### RLS
- Users can read their own summaries
- Service role can read/write all

Retention: keep indefinitely.

---

## Table: global_settings

Global operational settings (kill switch, maintenance mode, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| key | text | unique | Setting name |
| value | jsonb | | Setting value |
| updated_at | timestamptz | default now | |

### Settings
- `kill_switch_enabled` (boolean) - When true, all trading pauses

### Indexes
- `global_settings(id)` - primary key
- `global_settings(key)` - unique

### RLS
- Service role can read/write
- Users cannot access

---

## Table: processed_webhooks

RevenueCat webhook idempotency tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| event_id | varchar(255) | pk | RevenueCat event.id |
| processed_at | timestamptz | default now | When processed |

### Indexes
- `processed_webhooks(event_id)` - primary key

### RLS
- Service role can read/write
- Users cannot access

---

## Table: tier_model_defaults

Default models per tier and context.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| tier | text | | 'trial', 'paid' |
| context | text | | 'messaging', 'research', 'trading', 'summarization' |
| model_id | text | | Default model ID |
| fallback_model_id | text | | Fallback model if primary fails |
| created_at | timestamptz | default now | |

**Defaults (OpenRouter model IDs):**
| tier | context | model_id | fallback_model_id |
|------|---------|----------|------------------|
| trial | messaging | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| trial | research | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| trial | trading | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| trial | summarization | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| paid | messaging | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| paid | research | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| paid | trading | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |
| paid | summarization | minimax/minimax-m2.5 | deepseek/deepseek-v3.2 |

### Indexes
- `tier_model_defaults(tier, context)` - unique

---

## Table: bot_model_configs

User overrides for specific contexts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | |
| bot_id | uuid | fk -> bots.id | |
| context | text | | 'messaging', 'research', 'trading', 'summarization' |
| model_id | text | | User-selected model |
| fallback_model_id | text | nullable | Override fallback |
| created_at | timestamptz | default now | |

### Indexes
- `bot_model_configs(bot_id, context)` - unique

### RLS
- Users can read/update their own bot configs
- Service role can read/write all

---

## Job Queue Pattern

The `runs` table serves as the job queue. A scheduler enqueues scheduled runs based on `bots.next_run_at`.

```sql
-- Scheduler enqueues scheduled runs
INSERT INTO runs (bot_id, run_type, status, scheduled_for, idempotency_key)
SELECT id, 'scheduled', 'pending', next_run_at, gen_random_uuid()
FROM bots
WHERE status = 'active'
  AND next_run_at <= NOW();

-- Worker picks up due runs
SELECT * FROM runs
WHERE status = 'pending'
  AND scheduled_for <= NOW()
ORDER BY scheduled_for ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;
```

After execution of a scheduled run, update the bot's `next_run_at`:

```sql
UPDATE bots
SET next_run_at = NOW() + (run_interval_hours || ' hours')::interval,
    last_run_at = NOW(),
    last_run_status = $status
WHERE id = $bot_id;
```

---

## Cost Tracking

Cost is tracked per bot per day with idempotent resets to avoid race conditions:

**Required column:**
Add `daily_cost_reset_at` (timestamptz) to `bots` table.

**Worker logic at start of each run:**
```typescript
const startOfToday = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
if (!bot.daily_cost_reset_at || bot.daily_cost_reset_at < startOfToday) {
  await db.bots.update(bot.id, {
    daily_ai_cost_usd: 0,
    daily_cost_reset_at: new Date()
  });
}
```

This ensures:
- Correct reset even if bot was paused for multiple days
- No race conditions from `last_run_at` comparisons
- Idempotent (safe to run multiple times per day)

---

## Idempotency

All trade executions use idempotency keys:

- **Worker generates UUID** immediately before execution
- Stored in `trade_logs.idempotency_key` (unique constraint prevents duplicates)
- On retry, same key reuses previous result instead of creating duplicate
- Idempotency window: 24 hours (keys older than 24h can be cleaned up)
