# Polymancer Agent Schema

This document specifies agent behavior, inputs, outputs, and run rules.
For system-level components and boundaries, see `docs/architecture.md`.

## Goals

- 24/7 interactive agent that can answer questions and explain reasoning
- Reactive to news and market movement, not only scheduled runs
- Uses Polyseer as a research tool for high-quality evidence
- Makes decisions autonomously while enforcing hard safety boundaries
- Multi-tenant design with predictable performance and cost control

## Core Principles

- Polyseer is a research pipeline, not the decision maker
- Decision authority lives in the Decision Agent layer
- Risk checks are enforced outside the agent
- All decisions are auditable and explainable
- Scheduling and reactive triggers are centralized in the Worker

## Agent Scope and Dependencies

### Inputs
- User strategy prompt and constraints
- Current portfolio and trade history
- Market data and order book snapshots
- News signals and reactive triggers
- Optional Polyseer research output

### Tools
- Polyseer research tool (external, invoked on demand)
- pmxt market data and execution tool (external SDK)
- Pamela news pipeline (ported)
- Portfolio and trade history access
- Telegram chat interface for user interaction

### Outputs
- Decision intent (BUY/SELL/HOLD) with sizing and reasoning
- Structured explanation for chat responses
- Execution logs and risk evaluation results
- Trade statement (predefined fields, WIP)

## Decision Agent

The Decision Agent is the conversational brain and the only component allowed to recommend trades.

Responsibilities:
- Answer user questions 24/7
- Explain decisions and reasoning
- Trigger research and decisions
- Output structured decision intents

Outputs:
- Decision JSON (BUY/SELL/HOLD with size, market, confidence)
- Explanation (evidence summary, rationale, risk context)

## Polyseer Research Tool

Polyseer is invoked as a synchronous pipeline for deeper evidence.

Entry point:
- `runUnifiedForecastPipeline(marketUrl, options)`

Outputs:
- `ForecastCard` with `p0`, `pNeutral`, `pAware`, `drivers`, `audit`, `markdownReport`

Usage rules:
- Use Polyseer for high-value or ambiguous trades
- Skip Polyseer for low-stakes chat or routine checks
- Enforce per-run cost limits

## Signal Layer (Reactive)

Signals are used to trigger reactive runs.

Sources:
- News ingestion (ported from Pamela NewsService)
- Market movement (price and liquidity changes)
- User-triggered runs (Telegram)

Market polling (MVP):
- Worker polls market data every 60s for a scoped set of markets
- Scope: open positions + recent signal markets + last N markets + exploration slots (cap 50)
- Compute 15-minute deltas for price, liquidity, volume
- If thresholds are met, emit `signal_events` and enqueue a reactive run

Signal scoring:
- Each signal outputs `score` and `reason`
- If score passes threshold, enqueue a run
- Record the signal event for dedupe and audit

## Worker Runtime

The Worker handles all execution. It is long-running and job-queue driven.

Responsibilities:
- Scheduled runs every 4 hours
- Reactive runs when triggers pass thresholds
- User-triggered runs
- Concurrency control and fairness

## Risk and Policy Engine

Hard boundary that validates every decision before execution.

Checks include:
- Bot status and pause state
- Daily AI cost cap
- Max trades per day
- Max daily loss
- Max position size
- Slippage threshold
- Paper balance sufficient

## Execution Adapter

FOK simulation using pmxt order book depth.

- No partial fills
- Uses pmxt market data for order book walking
- Applies fee schedule and slippage checks

## Data Contracts

### Decision Intent (output from Decision Agent)

```json
{
  "action": "BUY" | "SELL" | "HOLD",
  "market_id": "...",
  "token": "YES" | "NO",
  "size_usd": 25.0,
  "confidence": 0.0,
  "reasoning": "...",
  "sources": ["polyseer", "news", "market"],
  "run_type": "scheduled" | "reactive" | "user",
  "trade_statement": {
    "why": "...",
    "timeframe": "...",
    "influencers": ["..."],
    "watchouts": ["..."]
  }
}
```

Note: trade statement fields are WIP and will evolve over time.

Note: LLM outputs use uppercase enums; the worker normalizes to lowercase for persistence.

### Polyseer Output (input to Decision Agent)

```json
{
  "question": "...",
  "p0": 0.5,
  "pNeutral": 0.62,
  "pAware": 0.58,
  "alpha": 0.1,
  "drivers": ["factor 1"],
  "evidenceInfluence": [{ "evidenceId": "...", "logLR": 0.2, "deltaPP": 0.03 }],
  "clusters": [{ "clusterId": "...", "size": 3, "rho": 0.6, "mEff": 1.8, "meanLLR": 0.12 }],
  "audit": {
    "caps": { "A": 2.0, "B": 1.6, "C": 0.8, "D": 0.3 },
    "checklist": {
      "baseRatePresent": true,
      "twoSidedSearch": true,
      "independenceChecked": true,
      "influenceUnderThreshold": true
    }
  },
  "provenance": ["https://..."],
  "markdownReport": "..."
}
```

Note: Polyseer does not emit a confidence enum; Polymancer derives a numeric `ai_confidence` from the forecast card audit and evidence count.

## Run Types and Scheduling

### Scheduled Runs

- Every 4 hours
- 5-minute decision window
- If no opportunity, end early

### Reactive Runs (Defaults)

- News signal confidence >= 0.70 and at least 3 relevant articles
- Price move >= 5 percent within 15 minutes
- Liquidity change >= 30 percent within 15 minutes
- Volume spike >= 2x 24h average

If any threshold is met:
- Enqueue a reactive run immediately

### User-Triggered Runs

- Telegram command "run now" enqueues a run
- If a run is already in progress, the request is queued

## MVP Execution Model

For MVP, use a single Worker instance that processes all bots sequentially:

- One Worker handles all bot runs
- Only one run per bot at a time (enforced by `FOR UPDATE SKIP LOCKED`)
- Runs are executed by `scheduled_for` order; no priority scheme in MVP
- Scaling decisions deferred until post-MVP

Concurrency limits (MVP):
- Max chat responses per user: 10 per minute
- Max concurrent Polyseer calls: 1 (sequential)

## News Pipeline (Port from Pamela)

Port these modules directly:
- `NewsService`
- `MarketKeywordExtractor`
- `confidence-scorer`
- `news-config` and `confidence-config`

Usage:
- Cache and score articles
- Derive bullish or bearish signals
- Provide context to the Decision Agent

Storage (MVP):
- Store signal metadata in `signal_events`
- Store top article refs (title/url) in `runs.input_params`
- No persistent news article tables

Provider (MVP):
- NewsAPI as the initial source
- API key setup in `docs/deployment-spec.md`
- Additional providers can be layered later

## Chat Capabilities (24/7)

Primary user interaction happens in Telegram; the mobile app is a control hub only (no in-app chat for MVP).

Allowed interactions:
- General market questions
- "Why did you trade X?"
- "What do you think about market Y?"
- "Here is a trade idea, analyze it."
- "Run analysis now"

Behavior rules:
- Use smaller model for casual chat if needed
- No mobile app chat in MVP
- Use Decision Agent for anything involving trades
- Use Polyseer only when a decision requires deep evidence

## Agent Loop

Goal: maximize context while avoiding repeat work across runs.

1. **Preflight Gate**
   - Kill switch, bot status, daily AI cap, dependency health.
2. **Context Snapshot (non-LLM)**
   - Bot config + strategy prompt, positions, active paper session
   - Market snapshots, signal events, last N runs (compact)
   - Cached market briefs + cached research (if valid)
   - Outputs: `context_fingerprint`, `context_summary`
3. **Materiality Gate**
   - Compute `change_score` (defaults below)
   - Scheduled runs: if below threshold, record HOLD with `skip_reason="no_material_change"`
   - Reactive/user runs bypass the gate
4. **Research Planner**
   - Only request Polyseer for high-value or high-uncertainty markets
5. **Decision**
   - LLM uses snapshot + briefs + research; emits intent + trade statement
6. **Post-Run Memory Write**
   - Persist summaries, briefs, research cache, and run metadata for reuse

### Materiality Defaults

- Normalize to 0-1 (cap at 1.0):
  - `price_move_pct / 5`
  - `liquidity_change_pct / 30`
  - `volume_ratio / 2` (vs 24h avg)
  - `news_signal_score / 0.70`
  - `position_drift_pct_of_balance / 10`
- `change_score = max(normalized components)`
- Threshold: `0.6`

## Context Reuse Rules

- Market briefs and research cache are shared across bots; strategy prompts remain per-bot.
- TTL and invalidation rules are defined in `docs/tech-spec.md`.

## Failure Handling

If a dependency is down:
- Pause execution and record a failure
- Do not run the bot
- Retry on next scheduled cycle
- No partial execution when dependencies are unhealthy

All trade actions are idempotent using `idempotency_key`.

## Configuration Defaults (MVP)

- run_interval_hours: 4
- decision_window_seconds: 300
- daily_ai_limit_usd: 0.50
- max_trades_per_day: 10
- max_position_size_usd: 200
- slippage_threshold_percent: 2

## Open Items

- Exact signal thresholds after live data testing
- Final LLM model selection for chat vs decision (separate models, TBD)
- Additional news providers (GDELT, others)
- Market movement window sizes and triggers

## Summary

This schema defines the Decision Agent behavior, data contracts, and run lifecycle.
Polyseer provides research input, while the Decision Agent owns final decisions.
