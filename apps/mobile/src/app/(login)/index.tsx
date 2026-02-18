import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";

export default function LoginScreen() {
  const router = useRouter();

  const handleAppleLogin = () => {
    console.log("Apple Sign In - Placeholder");
    router.push("/(onboarding)/1");
  };

  const handleGoogleLogin = () => {
    console.log("Google Sign In - Placeholder");
    router.push("/(onboarding)/1");
  };

  return (
    <View className="flex-1 bg-cream dark:bg-espresso px-6 justify-center">
      <View className="items-center mb-12">
        <Text className="text-3xl font-extrabold text-espresso dark:text-cream tracking-widest mb-3">
          POLYMANCER
        </Text>
        <Text className="text-base text-midtone text-center">
          Summon your 24/7 Polymarket trader
        </Text>
      </View>

      <View className="gap-4 mb-8">
        <TouchableOpacity
          className="bg-espresso dark:bg-cream py-4 rounded-xl items-center"
          onPress={handleAppleLogin}
        >
          <Text className="text-base font-semibold text-cream dark:text-espresso">
            Sign in with Apple
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-cream dark:bg-espresso border border-midtone py-4 rounded-xl items-center"
          onPress={handleGoogleLogin}
        >
          <Text className="text-base font-semibold text-espresso dark:text-cream">
            Sign in with Google
          </Text>
        </TouchableOpacity>
      </View>

      <Text className="text-xs text-midtone text-center absolute bottom-12 left-6 right-6">
        By signing in, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}
