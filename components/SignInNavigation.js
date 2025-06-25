import * as React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';

const Stack = createNativeStackNavigator();

export default function SignInNavigation() {
    return (
        <Stack.Navigator screenOptions={{headerShown: false}}>
            <Stack.Screen name='Sign In' component={SignInScreen} />
            <Stack.Screen name='Sign Up' component={SignUpScreen} />
            <Stack.Screen name='Confirm Email' component={ConfirmEmailScreen} />
            <Stack.Screen name='Forgot Password' component={ForgotPasswordScreen} />
            <Stack.Screen name='Reset Password' component={ResetPasswordScreen} />
        </Stack.Navigator>
    );
}