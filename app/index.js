import { Text, View } from "react-native";

import CoachingHeader from "../components/CoachingHeader";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fffccc',
      }}
    >
      <CoachingHeader />
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}
