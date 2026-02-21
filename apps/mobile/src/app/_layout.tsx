import "@/global.css";

import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GluestackUIProvider } from "@/src/components/ui/gluestack-ui-provider";
import { AuthProvider } from "@/src/hooks/useAuth";

export default function RootLayout() {
  return (
    <GluestackUIProvider mode="system">
      <SafeAreaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GluestackUIProvider>
  );
}
