# Polymancer System Architecture

This document describes the system-level components, boundaries, and integration points.
For agent behavior, data contracts, and scheduling rules, see `docs/agent-spec.md`.
For database schema and data model, see `docs/db-spec.md`.
For technical implementation details, see `docs/tech-spec.md`.

> **note**: all files are subject to change slightly as the project continues development, we must always update all docs accordingly

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  Mobile App  │  │  Telegram    │                         │
│  │ (Control Hub)│  │    Bot       │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
└─────────┼─────────────────┼─────────────────────────────────┘
          │                 │
          └─────────────────┼
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    API LAYER (Bun + Elysia)                  │
│  - Telegram chat handling (primary interaction)              │
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

Web UI is not part of the MVP; future scope is TBD.

## Components and Boundaries

### API Layer

- Handles Telegram chat, auth, and user configuration
- Enforces access control and rate limits
- Exposes endpoints for bot control

### Worker and Decision Agent

- Schedules and executes runs (scheduled, reactive, user-triggered)
- Scheduler tick enqueues due scheduled runs from `bots.next_run_at`
- Runs a single Decision Agent with tool access
- Produces decision intents, not direct trades

### Polyseer Integration

Polyseer link:
https://github.com/yorkeccak/Polyseer

**Strategy:** Fork + Submodule
1. Fork `yorkeccak/Polyseer` to `yourname/Polyseer`
2. Add YOUR fork as submodule: `packages/polyseer`
3. Pin to specific commit/tag
4. Periodically: `git subtree pull` updates from upstream

**Why:** Protects against upstream deletion while allowing updates.

- External research tool (git submodule from fork)
- Inputs: market URL
- Outputs: ForecastCard (pNeutral, pAware, drivers, audit, markdown report)
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
- Upstash Redis for message queue (Telegram webhooks, background jobs)
- Expo Push for summaries/alerts, Telegram for chat

### Message Queue (Redis)

**Hosting:** Upstash ($10/mo fixed plan) via Fly.io integration

**Queues:**
- `telegram:messages` - Incoming Telegram messages
- `notifications` - Expo push notifications
- `background` - Reconciler, cleanup jobs

**Worker Architecture:**
- Separate Fly.io app (`apps/worker`) consuming from Redis
- BullMQ blocking commands (no polling, automatic job distribution)
- Scale by increasing worker instance count

**Flow:**
1. API receives webhook → validates → enqueues → returns 200
2. Worker processes queue items asynchronously
3. Failed items retry with exponential backoff
4. Dead letter queue for persistent failures

## Control Flow (High Level)

1. User input arrives via Telegram; mobile app updates config
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
│                               # name: @polymancer/mobile
├── packages/
│   ├── agent-core/             # Decision Agent (our code)
│   ├── polyseer/               # Git submodule: your fork of Polyseer
│   ├── pamela-core/            # Ported: News service + confidence scoring
│   ├── database/               # Supabase types, schema, client
│   └── shared/                 # Shared types, utilities, constants
```

**Dependency Notes:**
- `pmxt` is installed via `bun add pmxtjs@2.8.0` (locked to v2.8.0)
- `polyseer` is a git submodule from your fork (not directly from upstream)

## Related Documents

- `docs/agent-spec.md` for agent behavior, data contracts, and scheduling
- `docs/tech-spec.md` for integration details and implementation notes
- `docs/deployment-spec.md` for hosting and ops
