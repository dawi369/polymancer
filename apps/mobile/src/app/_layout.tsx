import "@/global.css";

import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";

export default function RootLayout() {
  return (
    <GluestackUIProvider mode="system">
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(login)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(telegram)" />
          <Stack.Screen name="(home)" />
        </Stack>
      </SafeAreaProvider>
    </GluestackUIProvider>
  );
}
