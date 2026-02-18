import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-espresso">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-2xl font-extrabold text-espresso dark:text-cream tracking-widest">
          POLYMANCER
        </Text>
        <Text className="text-sm text-midtone mt-1">
          Your trading bot is ready
        </Text>
      </View>

      <View className="flex-1 px-6 gap-4">
        <View className="bg-white dark:bg-white/10 p-5 rounded-2xl">
          <Text className="text-xs text-midtone uppercase tracking-wider mb-2">
            Bot Status
          </Text>
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <Text className="text-lg font-semibold text-espresso dark:text-cream">
              Active
            </Text>
          </View>
        </View>

        <View className="bg-white dark:bg-white/10 p-5 rounded-2xl">
          <Text className="text-xs text-midtone uppercase tracking-wider mb-2">
            Paper Balance
          </Text>
          <Text className="text-3xl font-bold text-espresso dark:text-cream">
            $1,000.00
          </Text>
        </View>

        <View className="bg-white dark:bg-white/10 p-5 rounded-2xl">
          <Text className="text-xs text-midtone uppercase tracking-wider mb-2">
            Today's P&L
          </Text>
          <Text className="text-2xl font-semibold text-espresso dark:text-cream">
            $0.00
          </Text>
        </View>
      </View>

      <View className="p-6 items-center">
        <Text className="text-sm text-midtone">
          Navigation bar coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}
