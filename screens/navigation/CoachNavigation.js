import { createDrawerNavigator } from '@react-navigation/drawer';
import CreateWorkout from '../CreateWorkout';
import WorkoutPreview from '../WorkoutPreview';
import WelcomeScreen from '../WelcomeScreen';
import SampleWorkout from '../SampleWorkout';
import ClientList from '../ClientList';
import CalendarScreen from '../CalendarScreen'; //maybe remove and only route to it from client list for coaches
import TemplateWorkoutsScreen from '../TemplateWorkoutsScreen';
import AppDrawerContent from '../../components/AppDrawerContent';

export default function CoachNavigation() {
    const Drawer = createDrawerNavigator();

    return(
        <Drawer.Navigator 
            drawerContent={(props) => <AppDrawerContent {...props} />} 
            screenOptions={{
                drawerStyle: {
                backgroundColor: '#1a1a1a',
                },
                drawerLabelStyle: {
                color: '#fff',
                },
            }}
        >
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Create Workout' component={CreateWorkout} //move this to client management pages or have dropdown to assign to a client
                />
            <Drawer.Screen name='Client List' component={ClientList} //build this, put addclient screen on it
                />
            <Drawer.Screen name="Template Workouts" component={TemplateWorkoutsScreen} />
            <Drawer.Screen name='Workout Preview' component={WorkoutPreview} 
                // options={{drawerItemStyle: {display: 'none'}}} 
                initialParams={{id: 'c8d08b56-1303-41d3-ae6f-8883f2f396b7'}} />
            <Drawer.Screen name="Calendar" component={CalendarScreen} />
        </Drawer.Navigator>
    )
}
