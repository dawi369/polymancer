import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ButtonText } from "@/src/components/ui/button";

export default function TelegramAuth() {
  const router = useRouter();

  const handleConnect = () => {
    // TODO: Implement Telegram auth
    router.replace("/(home)");
  };

  const handleSkip = () => {
    router.replace("/(home)");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 pt-12">
        <View className="w-24 h-24 rounded-full bg-surface justify-center items-center mb-6 self-center">
          <Text className="text-4xl">✈️</Text>
        </View>

        <Text className="text-2xl font-bold text-foreground text-center mb-3">
          Connect Telegram
        </Text>
        <Text className="text-base text-midtone text-center leading-6 mb-8">
          Link your Telegram account to receive trade alerts, daily summaries,
          and instant notifications about your bot&apos;s activity.
        </Text>
      </View>

      <View className="px-6 pb-8 gap-3">
        <Button onPress={handleConnect}>
          <ButtonText>Connect Telegram</ButtonText>
        </Button>

        <Button variant="ghost" onPress={handleSkip}>
          <ButtonText>Skip for now</ButtonText>
        </Button>
      </View>
    </SafeAreaView>
  );
}
