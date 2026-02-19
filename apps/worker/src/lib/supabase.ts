import { createServerClient } from "@polymancer/database";

if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

export const supabase = createServerClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
