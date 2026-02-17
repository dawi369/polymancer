

██████╗  ██████╗ ██╗  ██╗   ██╗███╗   ███╗ █████╗ ███╗   ██╗ ██████╗███████╗██████╗ 
██╔══██╗██╔═══██╗██║  ╚██╗ ██╔╝████╗ ████║██╔══██╗████╗  ██║██╔════╝██╔════╝██╔══██╗
██████╔╝██║   ██║██║   ╚████╔╝ ██╔████╔██║███████║██╔██╗ ██║██║     █████╗  ██████╔╝
██╔═══╝ ██║   ██║██║    ╚██╔╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║██║     ██╔══╝  ██╔══██╗
██║     ╚██████╔╝███████╗██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║╚██████╗███████╗██║  ██║
╚═╝      ╚═════╝ ╚══════╝╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝  ╚═╝


Summon your 24/7 Polymarket trading agent.

## Documentation

See the [`docs/`](./docs) folder for complete project documentation:

- **[architecture.md](./docs/architecture.md)** - System architecture (start here)
- **[design-spec.md](./docs/design-spec.md)** - MVP product requirements
- **[agent-schema.md](./docs/agent-schema.md)** - Agent architecture and behavior
- **[tech-spec.md](./docs/tech-spec.md)** - Technical implementation details
- **[db-specs.md](./docs/db-specs.md)** - Database specifications

## Quick Overview

Polymancer is a paper-only MVP that lets non-technical users summon a 24/7 prediction market trading agent. The system uses:

- **Polyseer** as a research tool (multi-agent AI for market analysis)
- **pmxt SDK** for unified Polymarket/Kalshi market access
- **Decision Agent** (our code) - lightweight orchestration layer
- **Bun + Elysia** backend with **Expo** mobile app

## Repository Structure

```
polymancer/
├── apps/
│   ├── api/                # Bun + Elysia API
│   │   └── depends on: pmxtjs (bun), @polymancer/agent-core
│   ├── worker/             # Bun background worker
│   │   └── depends on: pmxtjs (bun), @polymancer/agent-core
│   └── mobile/             # Expo (React Native) app
├── packages/
│   ├── agent-core/         # Decision Agent (our code)
│   ├── polyseer/           # Git submodule (Polyseer research tool)
│   ├── pamela-core/        # Ported: News/signals from Pamela
│   └── database/           # Supabase types/schema
└── docs/                   # Documentation
```

**Note**: `pmxt` is from bun (`pmxtjs`), not a local package. Install with `bun add pmxtjs`.

## Development

See individual app/package READMEs for development instructions.

> **Note**: This is an MVP in active development. Architecture has been clarified after tech stack evaluation (see docs).
