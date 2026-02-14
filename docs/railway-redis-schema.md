# Railway Managed Redis Schema (The Data Firehose)

**Purpose**: High-frequency, ephemeral data storage. Bypasses Polymarket API rate limits and protects Supabase from read/write exhaustion.
**Paradigm**: Key-Value in-memory store. Strict Time-To-Live (TTL) enforcement.

## Namespace Design

All keys follow the convention: `app:resource:identifier:attribute`

### 1. Real-Time Prices (For Live Trading Triggers)

Written continuously by the Railway background worker listening to the Polymarket WebSocket.

- **Key**: `polymarket:market:{market_id}:price`
- **Data Type**: String (Float) -> e.g., `"0.45"`
- **TTL**: `5 seconds`
- **Usage**: When an Inngest bot wakes up, it reads this key. If the key is missing (TTL expired), it falls back to the Polymarket REST API to ensure it never trades on stale data.

### 2. Order Book Depth (For Paper Trading Slippage)

Written continuously by the Railway worker for active markets.

- **Key**: `polymarket:market:{market_id}:book`
- **Data Type**: JSON -> e.g., `{"bids": [[0.45, 1000], [0.44, 5000]], "asks": [[0.47, 500]]}`
- **TTL**: `5 seconds`
- **Usage**: The Paper Trading engine pulls this JSON to simulate eating through the order book, calculating exact mathematical slippage for fake trades.

### 3. Rate Limit Guards (Backend Failsafes)

Used by Elysia to ensure a buggy bot doesn't spam OpenRouter or Polymarket and drain your API credits.

- **Key**: `ratelimit:user:{user_id}:llm_calls`
- **Data Type**: Integer (Counter)
- **TTL**: `60 seconds`
- **Usage**: Increments on every AI execution.

### 4. Recent Bot Context Cache (For Fast Memory Hydration)

- **Key**: `polymancer:user:{user_id}:recent_context`  
  or more granular: `polymancer:bot:{bot_id}:recent_context`
- **Data Type**: JSON  
  e.g., `{"last_success": "arbitrage on market XYZ", "recent_failures": ["slippage >10% on thin election market"], "adaptation": "reduce size by 50% in low-liquidity"}`
- **TTL**: `300 seconds` (5 minutes — matches Pro polling cadence)
- **Usage**: Fast path for Inngest job to hydrate bot memory before LLM call. If expired/missing → fallback to full Supabase query on `bot_context` + `failures` + `trade_logs`.

### 5. Polling / Execution Rate Limit (Tier Enforcement)

- **Key**: `ratelimit:user:{user_id}:executions`
- **Data Type**: Integer (Counter)
- **TTL**: `300 seconds` (covers 5-min Pro polling window)
- **Usage**: Increment on every Inngest bot wake-up. Reject if exceeds tier allowance (e.g., Pro: 12/hour, Basic: 2/hour).
