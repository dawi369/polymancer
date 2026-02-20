import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/utils/supabase";
import type { Bot, Position, PaperSession } from "@polymancer/database";

interface BotState {
  bot: Bot | null;
  positions: Position[];
  paperSession: PaperSession | null;
  isLoading: boolean;
  error: Error | null;
}

export function useBot(userId: string | undefined) {
  const [state, setState] = useState<BotState>({
    bot: null,
    positions: [],
    paperSession: null,
    isLoading: true,
    error: null,
  });

  const fetchBotData = useCallback(async () => {
    if (!userId) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // Fetch bot
      const { data: bot, error: botError } = await supabase
        .from("bots")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (botError) throw botError;

      const botData = bot as Bot | null;

      if (botData) {
        // Fetch positions
        const { data: positions, error: positionsError } = await supabase
          .from("positions")
          .select("*")
          .eq("bot_id", botData.id)
          .is("closed_at", null);

        if (positionsError) throw positionsError;

        // Fetch active paper session
        const { data: paperSession, error: sessionError } = await supabase
          .from("paper_sessions")
          .select("*")
          .eq("bot_id", botData.id)
          .is("ended_at", null)
          .single();

        if (sessionError && sessionError.code !== "PGRST116") throw sessionError;

        setState({
          bot: botData,
          positions: (positions || []) as Position[],
          paperSession: paperSession as PaperSession | null,
          isLoading: false,
          error: null,
        });
      } else {
        setState({
          bot: null,
          positions: [],
          paperSession: null,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      setState({
        bot: null,
        positions: [],
        paperSession: null,
        isLoading: false,
        error: error as Error,
      });
    }
  }, [userId]);

  useEffect(() => {
    fetchBotData();
  }, [fetchBotData]);

  const updateBotStatus = useCallback(
    async (status: "active" | "paused") => {
      if (!state.bot) return { error: new Error("No bot found") };

      const { error } = await supabase
        .from("bots")
        .update({ status })
        .eq("id", state.bot.id);

      if (!error) {
        setState((prev) =>
          prev.bot ? { ...prev, bot: { ...prev.bot, status } } : prev
        );
      }

      return { error };
    },
    [state.bot]
  );

  return {
    ...state,
    refresh: fetchBotData,
    updateBotStatus,
  };
}
