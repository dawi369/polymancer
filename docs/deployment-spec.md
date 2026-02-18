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
- pmxt SDK (market data + trading abstraction).
- RevenueCat (billing webhooks).
- Telegram Bot API (chat).
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

## Observability and Ops

- Structured JSON logs for each run and decision.
- Health endpoint reports API + DB connectivity.
- Kill switch to pause all bots.
