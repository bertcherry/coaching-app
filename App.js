import { StyleSheet, Text, View } from 'react-native';

import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import WelcomeScreen from './WelcomeScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <CoachingHeader />
        <WelcomeScreen />
      </View>
      <View>
        <CoachingFooter /> 
      </View>
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
  innerContainer: {
    flex: 1,
  }
});
