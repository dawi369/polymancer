# Polymancer Database Spec

This document defines the complete database schema for the MVP.

## Overview

- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (Apple, Google OAuth)
- **RLS**: Row-level security enabled on all tables

## Table: users

Primary user record linked to Supabase Auth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | pk | Supabase auth user ID |
| phone_e164 | text | unique | Normalized E.164 phone number (for trial gating) |
| phone_hash | text | | SHA-256 hash of phone for display |
| tier | text | default 'trial' | 'trial', 'paid' |
| trial_started_at | timestamptz | | When trial began |
| trial_ends_at | timestamptz | | When trial expires |
| timezone | text | default 'UTC' | User timezone for notifications |
| notifications_enabled | bool | default true | Push notification preference |
| telegram_linked_at | timestamptz | | When Telegram was linked |
| created_at | timestamptz | default now | |
| updated_at | timestamptz | default now | |

### Indexes
- `users(id)` - primary key
- `users(phone_e164)` - unique, for trial gating

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
| model_id | text | | LLM model to use |
| strategy_prompt | text | | Custom instructions for the bot |
| max_daily_loss_usd | numeric | default 100 | |
| max_position_size_usd | numeric | default 200 | |
| max_trades_per_day | int | default 10 | |
| slippage_threshold_percent | numeric | default 2 | |
| daily_ai_cost_usd | numeric | default 0 | Running total today |
| daily_ai_limit_usd | numeric | default 0.50 | |
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
- `bots(next_run_at)` - for worker polling

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
| claimed_by | text | | Worker instance ID |
| claimed_at | timestamptz | | When job was claimed |
| started_at | timestamptz | | When execution started |
| completed_at | timestamptz | | When execution finished |
| decision_window_started_at | timestamptz | | When 5-min window opened |
| decision_window_ends_at | timestamptz | | When 5-min window closes |
| input_params | jsonb | | Market IDs, research params |
| output_result | jsonb | | Final decision, positions, P&L |
| error_message | text | | Error if failed |
| retry_count | int | default 0 | Number of retries |
| idempotency_key | uuid | unique | For deduplication |
| created_at | timestamptz | default now | |

### Indexes
- `runs(id)` - primary key
- `runs(bot_id)` - for looking up bot history
- `runs(status, created_at desc)` - for admin queries
- `runs(idempotency_key)` - unique

### RLS
- Users can read their own runs
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
| ai_confidence | numeric | | Confidence from Polyseer |
| ai_reasoning | text | | Reasoning from Polyseer |
| rejection_reason | text | | Why rejected |
| error_message | text | | Error if failed |
| order_book_snapshot | jsonb | | Top 5 levels at decision time |
| idempotency_key | uuid | unique | For trade deduplication |
| created_at | timestamptz | default now | |

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
| updated_at | timestamptz | default now | |

### Indexes
- `positions(id)` - primary key
- `positions(bot_id, market_id, token)` - unique composite

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
| phone_hash | text | | Hash from Telegram |
| phone_last4 | text | | Last 4 digits |
| linked_at | timestamptz | | When linked |
| status | text | default 'pending' | 'pending', 'linked' |
| otp_code | text | | Current OTP (hashed) |
| otp_expires_at | timestamptz | | When OTP expires |

### Indexes
- `telegram_links(id)` - primary key
- `telegram_links(user_id)` - unique
- `telegram_links(telegram_user_id)` - unique

### RLS
- Users can read their own link
- Service role can read/write all

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

---

## Job Queue Pattern

The `runs` table serves as the job queue. Workers poll for due bots:

```sql
-- Worker picks up due bots
SELECT * FROM bots
WHERE status = 'active'
  AND next_run_at <= NOW()
ORDER BY next_run_at ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;

-- After claiming, create run record
INSERT INTO runs (bot_id, status, claimed_by, decision_window_started_at, decision_window_ends_at)
VALUES ($bot_id, 'claimed', $worker_id, NOW(), NOW() + interval '5 minutes');
```

After execution, update the bot's `next_run_at`:

```sql
UPDATE bots
SET next_run_at = NOW() + (run_interval_hours || ' hours')::interval,
    last_run_at = NOW(),
    last_run_status = $status
WHERE id = $bot_id;
```

---

## Cost Tracking

Cost is tracked per bot per day:

```sql
-- At start of new day (or via cron), reset daily cost
UPDATE bots
SET daily_ai_cost_usd = 0
WHERE DATE(last_run_at) != DATE(NOW());
```

---

## Idempotency

All trade executions use idempotency keys:

- Generated as UUID before execution
- Stored in `trade_logs.idempotency_key` (unique constraint)
- On retry, same key reuses previous result instead of creating duplicate
