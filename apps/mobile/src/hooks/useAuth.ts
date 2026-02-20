import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/utils/supabase";
import type { User } from "@polymancer/database";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUser(session.user.id);
      } else {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          fetchUser(session.user.id);
        } else {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUser = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        console.error("Error fetching user:", error);
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    } else {
      setState({
        user: data as User,
        isLoading: false,
        isAuthenticated: true,
      });
    }
  };

  const signInWithApple = useCallback(async () => {
    // TODO: Implement Apple Sign In
    console.log("Apple Sign In - Not implemented");
    return { error: new Error("Not implemented") };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // TODO: Implement Google Sign In
    console.log("Google Sign In - Not implemented");
    return { error: new Error("Not implemented") };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
    return { error };
  }, []);

  return {
    ...state,
    signInWithApple,
    signInWithGoogle,
    signOut,
  };
}
