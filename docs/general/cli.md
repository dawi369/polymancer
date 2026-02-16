# 🔮 Polymancer CLI Cheat Sheet

**Run all commands from the repository root.**

### 🛠 Workspace Global

- **Install/Sync All**: `bun install`
- **Nuke & Reinstall**: `rm -rf node_modules && bun install`

### 📱 Mobile (Expo)

- **Start Dev**: `bun --filter @polymancer/mobile start`
- **Clear Cache**: `bun --filter @polymancer/mobile start -c`
- **Install Package**: `bun add --filter @polymancer/mobile [pkg]`
- **iOS Build**: `cd apps/mobile && eas build --platform ios`

### ⚙️ Backend (Elysia)

- **Start Dev**: `bun --filter @polymancer/api dev`
- **Install Package**: `bun add --filter @polymancer/api [pkg]`
- **Test Local**: `curl http://localhost:3000`

### 📦 Database (Shared)

- **Edit Types**: Modify `packages/database/index.ts`
- **Supabase Sync**: `npx supabase gen types typescript --project-id [id] > packages/database/schema.ts`

### 🚀 Railway (Deploy)

- **Login**: `railway login`
- **Deploy Backend**: `cd apps/api && railway up`
