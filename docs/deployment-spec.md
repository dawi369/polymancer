# Polymancer Deployment Spec

Deployment and operational details for the MVP. Architecture, data model, and agent behavior live in their respective specs.

## Hosting

- API service: Bun + Elysia on Fly.io.
- Worker service: long-running Bun process on Fly.io.

## Data and Auth

- Supabase Postgres + Auth + job queue.

## External Services

- OpenRouter (decision LLM).
- Valyu API (Polyseer research).
- pmxt SDK v2.8.0 (market data + trading abstraction).
- RevenueCat (billing webhooks).
- Telegram Bot API (chat + phone verification).
- Expo Push (notifications).
- NewsAPI (Pamela news source).

## Deployment Configuration

- Valyu API key configured at deployment level.
- NewsAPI key provided via `NEWS_API_KEY`.
- Provider credentials for OpenRouter, RevenueCat, Telegram, and Expo Push.

## Operational Controls

- API rate limit per user: 60 req/min (tunable).
- AI cost caps: see `docs/tech-spec.md`.
- Backoff on pmxt/API errors.

## Kill Switch

Emergency stop for all trading. See `docs/tech-spec.md` for implementation.

**Access:**
- Endpoint: `POST /admin/kill-switch`
- Protected by admin bearer token
- Persists until explicitly disabled

## Scheduled Jobs (Cron)

**Reconciler:** Runs every minute via cron
- Scans `trade_logs` for `status='pending'` >5 minutes old
- Queries pmxt API for trade status
- Recovers crashed trades or marks failed

**Daily Cost Reset:** Worker handles this per-bot at run start (see `docs/tech-spec.md`)

**Chat Retention:** Purges `chat_messages` older than 90 days (daily)

## Observability and Ops

- Structured JSON logs for each run and decision.
- Health endpoint reports API + DB connectivity.
