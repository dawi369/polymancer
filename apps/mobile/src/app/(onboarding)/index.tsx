import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OnboardingScreen() {
  const router = useRouter();
  
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center px-6">
        <View className="mb-8">
          <Text className="text-4xl font-bold text-gray-900">Welcome to Polymancer</Text>
          <Text className="mt-4 text-lg text-gray-600">
            Your gateway to powerful game management and analytics
          </Text>
        </View>

        <TouchableOpacity
          className="bg-blue-600 py-4 rounded-xl"
          onPress={() => router.replace("/login" as any)}
        >
          <Text className="text-center text-white font-semibold text-lg">Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
