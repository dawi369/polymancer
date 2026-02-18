import { useRouter } from "expo-router";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignupScreen() {
  const router = useRouter();
  
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-12">
        <Text className="text-3xl font-bold text-gray-900">Create Account</Text>
        <Text className="mt-2 text-gray-600">Start your journey with us</Text>

        <View className="mt-8 space-y-4">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Name</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3"
              placeholder="John Doe"
              autoCapitalize="words"
            />
          </View>
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3"
              placeholder="••••••••"
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity
          className="bg-blue-600 py-4 rounded-xl mt-6"
          onPress={() => router.replace("/home" as any)}
        >
          <Text className="text-center text-white font-semibold text-lg">Create Account</Text>
        </TouchableOpacity>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-gray-600">Already have an account? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-blue-600 font-semibold">Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
