import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import CalendarStack from './CalendarStack';
import SettingsScreen from '../SettingsScreen';
import AppDrawerContent from '../../components/AppDrawerContent';
import { useTheme } from '../../context/ThemeContext';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

function ClientDrawer() {
    const { theme } = useTheme();

    return (
        <Drawer.Navigator
            drawerContent={(props) => <AppDrawerContent {...props} />}
            screenOptions={{
                drawerPosition: 'right',
                drawerStyle: {
                    backgroundColor: theme.surfaceElevated,
                    width: 200,
                },
                drawerLabelStyle: {
                    color: theme.textPrimary,
                },
                drawerActiveTintColor: theme.accent,
                drawerInactiveTintColor: theme.textSecondary,
            }}
        >
            <Drawer.Screen
                name="Home"
                component={CalendarStack}
                options={{ headerShown: false }}
            />
        </Drawer.Navigator>
    );
}

export default function ClientNavigation() {
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
                component={ClientDrawer}
                options={{ headerShown: false }}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
    );
}
