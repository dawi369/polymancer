import { StyleSheet, Text, View } from "react-native";
import { version } from "@polymancer/database";

console.log("Database linked:", version);

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>POLYMANCER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
