/**
 * Database types for Polymancer
 * Based on schema defined in docs/tech-spec.md
 */

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone_e164: string | null;
          phone_hash: string | null;
          tier: "trial" | "paid";
          revenuecat_app_user_id: string | null;
          entitlement_status: "active" | "trialing" | "expired" | "canceled" | "inactive";
          entitlement_expires_at: string | null;
          entitlement_product_id: string | null;
          trial_started_at: string | null;
          trial_ends_at: string | null;
          timezone: string;
          notifications_enabled: boolean;
          telegram_linked_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Tables["users"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Tables["users"]["Insert"]>;
        Relationships: [];
      };
      bots: {
        Row: {
          id: string;
          user_id: string;
          status: "active" | "paused" | "error";
          model_id: string | null;
          strategy_prompt: string | null;
          max_daily_loss_usd: number;
          max_position_size_usd: number;
          max_trades_per_day: number;
          slippage_threshold_percent: number;
          daily_ai_cost_usd: number;
          daily_ai_limit_usd: number;
          daily_cost_reset_at: string | null;
          next_run_at: string | null;
          run_interval_hours: number;
          decision_window_seconds: number;
          last_run_at: string | null;
          last_run_status: "success" | "failed" | "partial" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Tables["bots"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Tables["bots"]["Insert"]>;
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          bot_id: string;
          market_id: string;
          token: "yes" | "no";
          total_shares: number;
          average_entry_price: number;
          closed_at: string | null;
          updated_at: string;
        };
        Insert: Omit<Tables["positions"]["Row"], "updated_at">;
        Update: Partial<Tables["positions"]["Insert"]>;
        Relationships: [];
      };
      paper_sessions: {
        Row: {
          id: string;
          bot_id: string;
          starting_balance_usd: number;
          current_balance_usd: number;
          ended_balance_usd: number | null;
          started_at: string;
          ended_at: string | null;
          reset_reason: string | null;
        };
        Insert: Tables["paper_sessions"]["Row"];
        Update: Partial<Tables["paper_sessions"]["Insert"]>;
        Relationships: [];
      };
      telegram_links: {
        Row: {
          id: string;
          user_id: string;
          telegram_user_id: string;
          phone_e164: string;
          phone_hash: string;
          linked_at: string;
          status: "pending" | "linked";
          link_token: string;
          link_expires_at: string;
        };
        Insert: Tables["telegram_links"]["Row"];
        Update: Partial<Tables["telegram_links"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_tier: ["trial", "paid"];
      entitlement_status: ["active", "trialing", "expired", "canceled", "inactive"];
      bot_status: ["active", "paused", "error"];
      token_type: ["yes", "no"];
      telegram_link_status: ["pending", "linked"];
    };
  };
};

// Helper types for common queries
export type Tables = Database["public"]["Tables"];
export type User = Tables["users"]["Row"];
export type Bot = Tables["bots"]["Row"];
export type Position = Tables["positions"]["Row"];
export type PaperSession = Tables["paper_sessions"]["Row"];
export type TelegramLink = Tables["telegram_links"]["Row"];

// Auth types
export type AuthProvider = "apple" | "google";

export interface AuthSession {
  user: User | null;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  } | null;
}
