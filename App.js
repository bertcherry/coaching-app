import SampleWorkout from './screens/SampleWorkout';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';

export default function App() {
  const Drawer = createDrawerNavigator();

  return (
    <NavigationContainer>
        <Drawer.Navigator>
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Login' component={LoginScreen} />
        </Drawer.Navigator>
    </NavigationContainer>
  );
}