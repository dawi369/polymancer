import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ButtonText } from "@/src/components/ui/button";

export default function Onboarding1() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1" />
      <View className="px-6 pb-10">
        <Button onPress={() => router.push("/(onboarding)/2")}>
          <ButtonText>Next</ButtonText>
        </Button>
      </View>
    </SafeAreaView>
  );
}
