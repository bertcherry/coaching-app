import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';

export default function App() {
  return (
    <View style={styles.container}>
      <CoachingHeader />
      <Text>Open up App.js to start working on your app!</Text>
      <StatusBar style="auto" />
      <CoachingFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
});
