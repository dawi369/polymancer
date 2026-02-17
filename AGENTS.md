# AGENTS.md - Polymancer Development Guidelines

This file provides guidelines and commands for agentic coding agents operating in this repository.

---

## Project Structure

```
polymancer/
├── apps/
│   ├── api/          # Bun + Elysia backend API
│   └── mobile/       # Expo (React Native) mobile app
├── packages/
│   └── database/     # Shared database types/schemas
├── docs/             # Documentation (specs, design docs)
└── package.json      # Workspace root
```

---

## Commands

### Root Commands
```bash
# Install dependencies (uses Bun by default)
bun install

# Run all packages dev (if configured)
bun run dev
```

### API (Bun + Elysia)
```bash
cd apps/api

# Development server with hot reload
bun run dev

# Run tests (currently placeholder)
bun test

# Type check
bunx tsc --noEmit
```

### Mobile (Expo)
```bash
cd apps/mobile

# Start Expo dev server
bun start
# or
bun expo start

# Run on web
bun web

# Run on iOS (requires macOS + Xcode)
bun ios

# Run on Android
bun android

# Lint code
bun lint

# Reset project
bun reset-project

# Type check
bunx tsc --noEmit
```

### Database Package
```bash
cd packages/database

# Type check
bunx tsc --noEmit
```

### Running a Single Test
Tests are currently not configured in this project. When adding tests:
- API tests: Use Bun's built-in test runner (`bun test`)
- Mobile tests: Use Jest or Vitest via Expo

---

## Code Style Guidelines

### General

- **Language**: TypeScript throughout (except config files)
- **Runtime**: Bun (do not use npm or yarn unless explicitly required)
- **Formatting**: Use project ESLint/Prettier settings
- **Line endings**: LF (Unix-style)

### TypeScript

- Always use explicit types for function parameters and return types
- Prefer interfaces over types for object shapes
- Use `strict: true` equivalent settings (via tsconfig references)
- Never use `any` - use `unknown` when type is truly unknown
- Enable `noImplicitAny` in TypeScript config

```typescript
// Good
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Bad
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### Naming Conventions

- **Files**: kebab-case (e.g., `user-service.ts`, `market-data.ts`)
- **Components/Classes**: PascalCase (e.g., `UserService`, `MarketCard`)
- **Functions/variables**: camelCase (e.g., `getUserById`, `isActive`)
- **Constants**: UPPER_SNAKE_CASE for compile-time constants
- **Interfaces**: PascalCase with `I` prefix optional (prefer descriptive names without prefix)
  - Good: `User`, `OrderItem`, `MarketData`
  - Avoid: `IUser`, `IOrderItem`

### Imports

- Use absolute imports via workspace packages when possible
- Order imports: external libs → workspace packages → relative paths
- Use explicit named exports, avoid default exports where possible
- Group imports with empty line between groups

```typescript
// 1. External libraries
import { Elysia } from "elysia";
import { z } from "zod";

// 2. Workspace packages
import { UserService } from "@polymancer/api/services";
import { type DbUser } from "@polymancer/database";

// 3. Relative imports
import { logger } from "../utils/logger";
import { VALIDATION_SCHEMA } from "./constants";
```

### Error Handling

- Use custom error classes for domain-specific errors
- Always include error messages and context
- Never swallow errors silently
- Use Result/Either patterns for operations that can fail

```typescript
// Good
class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly marketId: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

// Good - using Result pattern
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function fetchMarket(id: string): Result<MarketData, MarketDataError> {
  // ...
}
```

### React/React Native (Mobile App)

- Use functional components with hooks
- Prefer composition over inheritance
- Keep components small and focused
- Use TypeScript generics for reusable hooks
- Follow Expo Router conventions for file-based routing

```typescript
// Good - small focused component
function MarketCard({ market }: { market: Market }) {
  return (
    <View>
      <Text>{market.question}</Text>
      <PriceDisplay price={market.yesPrice} />
    </View>
  );
}

// Good - custom hook with generics
function useAsyncState<T>(initialValue: T) {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialValue,
    isLoading: false,
    error: null,
  });
  // ...
}
```

### Elysia API (Backend)

- Use TypeBox for runtime type validation
- Group routes by domain (e.g., `routes/users.ts`, `routes/markets.ts`)
- Use dependency injection for shared logic
- Return structured responses

```typescript
// Good - Elysia route with TypeBox
import { t } from "elysia";

export const userRoutes = new Elysia({ prefix: "/users" }).get(
  "/:id",
  async ({ params }) => {
    const user = await userService.findById(params.id);
    if (!user) throw new Error("User not found");
    return user;
  },
  {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  }
);
```

### Database

- Use the `@polymancer/database` package for shared types
- Prefer type-safe queries (avoid raw SQL when possible)
- Use migrations for schema changes
- Add indexes for frequently queried fields

### File Organization

```
src/
├── routes/        # API route handlers
├── services/      # Business logic
├── middleware/    # Shared middleware
├── utils/         # Helper functions
├── types/         # TypeScript types
└── constants/     # App constants
```

### Comments

- Write self-documenting code - prefer clear names over comments
- Use comments to explain WHY, not WHAT
- Document complex business logic
- TODO comments should include ticket/reference numbers
- Never leave commented-out code in production

### Testing

- Write tests alongside code (test file next to source)
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies

---

## Environment Variables

- Never commit secrets to repository
- Use `.env` files for local development
- Document required env vars in README or docs
- Use `process.env` with type guards

```typescript
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

const DATABASE_URL = getRequiredEnv("DATABASE_URL");
```

---

## Git Conventions

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Keep commits atomic and focused
- Write meaningful commit messages
- Never commit directly to main

---

## Additional Notes

- Follow the existing code style in each package
- Mobile app uses ESLint + Expo linting
- API uses Bun's built-in tooling
- Check `docs/` folder for architectural decisions and specs
- When in doubt, ask the user for clarification
