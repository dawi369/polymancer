# Polymancer Agent Schema

This document defines the complete agent architecture for Polymancer. It is a comprehensive, actionable plan that ties together interactive chat, reactive news scanning, Polyseer research, and paper trading execution.

## Goals

- 24/7 interactive agent that can answer anything and explain its reasoning.
- Reactive to news and market movement, not only scheduled runs.
- Uses Polyseer as a research tool for high-quality evidence.
- Makes decisions autonomously but enforces hard safety boundaries.
- Multi-tenant by design, with predictable performance and cost control.

## Core Principles

- Polyseer is a research pipeline, not the decision maker.
- Decision authority lives in the Decision Agent layer.
- Risk checks are enforced outside the agent.
- All decisions are auditable and explainable.
- Scheduling and reactive triggers are centralized in the Worker.

## System Overview

```
Telegram / App Chat
        |
        v
Decision Agent (LLM + Tools)
        |
        +-> Polyseer (research tool)
        +-> News + Market Signals
        +-> Market Data (pmxt)
        +-> Portfolio / Trade Logs
        v
Risk / Policy Engine (hard boundary)
        v
Paper Execution Adapter (FOK sim)
        v
Database (runs, trade_logs, positions, summaries)

Worker: schedules + executes runs (scheduled, reactive, user-triggered)
API: serves chat, reads state, exposes bot controls
```

## Components

### 1) Decision Agent

The Decision Agent is the conversational brain and the only component allowed to recommend trades.

Responsibilities:
- Answer user questions 24/7
- Explain decisions and reasoning
- Trigger research and decisions
- Output structured decision intents

Outputs:
- Decision JSON (BUY / SELL / HOLD + size + market)
- Explanation (evidence summary + rationale + risk context)

### 2) Polyseer Research Tool

Polyseer is invoked as a synchronous pipeline for deeper evidence.

Entry point:
- `runUnifiedForecastPipeline(marketUrl, options)`

Outputs:
- `ForecastCard` with `pNeutral`, `pAware`, `recommendation`, `evidence_summary`

Usage rules:
- Use Polyseer for high-confidence or ambiguous trades
- Skip Polyseer for simple low-stakes chat
- Enforce per-run cost limits

### 3) Signal Layer (Reactive)

Signals are used to trigger reactive runs.

Sources:
- News ingestion (ported from Pamela NewsService)
- Market movement (price and liquidity changes)
- User-triggered runs (chat)

Signal scoring:
- Each signal outputs `score` and `reason`
- If score passes threshold, enqueue a run

### 4) Worker Runtime

The Worker handles all execution. It is long-running and job-queue driven.

Responsibilities:
- Scheduled runs every 4 hours
- Reactive runs when triggers pass thresholds
- User-triggered runs
- Concurrency control and fairness

### 5) Risk / Policy Engine

Hard boundary that validates every decision before execution.

Checks include:
- Bot status and pause state
- Daily AI cost cap
- Max trades per day
- Max daily loss
- Max position size
- Slippage threshold
- Paper balance sufficient

### 6) Paper Execution Adapter

FOK simulation using pmxt order book depth.
- No partial fills
- Simulated latency (200-500ms)
- Fee schedule applied

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
  "run_type": "scheduled" | "reactive" | "user"
}
```

### Polyseer Output (input to Decision Agent)

```json
{
  "verdict": "YES" | "NO" | "UNCLEAR",
  "pNeutral": 0.65,
  "pAware": 0.72,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "evidence_summary": {
    "pro": ["point 1"],
    "con": ["point 1"]
  },
  "key_factors": ["factor 1"],
  "recommendation": "BUY" | "SELL" | "HOLD"
}
```

## Run Types and Scheduling

### Scheduled Runs
- Every 4 hours
- 5-minute decision window
- If no opportunity, end early

### Reactive Runs (Permissive Defaults)
Default thresholds (adjustable):
- News signal confidence >= 0.70 and at least 3 relevant articles
- Price move >= 5% within 15 minutes
- Liquidity change >= 30% within 15 minutes
- Volume spike >= 2x 24h average

If any threshold is met:
- Enqueue a reactive run immediately

### User-Triggered Runs
- Chat command "run now" enqueues a run
- If a run is already in progress, the request is queued

## Concurrency and Scaling

Recommended defaults:
- Max concurrent runs per Worker: 5
- Max concurrent Polyseer calls per Worker: 3
- Max chat responses per user: 10 per minute

Rationale:
- Prevents API rate-limit spikes
- Avoids CPU contention on a single node
- Keeps response latency stable

Scaling model:
- Start with one Worker instance
- Scale horizontally as runs increase
- Use DB queue locking with `FOR UPDATE SKIP LOCKED`

## News Pipeline (Port from Pamela)

Port these modules directly:
- `NewsService`
- `MarketKeywordExtractor`
- `confidence-scorer`
- `news-config` and `confidence-config`

Usage:
- Cache and score articles
- Derive bullish/bearish signals
- Provide context to Decision Agent

Provider (MVP):
- NewsAPI as the initial source
- API key from env: `NEWS_API_KEY`
- Additional providers can be layered later

## Chat Capabilities (24/7)

The agent can answer any question at any time.

Allowed interactions:
- General market questions
- "Why did you trade X?"
- "What do you think about market Y?"
- "Run analysis now"

Chat behavior rules:
- Use smaller model for casual chat if needed
- Use Decision Agent for anything involving trades
- Use Polyseer only when a decision requires deep evidence

## Execution Lifecycle

1) Worker claims a run
2) Decision window opens
3) Decision Agent gathers context + signals
4) Polyseer invoked if needed
5) Decision intent produced
6) Risk / Policy Engine validates
7) Paper adapter simulates FOK trade
8) Logs + positions updated
9) Notifications sent

## Failure Handling

If a dependency is down:
- Pause execution and record a failure
- Do not run the bot
- Retry on next scheduled cycle

All trade actions are idempotent using `idempotency_key`.

## Configuration Defaults (MVP)

- run_interval_hours: 4
- decision_window_seconds: 300
- daily_ai_limit_usd: 0.50
- max_trades_per_day: 10
- max_position_size_usd: 200
- slippage_threshold_percent: 2

## Open Items (to refine later)

- Exact signal thresholds after live data testing
- Final LLM model selection for chat vs decision (separate models, TBD)
- Additional news providers (GDELT, others)
- Market movement window sizes and triggers

## Summary

This schema combines interactive chat, reactive signal processing, and Polyseer research into a unified agent system. It is designed to be comprehensive, scalable, and safe, while still providing a responsive agent experience.
