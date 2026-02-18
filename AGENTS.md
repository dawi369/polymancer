# AGENTS.md - Polymancer Development Guidelines

Guidelines for agentic coding agents working in this repository.

## Project Structure

```
polymancer/
├── apps/
│   ├── api/          # Bun + Elysia backend API
│   └── mobile/       # Expo (React Native) mobile app
├── packages/
│   └── database/     # Shared database types/schemas
└── docs/             # Documentation
```

## Commands

### Root
```bash
bun install         # Install dependencies
bun run dev         # Run all packages dev mode
```

### API (Bun + Elysia)
```bash
cd apps/api
bun run dev         # Development server
bun test            # Run all tests
bun test src/services/user.test.ts    # Run single test file
bun test --test-name-pattern="should"  # Run tests by name
bunx tsc --noEmit   # Type check
```

### Mobile (Expo)
```bash
cd apps/mobile
bun start           # Start Expo dev server
bun web             # Run on web
bun ios             # Run on iOS (requires macOS + Xcode)
bun android         # Run on Android
bun lint            # Run ESLint
bunx tsc --noEmit   # Type check
```

### Database Package
```bash
cd packages/database
bunx tsc --noEmit   # Type check
```

## Code Style

### General
- **Language**: TypeScript throughout (except config files)
- **Runtime**: Bun (do not use npm/yarn)
- **Formatting**: Use project ESLint/Prettier settings
- **Line endings**: LF (Unix-style)

### TypeScript
- Always use explicit types for function parameters and return types
- Prefer interfaces over types for object shapes
- Never use `any` - use `unknown` when type is truly unknown
- Enable strict TypeScript settings

```typescript
// Good
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### Naming Conventions
- **Files**: kebab-case (e.g., `user-service.ts`)
- **Components/Classes**: PascalCase (e.g., `UserService`)
- **Functions/variables**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE for compile-time constants
- **Interfaces**: PascalCase without `I` prefix (e.g., `User`, `OrderItem`)

### Imports
Order: external libs → workspace packages → relative paths. Group with empty lines.

```typescript
import { Elysia } from "elysia";                    // 1. External
import { type DbUser } from "@polymancer/database"; // 2. Workspace
import { logger } from "../utils/logger";           // 3. Relative
```

### Error Handling
- Use custom error classes for domain-specific errors
- Never swallow errors silently
- Include error messages and context

```typescript
class MarketDataError extends Error {
  constructor(message: string, public readonly marketId: string) {
    super(message);
    this.name = "MarketDataError";
  }
}
```

### React/React Native
- Use functional components with hooks
- Prefer composition over inheritance
- Keep components small and focused
- Follow Expo Router conventions for file-based routing

### Elysia API
- Use TypeBox for runtime type validation
- Group routes by domain
- Return structured responses

```typescript
import { t } from "elysia";

export const userRoutes = new Elysia({ prefix: "/users" }).get(
  "/:id",
  async ({ params }) => {
    const user = await userService.findById(params.id);
    if (!user) throw new Error("User not found");
    return user;
  },
  { params: t.Object({ id: t.String({ format: "uuid" }) }) }
);
```

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

### Testing
- Write tests alongside code (test file next to source)
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies

### Comments
- Write self-documenting code - prefer clear names over comments
- Use comments to explain WHY, not WHAT
- Document complex business logic
- Never leave commented-out code in production

## Environment Variables

- Never commit secrets to repository
- Use `.env` files for local development
- Use `process.env` with type guards

```typescript
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}
```

## Git Conventions

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Keep commits atomic and focused
- Never commit directly to main

## Notes

- Follow existing code style in each package
- Mobile uses ESLint + Expo linting
- API uses Bun's built-in tooling
- Check `docs/` folder for architectural decisions
- When in doubt, ask the user for clarification
