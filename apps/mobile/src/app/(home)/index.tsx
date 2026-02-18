import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-6 pt-4">
        <Text className="text-2xl font-bold text-gray-900">Dashboard</Text>
        <Text className="text-gray-600 mt-1">Welcome back!</Text>
      </View>
    </SafeAreaView>
  );
}
