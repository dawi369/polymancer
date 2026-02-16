# Supabase Database Schema

**Purpose**: The authoritative financial ledger and configuration state for Open Trade.
**Paradigm**: Relational (PostgreSQL), strict ACID compliance, Row Level Security (RLS) enforced.

## Entity Relationship Summary

- A `User` has many `ApiCredentials` and `Bots`.
- A `Bot` has many `TradeLogs`.
- A `User` has many `Positions` (aggregated state).

## Tables

### 1. `users`

Core user accounts linked to Supabase Auth.

- `id` (uuid, primary key) - Matches `auth.uid()`
- `tier` (enum) - `['free', 'basic', 'pro']` (Default: `free`)
- `created_at` (timestamp, default `now()`)

### 2. `api_credentials`

Stores encrypted Polymarket L2 API credentials **and the private key** (required for EIP-712 order signing in custodial mode).  
All fields encrypted via Supabase Vault / PGCrypto.  
Decrypted **in-memory only** during execution; never sent to client.

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key -> `users.id`)
- `api_key` (text, encrypted via Supabase Vault)
- `api_secret` (text, encrypted via Supabase Vault)
- `passphrase` (text, encrypted via Supabase Vault)
- `created_at` (timestamp, default `now()`)
- `private_key` (text, -- encrypted)

### 3. `bots`

The configuration and safety rules for the AI agents.

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key -> `users.id`)
- `name` (text) - User-defined bot name (default: 'Untitled Bot')
- `status` (enum) - `['paper', 'live', 'paused', 'paused:ai_unavailable', 'error']`
- `strategy_prompt` (text) - The natural language instruction.
- `model_id` (text) - e.g., `anthropic/claude-3.5-sonnet`
- `max_daily_loss_usd` (numeric) - Hard limit constraint.
- `max_position_size_usd` (numeric) - Hard limit constraint.
- `allowed_categories` (text[]) - e.g., `['politics', 'crypto']`
- `slippage_threshold_percent` (numeric) - Maximum acceptable slippage (default: 2.0)
- `max_trades_per_day` (integer) - Trade frequency limit (default: 10)
- `ai_failure_retry_minutes` (integer) - Retry interval when AI unavailable (default: 10)
- `risk_budget_usd` (numeric) - Isolated risk budget for this bot (NULL = use user default)
- `risk_budget_type` (enum) - `['individual', 'shared']` (default: 'individual')
- `bot_group_id` (uuid) - For bot clusters that work together (future feature)
- `priority` (integer) - Execution order within user (default: 0)
- `max_concurrent_markets` (integer) - Limit simultaneous positions (default: 1)
- `last_run_at` (timestamp) - Updated by Inngest after every successful evaluation loop to populate the UI dashboard.
- `created_at` (timestamp, default `now()`)
- `recipe_json` (jsonb) - the parsed/structured workflow (steps, tools, parameters)
- `polling_frequency_minutes` (integer) - e.g. 5 for Pro, 30 for Basic — derived from tier or override
- `max_daily_llm_cost_usd` (numeric) - per-user hard cap to prevent runaway frontier model usage

### 4. `trade_logs`

Immutable ledger of every action taken by the AI.

- `id` (uuid, primary key)
- `bot_id` (uuid, foreign key -> `bots.id`)
- `market_id` (text) - Polymarket specific condition ID.
- `type` (enum) - `['paper', 'live']`
- `action` (enum) - `['buy', 'sell']`
- `size` (numeric) - Number of shares.
- `execution_price` (numeric) - Actual fill price (or simulated slippage price).
- `ai_reasoning` (text) - The exact rationale returned by the LLM.
- `created_at` (timestamp, default `now()`)
- `recipe_snapshot` (jsonb) - The exact recipe used for this trade (frozen copy)

### 5. `positions`

Real-time materialized view of a user's holdings. Updated via WebSocket triggers.

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key -> `users.id`)
- `market_id` (text)
- `type` (enum) - `['paper', 'live']`
- `total_shares` (numeric)
- `average_entry_price` (numeric)
- `updated_at` (timestamp)
- `correlated_markets` (text[]) - array of related market_ids (for hedging rules)

### 6. `bot_failures` (Memory: adaptations from past mistakes)

- `id` (uuid, primary key)
- `bot_id` (uuid, foreign key → bots.id)
- `error_type` (enum: ['slippage', 'liquidity_kill', 'rule_violation', 'api_error', 'gas_spike', 'other'])
- `market_id` (text)
- `adaptation_note` (text) — e.g. "Reduce max size by 50% in markets with < $50k liquidity"
- `created_at` (timestamp, default now())

### 7. `bot_context` (Long-term & session memory)

- `id` (uuid, primary key)
- `bot_id` (uuid, foreign key → bots.id)
- `context_json` jsonb — flexible key-value store for lessons, e.g.
  {
  "successful_strategies": ["arbitrage on correlated outcomes"],
  "avoid_patterns": ["thin election markets after 8PM UTC"],
  "cumulative_pnl": 1245.67,
  "last_adaptation": "2026-02-10: increased retry count after FOK kill"
  }
- `updated_at` (timestamp)

### 8. `bot_coordination_locks` (Prevents race conditions between multiple bots)

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key → users.id)
- `market_id` (text) - Polymarket condition ID being traded
- `locked_by_bot_id` (uuid, foreign key → bots.id)
- `locked_at` (timestamp)
- `expires_at` (timestamp) - Auto-release if bot crashes or hangs

### 9. `user_risk_profiles` (User-level risk defaults for multi-bot support)

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key → users.id, unique)
- `default_daily_loss_usd` (numeric) - Default daily loss limit (default: 100.00)
- `default_position_size_usd` (numeric) - Default position size limit (default: 500.00)
- `default_slippage_threshold_percent` (numeric) - Default slippage tolerance (default: 2.0)
- `global_risk_budget_usd` (numeric) - Total risk budget across all user bots (NULL = unlimited)
- `created_at` (timestamp, default `now()`)
- `updated_at` (timestamp, default `now()`)

## Row Level Security (RLS) Policies

- **Users**: Can only `SELECT` and `UPDATE` their own row where `id = auth.uid()`.
- **ApiCredentials**: UI can `INSERT`, Backend Service Role can `SELECT`. Users cannot `SELECT` their own decrypted keys back to the frontend.
- **Bots/Logs/Positions/BotContext**: Users can `SELECT`, `INSERT`, `UPDATE` where `user_id = auth.uid()` (or `bot_id` → bot → user_id).
- **BotCoordinationLocks**: Backend Service Role only. Users cannot directly access locks.
- **UserRiskProfiles**: Users can `SELECT` and `UPDATE` their own profile where `user_id = auth.uid()`.
