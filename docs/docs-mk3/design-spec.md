# Polymancer MVP Design Spec (docs-mk3)

## Moto

Summon your 24/7 Polymarket trader.

## Summary

Paper-only MVP that lets non-technical users summon a 24/7 Polymarket trading agent. The core agent comes from Pamela and is adapted via an ExecutionAdapter to guarantee simulated trading only.

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

- Use Pamela scheduling and market discovery approach.
- Full market universe; limit AI context to 50 markets per run.
- RevenueCat paid-only with 14-day trial ($19.99/month).
- Telegram is monitoring and Q/A only; configuration happens in the app.

## Architecture Overview

```
Mobile App (Expo) <-> API (Bun + Elysia)
                         |
                         |-> Pamela runtime (agent core)
                         |-> ExecutionAdapter (paper/live)
                         |-> Supabase (auth + data)
                         |-> OpenRouter (LLM)
                         |-> Polymarket data APIs
                         |-> Notifications (Expo Push)
                         |-> Telegram bot
```

## Pamela Integration

- Add Pamela as a git submodule to keep upstream intact.
- Replace only the execution boundary with an adapter layer.
- Use Pamela scheduling as-is for MVP (no custom scheduler).
- Use Pamela market discovery; only cap the context to 50 markets.

## Execution Adapter

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

- Simulates FOK using real order book depth.
- Applies Polymarket fees and slippage.
- Adds artificial latency (200-500ms) before returning fills.
- Never signs or submits live orders.

### Live Adapter (Future)

- Stubbed out in MVP.
- Hard fail if invoked (safety guardrail).
- Only enabled after legal review and explicit feature flag.

## Market Discovery and Context Size

- Discovery: Pamela approach across the full market universe.
- Prompt limit: select up to 50 markets per run.
- No liquidity filters in MVP.
- No TTL caching in MVP (data pulled on demand).

## Paper Trading Simulation (FOK Only)

- Input: L2 order book, market metadata, fee schedule.
- Walk order book to compute average fill price.
- Reject if full size cannot be filled (FOK).
- Calculate slippage vs best bid/ask at decision time.
- Apply fees to compute net impact on balance.

## AI Decision Loop

1) Build context: bot settings, risk rules, current positions, P&L, 50 markets.
2) Call OpenRouter (cheap model for MVP).
3) Parse response (strict JSON schema).
4) Validate: action, market_id in context, size, token.
5) Simulate FOK trade.
6) Enforce risk rules.
7) Record decision and execution.

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

- Paid-only with 14-day trial.
- $19.99/month.
- Same capabilities during trial as paid.
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

- Redis/TTL caching for market data.
- Web dashboard using the same backend.
- Live trading after legal review.
