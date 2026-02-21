import { supabase } from "@/src/utils/supabase";
import type { User } from "@polymancer/database";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState, createContext, useContext } from "react";

WebBrowser.maybeCompleteAuthSession();

async function generateNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashNonce(nonce: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithApple: () => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
  }>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const redirectUri = makeRedirectUri({ scheme: "polymancer" });

  const [googleRequest, , googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri,
  });

  const fetchUser = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116" || error.code === "406") {
        setState((s) => ({
          ...s,
          user: null,
          isLoading: false,
          isAuthenticated: true,
        }));
      } else {
        console.error("Error fetching user:", error);
        setState((s) => ({
          ...s,
          user: null,
          isLoading: false,
          isAuthenticated: false,
        }));
      }
    } else {
      setState({
        user: data as User,
        isLoading: false,
        isAuthenticated: true,
      });
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
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
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        if (_event === 'SIGNED_OUT') {
           setState({ user: null, isLoading: false, isAuthenticated: false });
        } else if (session?.user) {
          fetchUser(session.user.id);
        } else {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithApple = useCallback(async (): Promise<{ error: Error | null }> => {
    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        return { error: new Error("Apple Sign In is not available on this device") };
      }

      const rawNonce = await generateNonce();
      const hashedNonce = await hashNonce(rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        return { error: new Error("Missing Apple identity token") };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<{ error: Error | null }> => {
    if (!googleRequest) {
      return { error: new Error("Google auth is not configured") };
    }

    if (
      !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ) {
      return { error: new Error("Missing Google OAuth client IDs") };
    }

    const result = await googlePromptAsync();
    if (result.type !== "success") {
      return { error: new Error("Google sign-in was cancelled") };
    }

    const idToken = result.params.id_token;
    if (!idToken) {
      return { error: new Error("Missing Google id_token") };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    return { error: error ? new Error(error.message) : null };
  }, [googlePromptAsync, googleRequest]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, signInWithApple, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
