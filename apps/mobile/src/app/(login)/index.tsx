import { useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const router = useRouter();
  const [isSignInOpen, setIsSignInOpen] = useState<boolean>(false);

  const openSignIn = (): void => {
    setIsSignInOpen(true);
  };

  const closeSignIn = (): void => {
    setIsSignInOpen(false);
  };

  const handleAppleLogin = (): void => {
    console.log("Apple Sign In - Placeholder");
    setIsSignInOpen(false);
    router.push("/(onboarding)/1");
  };

  const handleGoogleLogin = (): void => {
    console.log("Google Sign In - Placeholder");
    setIsSignInOpen(false);
    router.push("/(onboarding)/1");
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-espresso">
      <View className="flex-1 px-6 justify-between">
        <View className="pt-12">
          <Text className="text-3xl font-extrabold text-espresso dark:text-cream tracking-widest mb-3">
            POLYMANCER
          </Text>
          <Text className="text-base text-midtone">
            Summon your 24/7 Polymarket trader
          </Text>
        </View>

        <View className="pb-10">
          <TouchableOpacity
            className="bg-espresso dark:bg-cream py-4 rounded-xl items-center"
            onPress={openSignIn}
          >
            <Text className="text-base font-semibold text-cream dark:text-espresso">
              Get Started
            </Text>
          </TouchableOpacity>

          <Pressable className="mt-4 items-center" onPress={openSignIn}>
            <Text className="text-sm text-midtone">
              Already have an account?{" "}
              <Text className="font-semibold text-espresso dark:text-cream">
                Sign in
              </Text>
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal
        transparent
        animationType="slide"
        visible={isSignInOpen}
        onRequestClose={closeSignIn}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={closeSignIn}
        >
          <Pressable
            className="bg-cream dark:bg-espresso px-6 pt-4 pb-8 rounded-t-3xl"
            onPress={(): void => {}}
          >
            <View className="items-center mb-6">
              <View className="w-12 h-1 rounded-full bg-midtone/40" />
            </View>

            <Text className="text-lg font-semibold text-espresso dark:text-cream mb-4">
              Sign in
            </Text>

            <View className="gap-3">
              <TouchableOpacity
                className="bg-espresso dark:bg-cream py-4 rounded-xl items-center"
                onPress={handleAppleLogin}
              >
                <Text className="text-base font-semibold text-cream dark:text-espresso">
                  Continue with Apple
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-cream dark:bg-espresso border border-midtone py-4 rounded-xl items-center"
                onPress={handleGoogleLogin}
              >
                <Text className="text-base font-semibold text-espresso dark:text-cream">
                  Continue with Google
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
