import React from 'react';
import { Pressable } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { DrawerActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../context/ThemeContext';
import CalendarScreen from '../CalendarScreen';
import WorkoutPreview from '../WorkoutPreview';
import WorkoutActiveScreen from '../WorkoutActiveScreen';

const Stack = createStackNavigator();

export default function CalendarStack() {
    const { theme } = useTheme();

    return (
        <Stack.Navigator
            screenOptions={({ navigation }) => ({
                headerStyle: { backgroundColor: theme.surfaceElevated },
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
                name="Calendar"
                component={CalendarScreen}
                options={{ headerLeft: () => null }}
            />
            <Stack.Screen name="Workout Preview" component={WorkoutPreview} />
            <Stack.Screen name="Workout Active" component={WorkoutActiveScreen} />
        </Stack.Navigator>
    );
}
