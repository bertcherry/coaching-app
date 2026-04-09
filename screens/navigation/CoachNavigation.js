import { createDrawerNavigator } from '@react-navigation/drawer';
import CreateWorkout from '../CreateWorkout';
import WorkoutPreview from '../WorkoutPreview';
import WelcomeScreen from '../WelcomeScreen';
import SampleWorkout from '../SampleWorkout';
import ClientList from '../ClientList';
import CalendarScreen from '../CalendarScreen';
import TemplateWorkoutsScreen from '../TemplateWorkoutsScreen';
import SettingsScreen from '../SettingsScreen';
import AppDrawerContent from '../../components/AppDrawerContent';
import { useTheme } from '../../context/ThemeContext';

export default function CoachNavigation() {
    const Drawer = createDrawerNavigator();
    const { theme } = useTheme();

    return(
        <Drawer.Navigator
            drawerContent={(props) => <AppDrawerContent {...props} />}
            screenOptions={{
                drawerStyle: {
                    backgroundColor: theme.surfaceElevated,
                },
                drawerLabelStyle: {
                    color: theme.textPrimary,
                },
                drawerActiveTintColor: theme.accent,
                drawerInactiveTintColor: theme.textSecondary,
            }}
        >
            <Drawer.Screen name='Welcome' component={WelcomeScreen} />
            <Drawer.Screen name='Sample Workout' component={SampleWorkout} />
            <Drawer.Screen name='Create Workout' component={CreateWorkout} />
            <Drawer.Screen name='Client List' component={ClientList} />
            <Drawer.Screen name="Template Workouts" component={TemplateWorkoutsScreen} />
            <Drawer.Screen name='Workout Preview' component={WorkoutPreview}
                options={{ drawerItemStyle: { display: 'none' } }}
                initialParams={{id: 'c8d08b56-1303-41d3-ae6f-8883f2f396b7'}} />
            <Drawer.Screen name="Calendar" component={CalendarScreen} />
            <Drawer.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ drawerItemStyle: { display: 'none' } }}
            />
        </Drawer.Navigator>
    );
}