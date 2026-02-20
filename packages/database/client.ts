import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client — uses service role key, bypasses RLS.
 * Used by apps/api and apps/worker for admin operations.
 */
export function createServerClient(
  url: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
