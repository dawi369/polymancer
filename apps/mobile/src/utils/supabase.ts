import type { Database } from "@polymancer/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY are set.",
  );
}

// Provide a mock storage for SSR (web static rendering) if we're on web and window is undefined.
const storage =
  Platform.OS === "web" && typeof window === "undefined" ? null : AsyncStorage;

type SupabaseClientType = ReturnType<typeof createClient<Database>>;
let clientInstance: SupabaseClientType | null = null;

export function getSupabaseClient(): SupabaseClientType {
  if (!clientInstance) {
    clientInstance = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: storage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    });
  }
  return clientInstance;
}

export const supabase = {
  get auth() {
    return getSupabaseClient().auth;
  },
  from<T extends keyof Database["public"]["Tables"]>(
    table: T,
  ): ReturnType<SupabaseClientType["from"]> {
    return getSupabaseClient().from(table);
  },
  rpc(
    fn: string,
    params?: Record<string, unknown>,
  ): ReturnType<SupabaseClientType["rpc"]> {
    return getSupabaseClient().rpc(fn, params as never);
  },
};
