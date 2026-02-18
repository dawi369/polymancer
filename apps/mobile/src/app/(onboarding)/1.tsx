import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Onboarding1() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-espresso">
      <View className="flex-1 justify-center px-8 items-center">
        <View className="w-28 h-28 rounded-full bg-espresso dark:bg-cream justify-center items-center mb-8">
          <Text className="text-5xl">🤖</Text>
        </View>

        <Text className="text-2xl font-bold text-espresso dark:text-cream text-center mb-4">
          Your 24/7 Trading Agent
        </Text>
        <Text className="text-base text-midtone text-center leading-6">
          Polymancer runs continuously in the background, analyzing markets and
          executing trades based on your strategy — even while you sleep.
        </Text>
      </View>

      <View className="px-6 pb-8">
        <View className="flex-row justify-center gap-2 mb-6">
          <View className="w-6 h-1 rounded-full bg-espresso dark:bg-cream" />
          <View className="w-2 h-1 rounded-full bg-midtone" />
          <View className="w-2 h-1 rounded-full bg-midtone" />
        </View>

        <TouchableOpacity
          className="bg-espresso dark:bg-cream py-4 rounded-xl items-center"
          onPress={() => router.push("/(onboarding)/2")}
        >
          <Text className="text-base font-semibold text-cream dark:text-espresso">
            Next
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
