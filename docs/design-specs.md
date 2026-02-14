# Polymancer

**Platform**: iOS & Android via Expo SDK 55  
**Goal**: Mobile app for non-technical users to create, configure, and deploy secure, rule-constrained AI trading bots on Polymarket with reliable 24/7 automation.
**URL**: polymancer.ai

## Vision

A mobile-first platform that lets anyone launch a personalized AI trading bot for Polymarket in minutes:

- Natural language strategy description translated into strict logic (with beginner-friendly templates/examples)
- Model-agnostic AI routing (Vercel AI SDK + OpenRouter)
- Unbreakable, server-enforced risk rules
- **Custodial execution**: Server holds encrypted private keys for reliable always-on trading (with industry-standard mitigations, transparency, and easy key export/revocation)

## Competitors & Differentiation

The Polymarket trading bot space is active but fragmented. No direct 1:1 competitor exists for a mobile-first, no-code AI bot builder targeted at non-technical users.

**Main Competitors**

- **OpenClaw / IronClaw**: Leading open-source AI agent frameworks. Powerful for custom autonomous agents but require coding, VPS setup, and technical expertise. Not mobile-native; high barrier for non-devs.
- **OctoBot Prediction Market**: Free open-source Polymarket trading robot (GitHub). Scriptable strategies but CLI/server-based; no mobile UX or natural-language interface.
- **Copy-Trading Bots (TradeFox, Kreo, Polygun)**: Allow following top traders automatically. Popular for passive users but no custom strategy creation or AI reasoning — users copy humans/AI, not build their own.
- **Polymtrade**: Dedicated mobile trading terminal for Polymarket with AI-powered insights and self-custodial trades. Closest mobile competitor but focused on manual/fast trading + insights, not automated bot creation/deployment.
- **Custom/Arbitrage Bots**: Numerous GitHub repos and community bots (weather, BTC up/down, arbitrage). Highly profitable in niches but require self-hosting, coding, and ongoing maintenance.
- **Official Polymarket App**: Excellent for manual trading; no automation or bot features.

**Polymancer Differentiation**

- Truly no-code: Natural language → enforceable AI bot in minutes.
- Mobile-native dashboard with real-time explanations, logs, and one-tap controls.
- Mandatory simulation + unbreakable safety rules tailored for non-tech users.
- Managed service with reliable 24/7 execution (accepting custodial trade-off for usability).
- Future roadmap: Optional trustless on-device mode when mobile background execution improves.

## Open-Source Integrations & Development Approach

To accelerate development as a solo dev, selectively borrow from open-source competitors rather than full forks. Full forking (e.g., OctoBot-Prediction-Market) is not recommended due to stack mismatches (Python vs. TS/Bun), license constraints (GPL-3.0 requires open-sourcing derivatives), and underdevelopment of key features. Instead, cherry-pick proven components to enhance the custom Nanobot-style pipeline without bloat.

**Prioritized Borrowings**:

- **PolyClaw/OpenClaw Skills (Primary Focus)**: From https://github.com/chainstacklabs/polyclaw or openclaw-skills. Adapt tool definitions/schemas for Polymarket actions (browse markets, place orders, get positions, hedge detection). Use for structured JSON outputs in the AI decision parser and prompt engineering for conservative strategies. License: MIT (flexible).
- **Official Polymarket Agents Framework**: From https://github.com/Polymarket/agents. Borrow utilities for market data fetching, trade execution wrappers, and position reconciliation. Integrate directly into the clob-client handling.
- **OctoBot-Prediction-Market**: From https://github.com/Drakkar-Software/OctoBot-Prediction-Market. Extract API wrappers for Polymarket connections (order signing, FOK execution) and basic arbitrage/copy-trading logic as baseline helpers. Port from Python to TS for the execution loop. Avoid full fork due to GPL and maturity issues.
- **Other Targeted Repos**:
  - MrFadiAi/Polymarket-bot: Risk management code and strategy explanations for the rules gateway.
  - Earthskyorg/Polymarket-Copy-Trading-Bot: Copy-trading patterns as prompt templates.
- **Implementation Guidelines**: Extract snippets locally, adapt to Bun/TS, attribute in code/docs. Focus on AI "brain" (prompts/tools) and execution (signing/FOK). Test in simulation mode. This cuts dev time on Polymarket specifics while keeping the lightweight, deterministic architecture.

## Architecture Inspirations (Adapted from OpenClaw via Jam)

Drawing from OpenClaw's architecture (as adapted by Jam for marketing automation), enhance the system for multi-tenant, always-on AI bots. Key elements borrowed:

- **Small Composable Tools**: Break trading operations into atomic functions (e.g., market_query, position_check, order_place, risk_validate). Clean inputs/outputs for easy chaining.
- **Declarative Recipes**: User strategies as data (not code)—e.g., JSON/YAML workflows from natural language prompts: 1. query_markets(topic) → opportunities; 2. evaluate_probabilities(opportunities) → signals; 3. size_position(signals, rules) → order_params; 4. execute_order(order_params).
- **AI Orchestration**: LLM selects/adapts recipes or composes new ones from tools, ensuring rule adherence.
- **Memory Layer**: Use Supabase (Postgres) for per-user context: trade history, past decisions, lessons (e.g., "last trade failed due to slippage"). Hydrate on each run for continuous "memory" without files.
- **Heartbeat/Triggers**: Inngest for cron-based polling (e.g., every 5-30 min per tier), webhooks (e.g., Polymarket events), or user triggers. Creates "always awake" illusion with ephemeral compute.
- **Sandbox Execution (If Needed)**: For future complex tasks (e.g., external API integrations), use e2b sandboxes—ephemeral, isolated environments. Not core for MVP (trading is API-based), but extensible.

This pattern separates domain logic (trading strategies) from execution, allowing bots to adapt without full rewrites. Adapted for scale: Stateless agents load user context on trigger, persist results, scale to zero when idle.

## MVP Features

- **Bot Creation & AI Selection**:
  - Free-text strategy prompt (with templates/examples)
  - AI Engine Selector (efficient vs. frontier models)
  - Hard-coded rules: max loss (daily/total), max position size, allowed markets/categories, max trades per day
  - **Mandatory Simulation Mode**: 24-hour+ paper-trading with real order-book slippage and position tracking
- **Dashboard**:
  - Real-time P&L, positions, AI "Trade Log" with full reasoning explanations
  - Pause/resume, one-tap emergency stop (freezes bot + optional key revocation guide)
  - Historical trade export (for tax/reporting)
- **Safety & Auth**:
  - Rules enforced strictly at the API gateway layer (no overrides)
  - Private keys encrypted at rest; in-memory signing only
  - Full audit logging of every decision/trade
  - One-click key export and revocation instructions

## Onboarding Flow (High-Friction but Secure)

- Step-by-step guided private key import from Polymarket proxy wallet
  - Dire warnings: "Importing keys grants Polymancer trading access. High risk of total loss. Only import funds you can afford to lose."
  - Video/text guide + Polymarket export instructions
- One-time USDC approval transaction (signed via imported key)
- Credential verification + mandatory 24-hour simulation before live trading
- Post-onboarding: Prominent revocation/export buttons

## Architecture (The Railway Stack — Custodial but Hardened)

**Mobile App (Expo SDK 55 + React Native)**
├── UI Shell & Core: Expo
├── Styling & Components: NativeWind (Tailwind CSS) + gluestack-ui
├── Local Security: Expo SecureStore (temporary onboarding only)
└── Communication: REST/WebSocket → Backend API (dashboard sync, no signing)

**Backend (Bun + TypeScript + Elysia) — Trusted Execution**
├── API Framework: Elysia
├── Auth, Configs & Ledger: Supabase (PostgreSQL + PGCrypto/per-user encrypted private key storage)
├── AI Gateway: Vercel AI SDK + OpenRouter
├── **Durable Execution Engine**: Inngest (reliable scheduling + observability)
├── Signer Service: Isolated, in-memory only key loading for EIP-712 signing (no persistent raw keys)
├── Anomaly Detection: Rate limiting, unusual trade monitoring, admin alerts
├── **Hosting**: Railway
├── **Caching Layer**: Railway Managed Redis (market data firehose)
└── Billing: Polar.sh (Merchant of Record)

## Polymarket Integration

Official `@polymarket/clob-client` SDK used server-side.

**Key Realities & Mitigations**

- Per-order EIP-712 signing requires private key → encrypted storage + in-memory use only
- Native FOK orders for atomic, no-partial-fill execution
- Thin liquidity → AI prompted for conservative sizing, retries, and circuit breakers
- Full user-specific position/P&L tracking via WebSocket subscription
- Post-resolution: Auto-detect resolved markets → notify/prompt for claims (manual or optional auto)

## AI Reasoning Engine

Lightweight custom loop (Nanobot-style, enhanced with OpenClaw patterns):

- Deterministic pipeline with structured JSON output parsing
- Strict token limits, error retry, and fallback to HOLD on ambiguity
- Prompt engineering focused on rule adherence and conservative trading
- Orchestration: LLM selects/adapts declarative recipes or composes from atomic tools

## The Execution Loop (Server-Driven, Always-On)

1. **Data Firehose**: Background service subscribes to Polymarket WebSocket → Redis (5s TTL + REST fallback)
2. **Trigger**: Inngest schedules per tier (5–30 min), handles cron/webhooks/user events
3. **Context Build**: Pull latest prices, user positions, rules; hydrate memory from Supabase (history, past runs)
4. **The Brain**: Prompt selected model via OpenRouter to orchestrate recipe/tools
5. **Decision Parser**: Extract structured BUY/SELL/HOLD + parameters
6. **Gateway**: Strictly validate against all risk rules (reject + log if violated)
7. **Execution**: Load encrypted key → sign → submit FOK order
8. **Record & Notify**: Log in Supabase (update memory) → real-time WebSocket push to app dashboard

## Monetization & Cost Control

Flat-fee subscriptions with strict guardrails:

- **Freemium / Paper Trading**: Unlimited simulation, local/light models
- **Basic Tier ($12/mo)**: Efficient models, 30-min polling, moderate limits
- **Pro Tier ($29/mo)**: Frontier models (Claude 3.5/GPT-4o), 5-min polling, higher limits
- Strict `max_tokens`, tier-based rate limits, and cost monitoring to prevent runaway bills

## Risks & Disclaimers (Non-Negotiable — Shown Everywhere)

- **Custodial Risk**: Polymancer holds encrypted private keys for automation. Breach or misuse could result in total loss of funds.
- Key import is dangerous and irreversible without export.
- No guarantees of profitability — bots can and will lose money.
- Prediction markets involve high risk; possible total loss.
- Geoblocking for restricted regions (US, etc.).
- Not financial advice; users trade at own risk.
- Future: Planned trustless on-device mode (limited frequency) for maximum security.

## Roadmap (Post-MVP)

- Trustless lite mode (on-device signing, foreground-required)
- Historical backtesting
- Prompt library/community sharing
- Auto-claim winnings
- Insurance fund from fees
- Open-source parts for transparency
