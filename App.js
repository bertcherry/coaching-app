import { View, StyleSheet, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import SampleWorkout from './screens/SampleWorkout';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import CreateWorkout from './screens/CreateWorkout';
import WorkoutPreview from './screens/WorkoutPreview';

export default function App() {
  const Drawer = createDrawerNavigator();

  return (
    <SafeAreaView style={styles.container}>
      <NavigationContainer>
        <View style={styles.container}>
          <CoachingHeader />
          <Drawer.Navigator>
              <Drawer.Screen name='Welcome' component={WelcomeScreen} />
              <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
              <Drawer.Screen name='Create Workout' component={CreateWorkout} />
              <Drawer.Screen name='Login' component={LoginScreen} />
              <Drawer.Screen name='Workout Preview' component={WorkoutPreview} 
                // options={{drawerItemStyle: {display: 'none'}}} 
                initialParams={{id: 'c8d08b56-1303-41d3-ae6f-8883f2f396b7'}} />
          </Drawer.Navigator>
          <CoachingFooter />
        </View>
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
});