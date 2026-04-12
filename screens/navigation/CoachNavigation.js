import React from 'react';
import { Pressable } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DrawerActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import CalendarStack from './CalendarStack';
import ClientListStack from './ClientListStack';
import TemplateStack from './TemplateStack';
import CreateWorkout from '../CreateWorkout';
import ToBeFilmedScreen from '../ToBeFilmedScreen';
import SettingsScreen from '../SettingsScreen';
import AppDrawerContent from '../../components/AppDrawerContent';
import { useTheme } from '../../context/ThemeContext';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

function CoachDrawer() {
    const { theme } = useTheme();

    return (
        <Drawer.Navigator
            drawerContent={(props) => <AppDrawerContent {...props} />}
            screenOptions={({ navigation }) => ({
                drawerPosition: 'right',
                drawerStyle: {
                    backgroundColor: theme.surfaceElevated,
                    width: 220,
                },
                drawerLabelStyle: {
                    color: theme.textPrimary,
                },
                drawerActiveTintColor: theme.accent,
                drawerInactiveTintColor: theme.textSecondary,
                headerStyle: { backgroundColor: theme.surfaceElevated },
                headerTintColor: theme.textPrimary,
                headerLeft: () => null,
                headerRight: () => (
                    <Pressable
                        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
                        style={{ marginRight: 16 }}
                    >
                        <Feather name="menu" size={24} color={theme.textPrimary} />
                    </Pressable>
                ),
            })}
        >
            <Drawer.Screen
                name="Client List"
                component={ClientListStack}
                options={{ headerShown: false }}
            />
            <Drawer.Screen
                name="Template Workouts"
                component={TemplateStack}
                options={{ headerShown: false }}
            />
            <Drawer.Screen name="Create Workout" component={CreateWorkout} />
            <Drawer.Screen name="To Be Filmed" component={ToBeFilmedScreen} />
            <Drawer.Screen
                name="My Calendar"
                component={CalendarStack}
                options={{ headerShown: false }}
            />
        </Drawer.Navigator>
    );
}

export default function CoachNavigation() {
    const { theme } = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: theme.surfaceElevated },
                headerTintColor: theme.textPrimary,
            }}
        >
            <Stack.Screen
                name="MainDrawer"
                component={CoachDrawer}
                options={{ headerShown: false }}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
    );
}
