import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import SampleWorkout from './screens/SampleWorkout';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';

export default function App() {
  const Drawer = createDrawerNavigator();

  return (
    <NavigationContainer>
      <View style={styles.container}>
        <CoachingHeader />
        <Drawer.Navigator>
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Login' component={LoginScreen} />
        </Drawer.Navigator>
        <CoachingFooter />
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
});