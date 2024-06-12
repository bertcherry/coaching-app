import { Text, View } from "react-native";

import CoachingHeader from "../components/CoachingHeader";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "center",
      }}
    >
      <CoachingHeader />
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}
