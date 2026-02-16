# Supabase Database Schema (Paper Trading MVP)

**Purpose**: Authoritative ledger for Polymancer Paper Trading MVP  
**Paradigm**: Relational (PostgreSQL), strict ACID, Row Level Security (RLS) enforced  
**Tables**: 6 tables  
**Note**: See docs/live-trading-architecture.md for Phase 2 schema additions

---

## Tables

### 1. `users`

Core user accounts linked to Supabase Auth.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PRIMARY KEY | Matches `auth.uid()` |
| `email` | text | UNIQUE, NOT NULL | From OAuth provider |
| `tier` | enum | DEFAULT 'free' | 'free', 'pro' |
| `timezone` | text | DEFAULT 'UTC' | For 9am daily summary |
| `expo_push_token` | text | NULLABLE | For push notifications |
| `notifications_enabled` | boolean | DEFAULT true | Non-critical notifications toggle |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**RLS Policy**: Users can only SELECT/UPDATE their own row where `id = auth.uid()`

**Trigger**: Auto-create row on `auth.users` insert:
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, timezone)
  VALUES (NEW.id, NEW.email, 'UTC');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

### 2. `api_credentials`

**PHASE 2 ONLY** - Not used in Paper Trading MVP.

Encrypted Polymarket L2 API credentials + private key (for future live trading).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PRIMARY KEY | |
| `user_id` | uuid | FK → users.id, UNIQUE | One credential per user |
| `api_key` | text | ENCRYPTED | Supabase Vault |
| `api_secret` | text | ENCRYPTED | Supabase Vault |
| `passphrase` | text | ENCRYPTED | Supabase Vault |
| `private_key` | text | ENCRYPTED | Supabase Vault |
| `is_active` | boolean | DEFAULT true | Can be revoked |
| `created_at` | timestamptz | DEFAULT now() | |
| `last_used_at` | timestamptz | NULLABLE | |

**Status**: Table exists for forward compatibility. No RLS policies needed for MVP.

---

### 3. `bots`

Bot configuration and paper trading state. **One bot per user for MVP**.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PRIMARY KEY | |
| `user_id` | uuid | FK → users.id, UNIQUE | One bot per user |
| `name` | text | NOT NULL | User-defined name |
| `status` | enum | DEFAULT 'paper' | 'paper', 'paused' |
| `strategy_prompt` | text | NOT NULL | Natural language instructions |
| `model_id` | text | NOT NULL | OpenRouter model ID |
| `max_daily_loss_usd` | numeric | NOT NULL, CHECK > 0 | Hard limit |
| `max_position_size_usd` | numeric | NOT NULL, CHECK > 0 | Hard limit |
| `allowed_categories` | text[] | NOT NULL | e.g., ['politics', 'crypto'] |
| `slippage_threshold_percent` | numeric | DEFAULT 2.0, CHECK > 0 | Max slippage tolerance |
| `max_trades_per_day` | integer | DEFAULT 10, CHECK > 0 | Frequency limit |
| `polling_frequency_minutes` | integer | NOT NULL | 240 (free) or 120 (pro) |
| `paper_balance_initial_usd` | numeric | NOT NULL, DEFAULT 10000 | Starting balance |
| `paper_balance_usd` | numeric | NOT NULL, DEFAULT 10000 | Current balance |
| `daily_ai_cost_usd` | numeric | DEFAULT 0 | Today's AI spend |
| `daily_ai_cost_reset_at` | timestamptz | DEFAULT now() | Last reset timestamp |
| `daily_ai_limit_usd` | numeric | NOT NULL | 0.50 (free) or 1.00 (pro) |
| `consecutive_failures` | integer | DEFAULT 0 | Track AI/execution failures |
| `last_run_at` | timestamptz | NULLABLE | Last execution cycle |
| `last_run_status` | enum | NULLABLE | 'success', 'failure', 'skipped' |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**Constraints**:
```sql
ALTER TABLE bots ADD CONSTRAINT check_valid_polling 
  CHECK (polling_frequency_minutes IN (120, 240));

ALTER TABLE bots ADD CONSTRAINT check_positive_balance
  CHECK (paper_balance_usd >= 0);

ALTER TABLE bots ADD CONSTRAINT check_valid_ai_limit
  CHECK (daily_ai_limit_usd IN (0.50, 1.00));
```

**RLS Policy**: Users can SELECT/UPDATE their own bot (via `user_id = auth.uid()`)

---

### 4. `trade_logs`

Immutable ledger of every AI decision and paper trade execution.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PRIMARY KEY | |
| `execution_id` | uuid | NOT NULL, UNIQUE | Idempotency key |
| `execution_status` | enum | DEFAULT 'pending' | 'pending', 'executed', 'failed' |
| `bot_id` | uuid | FK → bots.id | |
| `market_id` | text | NOT NULL | Polymarket condition ID |
| `market_question` | text | NULLABLE | Denormalized for display |
| `token` | enum | NULLABLE | 'yes', 'no' |
| `action` | enum | NOT NULL | 'buy', 'sell', 'hold', 'rejected' |
| `size_usd` | numeric | NULLABLE | AI-requested dollar amount |
| `size` | numeric | NULLABLE | Actual shares filled |
| `execution_price` | numeric | NULLABLE | Weighted avg fill price |
| `slippage_percent` | numeric | NULLABLE | Calculated slippage |
| `fee_usd` | numeric | NOT NULL, DEFAULT 0 | Taker fee |
| `realized_pnl_usd` | numeric | NULLABLE | Realized P&L for sells |
| `ai_reasoning` | text | NOT NULL | AI explanation |
| `ai_confidence` | numeric | NULLABLE | 0-1 scale |
| `rejection_reason` | text | NULLABLE | Why trade was rejected |
| `error_message` | text | NULLABLE | If execution failed |
| `order_book_snapshot` | jsonb | NULLABLE | Top 5 bid/ask levels |
| `created_at` | timestamptz | DEFAULT now() | |

**Indexes**:
```sql
CREATE INDEX idx_trade_logs_bot_created ON trade_logs(bot_id, created_at DESC);
CREATE UNIQUE INDEX idx_trade_logs_execution ON trade_logs(execution_id);
CREATE INDEX idx_trade_logs_created_date ON trade_logs(created_at);
CREATE INDEX idx_trade_logs_bot_today ON trade_logs(bot_id, created_at)
  WHERE action IN ('buy', 'sell');
```

**RLS Policy**: Users can SELECT where `bot_id` → `bots.user_id = auth.uid()`. INSERT/UPDATE backend only.

---

### 5. `positions`

Current paper holdings per bot per market.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PRIMARY KEY | |
| `bot_id` | uuid | FK → bots.id | |
| `market_id` | text | NOT NULL | Polymarket condition ID |
| `token` | enum | NOT NULL | 'yes', 'no' |
| `total_shares` | numeric | DEFAULT 0, CHECK >= 0 | Current position size |
| `average_entry_price` | numeric | NULLABLE | Weighted avg entry (buys only) |
| `last_trade_at` | timestamptz | NULLABLE | Last activity |
| `updated_at` | timestamptz | DEFAULT now() | |

**Indexes**:
```sql
CREATE INDEX idx_positions_bot ON positions(bot_id);
CREATE UNIQUE INDEX idx_positions_bot_market ON positions(bot_id, market_id, token);
```

**RLS Policy**: Users can SELECT where `bot_id` → `bots.user_id = auth.uid()`. INSERT/UPDATE backend only.

---

### 6. `market_cache`

Cache of Polymarket market data for the 50 curated markets.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `market_id` | text | PRIMARY KEY | Polymarket condition ID |
| `question` | text | NOT NULL | Human-readable question |
| `slug` | text | NULLABLE | URL slug |
| `tags` | text[] | NULLABLE | Polymarket tags |
| `outcome_prices` | jsonb | NOT NULL | `{"yes": 0.65, "no": 0.35}` |
| `volume_24h` | numeric | NULLABLE | 24h volume |
| `order_book` | jsonb | NULLABLE | Top 5 bid/ask levels |
| `fetched_at` | timestamptz | NOT NULL, DEFAULT now() | |

**RLS Policy**: No user access (backend service role only)

---

## Helper Functions

### Calculate Today's Realized P&L

```sql
CREATE OR REPLACE FUNCTION get_bot_today_pnl(p_bot_id uuid)
RETURNS numeric AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(realized_pnl_usd)
     FROM trade_logs
     WHERE bot_id = p_bot_id
       AND created_at >= CURRENT_DATE
       AND action = 'sell'
       AND realized_pnl_usd IS NOT NULL),
    0
  );
END;
$$ LANGUAGE plpgsql STABLE;
```

### Count Today's Trades

```sql
CREATE OR REPLACE FUNCTION get_bot_trades_today(p_bot_id uuid)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM trade_logs
    WHERE bot_id = p_bot_id
      AND created_at >= CURRENT_DATE
      AND action IN ('buy', 'sell')
  );
END;
$$ LANGUAGE plpgsql STABLE;
```

### Check and Update Daily AI Cost (Atomic)

```sql
CREATE OR REPLACE FUNCTION check_and_update_ai_cost(
  p_bot_id uuid,
  p_cost_increment numeric
)
RETURNS boolean AS $$
DECLARE
  v_current_cost numeric;
  v_limit numeric;
  v_reset_at timestamptz;
BEGIN
  -- Get current values
  SELECT daily_ai_cost_usd, daily_ai_limit_usd, daily_ai_cost_reset_at
  INTO v_current_cost, v_limit, v_reset_at
  FROM bots WHERE id = p_bot_id;
  
  -- Check if we need to reset (new day)
  IF v_reset_at < CURRENT_DATE THEN
    v_current_cost := 0;
  END IF;
  
  -- Check if adding this cost would exceed limit
  IF (v_current_cost + p_cost_increment) > v_limit THEN
    RETURN false; -- Would exceed limit
  END IF;
  
  -- Atomically update the cost
  UPDATE bots SET
    daily_ai_cost_usd = daily_ai_cost_usd + p_cost_increment,
    daily_ai_cost_reset_at = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_bot_id;
  
  RETURN true; -- Successfully updated
END;
$$ LANGUAGE plpgsql;
```

### Reset Daily AI Costs (Cron Job)

```sql
CREATE OR REPLACE FUNCTION reset_daily_ai_costs()
RETURNS void AS $$
BEGIN
  UPDATE bots SET
    daily_ai_cost_usd = 0,
    daily_ai_cost_reset_at = CURRENT_DATE,
    updated_at = now()
  WHERE daily_ai_cost_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
```

---

## Triggers

### Update Positions After Trade (CRITICAL FIX)

**Correctly handles buys and sells**:
- **BUY**: Increases shares, recalculates weighted average entry price
- **SELL**: Decreases shares, keeps average entry price UNCHANGED
- **Position closed**: Deletes row when shares reach 0

```sql
CREATE OR REPLACE FUNCTION update_position_after_trade()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_shares numeric;
  v_existing_avg numeric;
  v_new_shares numeric;
  v_new_avg numeric;
BEGIN
  -- Only process actual trades
  IF NEW.action NOT IN ('buy', 'sell') THEN
    RETURN NEW;
  END IF;

  -- Get existing position (if any)
  SELECT total_shares, average_entry_price
  INTO v_existing_shares, v_existing_avg
  FROM positions
  WHERE bot_id = NEW.bot_id
    AND market_id = NEW.market_id
    AND token = NEW.token;

  IF NOT FOUND THEN
    v_existing_shares := 0;
    v_existing_avg := 0;
  END IF;

  IF NEW.action = 'buy' THEN
    -- BUY: increase shares, recalculate weighted average entry price
    v_new_shares := v_existing_shares + NEW.size;
    IF v_new_shares > 0 THEN
      v_new_avg := (v_existing_avg * v_existing_shares + NEW.execution_price * NEW.size) / v_new_shares;
    ELSE
      v_new_avg := NEW.execution_price;
    END IF;

    INSERT INTO positions (id, bot_id, market_id, token, total_shares, average_entry_price, last_trade_at)
    VALUES (gen_random_uuid(), NEW.bot_id, NEW.market_id, NEW.token, v_new_shares, v_new_avg, NEW.created_at)
    ON CONFLICT (bot_id, market_id, token)
    DO UPDATE SET
      total_shares = v_new_shares,
      average_entry_price = v_new_avg,
      last_trade_at = NEW.created_at,
      updated_at = now();

  ELSIF NEW.action = 'sell' THEN
    -- SELL: decrease shares, keep average entry price UNCHANGED
    v_new_shares := v_existing_shares - NEW.size;

    IF v_new_shares <= 0 THEN
      -- Position fully closed: delete the row
      DELETE FROM positions
      WHERE bot_id = NEW.bot_id
        AND market_id = NEW.market_id
        AND token = NEW.token;
    ELSE
      -- Position partially closed: reduce shares only
      UPDATE positions SET
        total_shares = v_new_shares,
        last_trade_at = NEW.created_at,
        updated_at = now()
      WHERE bot_id = NEW.bot_id
        AND market_id = NEW.market_id
        AND token = NEW.token;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_positions
AFTER INSERT ON trade_logs
FOR EACH ROW
EXECUTE FUNCTION update_position_after_trade();
```

### Update Paper Balance After Trade

```sql
CREATE OR REPLACE FUNCTION update_paper_balance_after_trade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action NOT IN ('buy', 'sell') THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'buy' THEN
    -- Deduct cost + fees from paper balance
    UPDATE bots SET
      paper_balance_usd = paper_balance_usd - COALESCE(NEW.size_usd, 0) - COALESCE(NEW.fee_usd, 0),
      updated_at = now()
    WHERE id = NEW.bot_id;

  ELSIF NEW.action = 'sell' THEN
    -- Credit proceeds minus fees to paper balance
    UPDATE bots SET
      paper_balance_usd = paper_balance_usd + (COALESCE(NEW.size, 0) * COALESCE(NEW.execution_price, 0)) - COALESCE(NEW.fee_usd, 0),
      updated_at = now()
    WHERE id = NEW.bot_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_paper_balance
AFTER INSERT ON trade_logs
FOR EACH ROW
EXECUTE FUNCTION update_paper_balance_after_trade();
```

---

## RLS Policies Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| users | Own row | Auto (trigger) | Own row | - |
| api_credentials | - | - | - | - |
| bots | Own bot | Own bot | Own bot | - |
| trade_logs | Own trades | Backend only | - | - |
| positions | Own positions | Backend only | Backend only | Backend only |
| market_cache | Backend only | Backend only | Backend only | Backend only |

---

## Constraints & Validation

```sql
-- Users
ALTER TABLE users ADD CONSTRAINT check_valid_tier 
  CHECK (tier IN ('free', 'pro'));

-- Bots
ALTER TABLE bots ADD CONSTRAINT check_positive_loss 
  CHECK (max_daily_loss_usd > 0);

ALTER TABLE bots ADD CONSTRAINT check_positive_position 
  CHECK (max_position_size_usd > 0);

ALTER TABLE bots ADD CONSTRAINT check_positive_slippage
  CHECK (slippage_threshold_percent > 0);

ALTER TABLE bots ADD CONSTRAINT check_positive_trades
  CHECK (max_trades_per_day > 0);

ALTER TABLE bots ADD CONSTRAINT check_valid_polling
  CHECK (polling_frequency_minutes IN (120, 240));

ALTER TABLE bots ADD CONSTRAINT check_non_negative_balance
  CHECK (paper_balance_usd >= 0);

ALTER TABLE bots ADD CONSTRAINT check_valid_ai_limit
  CHECK (daily_ai_limit_usd IN (0.50, 1.00));

-- Trade logs
ALTER TABLE trade_logs ADD CONSTRAINT check_non_negative_size
  CHECK (size IS NULL OR size >= 0);

ALTER TABLE trade_logs ADD CONSTRAINT check_non_negative_size_usd
  CHECK (size_usd IS NULL OR size_usd >= 0);

ALTER TABLE trade_logs ADD CONSTRAINT check_non_negative_fee
  CHECK (fee_usd >= 0);

ALTER TABLE trade_logs ADD CONSTRAINT check_valid_confidence
  CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));

-- Positions
ALTER TABLE positions ADD CONSTRAINT check_non_negative_shares
  CHECK (total_shares >= 0);
```

---

## Enums

```sql
CREATE TYPE user_tier AS ENUM ('free', 'pro');
CREATE TYPE bot_status AS ENUM ('paper', 'paused');
CREATE TYPE trade_action AS ENUM ('buy', 'sell', 'hold', 'rejected');
CREATE TYPE execution_status AS ENUM ('pending', 'executed', 'failed');
CREATE TYPE outcome_token AS ENUM ('yes', 'no');
CREATE TYPE run_status AS ENUM ('success', 'failure', 'skipped');
```

---

## Data Retention

| Data Type | Retention | Cleanup Method |
|-----------|-----------|----------------|
| trade_logs | 1 year | Manual archive after 1 year |
| market_cache | 30 days | Daily cron deletes old entries |
| positions | Until closed | Auto-deleted when shares = 0 |
| bot execution logs | 90 days | Inngest retention |
| user activity | 1 year | Manual review |

---

## Backup Strategy

### Supabase PITR (Enabled)

- **Retention**: 7 days
- **Granularity**: Point-in-time recovery
- **Recovery Time**: 15-30 minutes

### Daily Dumps (Future)

- **Status**: Not implemented for MVP
- **Future Plan**: Daily at 02:00 UTC to S3/R2
- **Retention**: 1 year
- **Format**: pg_dump compressed

### Restore Procedure

1. Identify target recovery point (timestamp before incident)
2. Use Supabase Dashboard or CLI to restore to that point
3. Verify data integrity
4. Update application connection strings if new instance
5. Test bot execution on restored data

---

## Schema Evolution Notes (Future Phases)

| Phase | Migration |
|-------|-----------|
| **Phase 2: Live Trading** | Add `api_credentials` RLS, add `type` enum 'live' to trade_logs, add `transaction_hash` column |
| **Phase 2: Multi-bot** | `ALTER TABLE bots DROP CONSTRAINT bots_user_id_key;` |
| **Phase 3: Bot Groups** | Add `bot_group_id` to bots, add `bot_groups` table |
| **Phase 4: Backtesting** | Add `price_history` table |

---

## Critical Bug Fixes Implemented

### Fix 1: Position Average Entry Price (Correct)
- **Buy**: Recalculates weighted average
- **Sell**: Keeps average unchanged (you're exiting, not entering)

### Fix 2: Paper Balance Trigger
- **Buy**: Deducts `size_usd + fee_usd`
- **Sell**: Credits `shares * execution_price - fee_usd`

### Fix 3: Daily AI Cost Tracking
- Added `daily_ai_cost_usd` column
- Added `check_and_update_ai_cost()` function for atomic checks
- Added `reset_daily_ai_costs()` function for daily cron

### Fix 4: Idempotency Support
- Added `execution_id` UUID column
- Added `execution_status` enum ('pending', 'executed', 'failed')
- Proper PENDING → EXECUTED flow supported

### Fix 5: Cost Cap Enforcement
- Added `daily_ai_limit_usd` column (0.50 or 1.00)
- Atomic cost check and update function
- Prevents trades when limit exceeded
