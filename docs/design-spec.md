# Polymancer MVP Design Spec

## Motto

Summon your 24/7 Polymarket trader.

## Summary

Paper-only MVP that lets non-technical users summon a 24/7 Polymarket trading agent. The system uses:

- Polyseer as a research tool (integrated, not rebuilt)
- pmxt SDK for unified Polymarket/Kalshi market access and trading
- Decision Agent (our code) that combines user advice, research, and market data
- ExecutionAdapter (pmxt paper trading) for simulated FOK execution

## Goals

- Simple mobile-first UX for creating and monitoring one bot per user.
- Full autonomy with 9am summaries and critical alerts.
- Paper trading that closely mirrors real Polymarket execution (FOK, fees, slippage, latency).
- Zero live trading until legal review is complete.

## Non-Goals (MVP)

- Live trading or custody of user keys.
- In-app chat.
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
- Mobile app is the control hub (rules, constraints, billing, status).
- Telegram is the primary interaction channel for chat, analysis, and trade suggestions.
- No configuration changes via Telegram.
- Bot runs on a 4-hour cycle with a 5-minute decision window.

## Architecture Overview

```
Mobile App (Expo) <-> API (Bun + Elysia)
                          |
                          +-> Data store (auth + data + job queue)
                          |
                    Worker (Bun)
                          |
                          |-> Decision Agent (our code)
                          |   +-> Polyseer (research tool)
                          |   +-> pmxt (market data + trading)
                          |   +-> Pamela News (signals)
                          |   +-> OpenRouter (LLM)
                          |
                          |-> Notifications (Expo Push)
                          |-> Telegram bot
```

Detailed component boundaries are in `docs/architecture.md`.
Agent behavior, data contracts, and scheduling rules are in `docs/agent-spec.md`.
Database schema and data model are in `docs/db-spec.md`.
Technical implementation details are in `docs/tech-spec.md`.

Deployment details are in `docs/deployment-spec.md`.

## Technical References

Implementation details for Polyseer, pmxt, execution, and data model live in `docs/tech-spec.md`.

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
- Session history stores start/end balances; active session tracks current balance.

## Notifications

- 9am daily summary (local time using `users.timezone`; all stored timestamps remain UTC).
- Scheduler runs in UTC and computes local 9am for each user.
- Alert on: bot paused, daily loss hit, repeated errors, market resolution, large position change (>25% of paper balance).

## Telegram

- Primary interaction channel for chat, analysis, and trade suggestions.
- Linked via deep link with one-time token + Contact sharing (no SMS OTP).
- Phone number obtained from Telegram Contact used for trial gating.
- No configuration changes via Telegram.

## Onboarding Flow

- Sign in with Apple or Google.
- Intro/onboarding screens explaining Telegram 24/7 capabilities.
- Connect Telegram via deep link (one-tap, no SMS).
- Bot setup and activation.
- Trial starts on bot activation.

## Billing (RevenueCat)

- Paid-only with 7-day trial.
- Trial gated by phone number from Telegram (unique per E.164 normalized number).
- $19.99/month.
- Same capabilities during trial as paid.
- Trial starts when bot is activated.
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

- Hard guardrail: live adapter disabled in MVP.

## Future (Post-MVP)

- Redis/TTL caching for market data via pmxt.
- Web dashboard using the same backend.
- Live trading after legal review (pmxt live adapter).
- Kalshi support via pmxt SDK.
- Enhanced Valyu research capabilities.
