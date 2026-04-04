import { createDrawerNavigator } from '@react-navigation/drawer';
import WorkoutPreview from '../WorkoutPreview';
import WelcomeScreen from '../WelcomeScreen';
import SampleWorkout from '../SampleWorkout';

export default function ClientNavigation() {
    const Drawer = createDrawerNavigator();

    return(
        <Drawer.Navigator
            //decide the best navigation schema for the sign in navigation portion
        >
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Workout Preview' component={WorkoutPreview} 
                // options={{drawerItemStyle: {display: 'none'}}} 
                initialParams={{id: 'c8d08b56-1303-41d3-ae6f-8883f2f396b7'}} />
        </Drawer.Navigator>
    )
}