import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TelegramAuth() {
  const router = useRouter();

  const handleConnectTelegram = () => {
    console.log("Connect Telegram - Placeholder");
    router.replace("/(home)");
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-espresso">
      <View className="flex-1 px-8 items-center pt-12">
        <View className="w-24 h-24 rounded-full bg-espresso dark:bg-cream justify-center items-center mb-6">
          <Text className="text-4xl">✈️</Text>
        </View>

        <Text className="text-2xl font-bold text-espresso dark:text-cream text-center mb-3">
          Connect Telegram
        </Text>
        <Text className="text-base text-midtone text-center leading-6 mb-8">
          Link your Telegram account to receive trade alerts, daily summaries,
          and instant notifications about your bot's activity.
        </Text>

        <View className="w-full gap-4">
          <View className="flex-row items-center bg-white dark:bg-white/10 p-4 rounded-xl gap-3">
            <Text className="text-2xl">🔔</Text>
            <Text className="text-sm text-espresso dark:text-cream flex-1">
              Real-time trade alerts
            </Text>
          </View>
          <View className="flex-row items-center bg-white dark:bg-white/10 p-4 rounded-xl gap-3">
            <Text className="text-2xl">📊</Text>
            <Text className="text-sm text-espresso dark:text-cream flex-1">
              Daily performance summaries
            </Text>
          </View>
          <View className="flex-row items-center bg-white dark:bg-white/10 p-4 rounded-xl gap-3">
            <Text className="text-2xl">⚠️</Text>
            <Text className="text-sm text-espresso dark:text-cream flex-1">
              Emergency stop controls
            </Text>
          </View>
        </View>
      </View>

      <View className="px-6 pb-8">
        <TouchableOpacity
          className="bg-espresso dark:bg-cream py-4 rounded-xl items-center mb-3"
          onPress={handleConnectTelegram}
        >
          <Text className="text-base font-semibold text-cream dark:text-espresso">
            Connect Telegram
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="py-3 items-center mb-2"
          onPress={() => router.push("/(home)")}
        >
          <Text className="text-sm text-midtone">Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="py-2 items-center"
          onPress={() => Linking.openURL("https://telegram.org")}
        >
          <Text className="text-xs text-espresso dark:text-cream underline">
            Don't have Telegram? Get it here
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
