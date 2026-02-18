# Polymancer System Architecture

This document describes the system-level components, boundaries, and integration points.
For agent behavior, data contracts, and scheduling rules, see `docs/agent-spec.md`.

> **note**: all files are subject to change slightly as the project continues development, we must always update all docs accordingly

## Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Mobile App  │  │  Telegram    │  │  Chat UI     │        │
│  │   (Expo)     │  │    Bot       │  │  (Real-time) │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼─────────────────┼─────────────────┼────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    API LAYER (Bun + Elysia)                  │
│  - Real-time chat handling                                   │
│  - User authentication (Supabase Auth)                       │
│  - Bot configuration (strategy prompts, rules, constraints)  │
│  - Webhooks (RevenueCat, Telegram)                           │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                   WORKER (Bun Process)                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              DECISION AGENT (Our Code)                 │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   Polyseer   │  │    pmxt      │  │  Pamela News │  │  │
│  │  │   (Research) │  │  (Trading)   │  │   (Signals)  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                        │  │
│  │  Single LLM with tool use:                             │  │
│  │  - User input (strategy prompt, constraints)           │  │
│  │  - Research (from Polyseer)                            │  │
│  │  - Market data (from pmxt)                             │  │
│  │  - News signals (from Pamela)                          │  │
│  │  - Portfolio history                                   │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│              RISK ENGINE -> EXECUTION -> DATABASE            │
│  - Risk checks (position limits, daily loss)                 │
│  - Paper trading (pmxt simulation)                           │
│  - Supabase (logs, positions, users)                         │
└──────────────────────────────────────────────────────────────┘
```

## Components and Boundaries

### API Layer

- Handles chat, auth, and user configuration
- Enforces access control and rate limits
- Exposes endpoints for bot control

### Worker and Decision Agent

- Schedules and executes runs (scheduled, reactive, user-triggered)
- Runs a single Decision Agent with tool access
- Produces decision intents, not direct trades

### Polyseer Integration

Polyseer link:
https://github.com/yorkeccak/Polyseer

- External research tool (git submodule)
- Inputs: market URL
- Outputs: pNeutral, pAware, recommendation, evidence summary
- Invoked selectively based on uncertainty or trade value

### pmxt Integration

pmxt link:
https://github.com/pmxt-dev/pmxt

- External trading SDK (npm package `pmxtjs`)
- Market data, order book, and execution abstraction
- Used for paper trading in MVP

### Pamela News

Pamela link:
https://github.com/theSchein/pamela

- Ported signal pipeline (NewsService, keyword extractor, confidence scoring)
- Provides event-driven triggers and contextual signals

### Risk and Execution

- Risk and policy checks gate every decision
- Execution uses pmxt paper adapter (FOK simulation)

### Data Store and Notifications

- Supabase for auth, data, and job queue
- Expo Push and Telegram for notifications

## Control Flow (High Level)

1. User input arrives via mobile or Telegram
2. API loads bot config and strategy prompt
3. Worker runs Decision Agent with tool context
4. Optional Polyseer research for uncertain or high-value trades
5. Decision intent produced and validated by risk engine
6. Paper execution via pmxt adapter
7. Results persisted and notifications emitted

## Repository Layout

```
polymancer/
├── apps/
│   ├── api/                    # Elysia API (chat, auth, config)
│   │   └── package.json        # depends on: pmxtjs, @polymancer/agent-core
│   ├── worker/                 # Bun worker (decision agent)
│   │   └── package.json        # depends on: pmxtjs, @polymancer/agent-core
│   └── mobile/                 # Expo app (UI only)
│       └── package.json        # depends on: @polymancer/database
├── packages/
│   ├── agent-core/             # Decision Agent (our code)
│   ├── polyseer/               # Git submodule: github.com/yorkeccak/Polyseer
│   ├── pamela-core/            # Ported: News service + confidence scoring
│   ├── database/               # Supabase types, schema, client
│   └── shared/                 # Shared types, utilities, constants
```

Note: `pmxt` is installed via `bun add pmxtjs` in apps that need it.

## Related Documents

- `docs/agent-spec.md` for agent behavior, data contracts, and scheduling
- `docs/tech-spec.md` for integration details and implementation notes
