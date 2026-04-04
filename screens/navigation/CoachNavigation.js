import { createDrawerNavigator } from '@react-navigation/drawer';
import CreateWorkout from '../CreateWorkout';
import WorkoutPreview from '../WorkoutPreview';
import WelcomeScreen from '../WelcomeScreen';
import SampleWorkout from '../SampleWorkout';

export default function CoachNavigation() {
    const Drawer = createDrawerNavigator();

    return(
        <Drawer.Navigator>
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Create Workout' component={CreateWorkout} //move this to client management pages or have dropdown to assign to a client
                />
            <Drawer.Screen name='Client List' component={ClientList} //build this, put addclient screen on it
                />
            <Drawer.Screen name='Workout Preview' component={WorkoutPreview} 
                // options={{drawerItemStyle: {display: 'none'}}} 
                initialParams={{id: 'c8d08b56-1303-41d3-ae6f-8883f2f396b7'}} />
        </Drawer.Navigator>
    )
}
