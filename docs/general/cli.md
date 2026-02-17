# Polymancer CLI Cheat Sheet

Run all commands from the repository root unless noted.

## Workspace

- Install dependencies: `bun install`
- Reinstall cleanly: `rm -rf node_modules && bun install`

## Mobile (Expo)

- Start dev server: `cd apps/mobile && bun start`
- Clear cache: `cd apps/mobile && bun start -c`
- Install package: `cd apps/mobile && bun add [pkg]`
- iOS build: `cd apps/mobile && eas build --platform ios`

## API (Elysia)

- Start dev server: `cd apps/api && bun run dev`
- Install package: `cd apps/api && bun add [pkg]`
- Test local: `curl http://localhost:3000`

## Database (Shared)

- Edit types: `packages/database/index.ts`
- Supabase type sync: `npx supabase gen types typescript --project-id [id] > packages/database/schema.ts`

## Worker

- Start worker dev: `cd apps/worker && bun run dev`
