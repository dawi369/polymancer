import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from "@/src/components/ui/actionsheet";
import { Button, ButtonText } from "@/src/components/ui/button";
import { useAuth } from "@/src/hooks/useAuth";

export default function LoginScreen() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { signInWithApple, signInWithGoogle } = useAuth();

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const handleAppleLogin = async (): Promise<void> => {
    const { error } = await signInWithApple();
    if (!error) {
      handleClose();
      router.push("/(onboarding)/1");
    }
  };

  const handleGoogleLogin = async (): Promise<void> => {
    const { error } = await signInWithGoogle();
    if (!error) {
      handleClose();
      router.push("/(onboarding)/1");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-between">
        <View className="pt-12">
          <Text className="text-3xl font-extrabold text-foreground tracking-widest mb-3">
            POLYMANCER
          </Text>
          <Text className="text-base text-midtone">
            Summon your 24/7 Polymarket trader
          </Text>
        </View>

        <View className="pb-10">
          <Button onPress={handleOpen}>
            <ButtonText>Get Started</ButtonText>
          </Button>
        </View>
      </View>

      <Actionsheet isOpen={isOpen} onClose={handleClose}>
        <ActionsheetBackdrop />
        <ActionsheetContent>
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>

          <View className="px-4 py-6 gap-3">
            <Button onPress={handleAppleLogin}>
              <ButtonText>Continue with Apple</ButtonText>
            </Button>

            <Button variant="outline" onPress={handleGoogleLogin}>
              <ButtonText>Continue with Google</ButtonText>
            </Button>
          </View>
        </ActionsheetContent>
      </Actionsheet>
    </SafeAreaView>
  );
}
