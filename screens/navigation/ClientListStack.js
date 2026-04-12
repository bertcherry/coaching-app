import React from 'react';
import { Pressable, Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { DrawerActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../context/ThemeContext';
import ClientList from '../ClientList';
import AddClientScreen from '../AddClientScreen';
import CreateWorkout from '../CreateWorkout';

const Stack = createStackNavigator();

export default function ClientListStack() {
    const { theme } = useTheme();

    return (
        <Stack.Navigator
            screenOptions={({ navigation }) => ({
                headerStyle: { backgroundColor: theme.surfaceElevated, height: Platform.select({ ios: 44, android: 48 }) },
                headerTintColor: theme.textPrimary,
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
            <Stack.Screen
                name="ClientListHome"
                component={ClientList}
                options={{ title: 'Client List', headerLeft: () => null }}
            />
            <Stack.Screen name="Add Client" component={AddClientScreen} />
            <Stack.Screen name="Create Workout" component={CreateWorkout} />
        </Stack.Navigator>
    );
}
