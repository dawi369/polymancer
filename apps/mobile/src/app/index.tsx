import { StyleSheet, Text, View } from "react-native";
import { version } from "@polymancer/database";

console.log("Database linked:", version);

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Edit src/app/index.tsx to edit this screen dev branch.</Text>
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
