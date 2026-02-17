# Polymancer MVP Design Spec

## Moto

Summon your 24/7 Polymarket trader.

## Summary

Paper-only MVP that lets non-technical users summon a 24/7 Polymarket trading agent. The system uses:

- **Polyseer** as a research tool (multi-agent AI research system) - integrated, not rebuilt
- **pmxt SDK** for unified Polymarket/Kalshi market access and trading
- **Decision Agent** (our code) - lightweight orchestration layer that combines user advice, Polyseer research, and market data to make trading decisions
- **ExecutionAdapter** (pmxt paper trading) for simulated FOK execution

## Goals

- Simple mobile-first UX for creating and monitoring one bot per user.
- Full autonomy with 9am summaries and critical alerts.
- Paper trading that closely mirrors real Polymarket execution (FOK, fees, slippage, latency).
- Zero live trading until legal review is complete.

## Non-Goals (MVP)

- Live trading or custody of user keys.
- Web UI (backend should be reusable later).
- Redis or heavy caching layers.
- Partial fills (FOK only).

## Target User and Promise

- User: non-technical person who believes their ideas can work on Polymarket.
- Promise: "Summon your 24/7 Polymarket trader."
- UX bias: defaults first, edit later, minimal configuration.

## Core Decisions

- Use Polyseer as a research tool/pipeline (not a scheduled daemon).
- Use pmxt SDK for unified Polymarket/Kalshi access.
- Full market universe; limit AI context to 50 markets per run.
- RevenueCat paid-only with 7-day trial ($19.99/month).
- Trial gated by phone number (unique E.164 normalized).
- Telegram is monitoring and Q/A only; configuration happens in the app.
- Bot runs on a 4-hour cycle with a 5-minute decision window.

## Architecture Overview

```
Mobile App (Expo) <-> API (Bun + Elysia, Fly.io)
                          |
                          +-> Supabase (auth + data + job queue)
                          |
                    Worker (Bun, Fly.io)
                          |
                          |-> Decision Agent (OUR CODE - lightweight)
                          |   |
                          |   +-> Polyseer (3rd-party research tool)
                          |   |   Runs: Planner, Researcher, Critic,
                          |   |         Analyst, Reporter agents
                          |   |   Outputs: pNeutral, pAware, evidence
                          |   |
                          |   +-> pmxt SDK (3rd-party trading infra)
                          |   |   Provides: Market data, paper trading
                          |   |         Supports: Polymarket + Kalshi
                          |   |
                          |   +-> Pamela News (ported - our code)
                          |   |   Provides: News signals, confidence
                          |   |
                          |   +-> OpenRouter (LLM for decisions)
                          |       Combines: User advice + research + data
                          |
                          |-> Notifications (Expo Push)
                          |-> Telegram bot
```

**Key Clarification**:

- **Polyseer** = 3rd-party research tool we invoke (git submodule)
- **pmxt** = 3rd-party trading SDK we use (bun package)
- **Decision Agent** = Our code - single LLM with tool access that orchestrates everything
- **We do NOT rebuild Polyseer's 6-agent system**

### Hosting

- **API**: Bun + Elysia on Fly.io (fast, user-facing HTTP)
- **Worker**: Long-running process on Fly.io that:
  - Polls for due bots every 30-60s
  - Claims jobs with `FOR UPDATE SKIP LOCKED` for safe horizontal scaling
  - Runs Polyseer pipeline, executes paper trades, records results
- **Database**: Supabase Postgres (shared by API + Worker)

## Polyseer Integration

Polyseer is a **research pipeline/tool**, not a scheduled daemon. We invoke it on-demand for each bot run.

- Add Polyseer as a git submodule to keep upstream intact.
- Polyseer provides multi-agent research system: Planner, Researcher, Critic, Analyst, Reporter.
- Entry point: `runUnifiedForecastPipeline(marketUrl, options)` - synchronous pipeline that returns a ForecastCard.
- Progress tracking via `onProgress` callback events.
- Replace only the execution boundary with an adapter layer.
- Scheduling is handled by our Worker (not Polyseer).
- Use Polyseer market research; only cap the context to 50 markets.
- Research powered by Valyu API for deep + web search capabilities.

### Bot Run Cycle

1. Worker picks up due bot (every 4 hours).
2. Opens 5-minute decision window.
3. Polyseer researches markets and outputs pNeutral/pAware + recommendation.
4. System parses output, fetches order book via pmxt.
5. Paper adapter simulates FOK trade if conditions met.
6. Records decision + result.
7. Window closes (or earlier if no good opportunities).

## pmxt Integration

- pmxt SDK provides unified API for Polymarket and Kalshi.
- Used for both market data fetching and trading execution.
- Paper adapter: simulates FOK fills using real order book data.
- Live adapter: stubbed, hard fail unless LIVE_TRADING_ENABLED.

### Paper Trading Simulation (FOK Only)

- Input: L2 order book (via pmxt), market metadata, fee schedule.
- Walk order book to compute average fill price.
- Reject if full size cannot be filled (FOK).
- Calculate slippage vs best bid/ask at decision time.
- Apply fees to compute net impact on balance.

### Interface (conceptual)

```
interface ExecutionAdapter {
  quoteOrder(input): Quote
  placeOrder(input): ExecutionResult
  getPositions(userId): Position[]
  getMarketData(marketIds): MarketData[]
}
```

### Paper Adapter (MVP)

- Simulates FOK using real order book depth via pmxt.
- Applies Polymarket/Kalshi fees and slippage.
- Adds artificial latency (200-500ms) before returning fills.
- Never signs or submits live orders.

### Live Adapter (Future)

- Stubbed out in MVP.
- Hard fail if invoked (safety guardrail).
- Only enabled after legal review and explicit feature flag.

## Market Discovery and Context Size

- Discovery: Polyseer research agents across the full market universe.
- Prompt limit: select up to 50 markets per run.
- No liquidity filters in MVP.
- No TTL caching in MVP (data pulled on demand).

## AI Decision Loop

1. Polyseer receives market question or trigger.
2. Planner generates research strategy and search seeds.
3. Researcher gathers PRO/CON evidence via Valyu API.
4. Critic identifies gaps, triggers follow-up if needed.
5. Analyst performs Bayesian probability aggregation.
6. Reporter generates final verdict with pNeutral and pAware.
7. System parses Polyseer output for trading decision.
8. Fetch market data via pmxt.
9. Simulate FOK trade via paper adapter.
10. Enforce risk rules.
11. Record decision and execution.

### Malformed Response Policy

- Retry twice.
- If still invalid, pause bot and alert user.

## Risk Rules and Defaults

Rules are editable at any time and apply on the next run.

Safe defaults (MVP):

- Max daily loss: $100
- Max position size: $200
- Max trades per day: 10
- Slippage threshold: 2%
- Daily AI cost cap: $0.50

Additional policies:

- Emergency stop available to user.
- Pause bot on repeated AI failures.

## Paper Balance and P&L History

- User can reset paper balance at any time.
- Each reset starts a new paper session.
- P&L history is preserved across sessions.

## Notifications

- 9am daily summary (local time).
- Alert on: bot paused, daily loss hit, repeated errors, market resolution, large position change.

## Telegram

- Phone number link to app account.
- Read-only queries and status updates.
- No configuration changes via Telegram.

## Billing (RevenueCat)

- Paid-only with 7-day trial.
- $19.99/month.
- Same capabilities during trial as paid.
- Trial gated by phone number: one trial per unique phone number (E.164 normalized).
- Trial starts when phone is verified + bot is activated.
- Hard cutoff at day 7 (no grace period).
- Reserve option to add free tier later.

## Data Model (MVP)

Minimal tables and purpose:

- users: auth, tier, timezone, telegram link, notification prefs.
- bot: single bot config, rules, status, model, last run.
- trade_logs: every decision and execution result (paper only).
- positions: current paper holdings.
- paper_sessions: balance resets with timestamps and starting balance.
- bot_failures: AI or execution failures for alerting and diagnostics.

All decisions (including HOLD and REJECTED) are logged.

## Observability and Safety

- Structured logs for all runs and decisions.
- Health endpoint for API and agent runtime.
- Hard guardrail: live adapter disabled in MVP.

## Future (Post-MVP)

- Redis/TTL caching for market data via pmxt.
- Web dashboard using the same backend.
- Live trading after legal review (pmxt live adapter).
- Kalshi support via pmxt SDK.
- Enhanced Valyu research capabilities.
