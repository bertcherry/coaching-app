import { createStackNavigator } from '@react-navigation/stack';
import SignInScreen from '../SignInScreen';
import SignUpScreen from '../SignUpScreen';
import ForgotPasswordScreen from '../ForgotPasswordScreen';
import ResetPasswordScreen from '../ResetPasswordScreen';
import ConfirmEmailScreen from '../ConfirmEmailScreen';

export default function ClientNavigation() {
    const Stack = createStackNavigator();

    return(
        <Stack.Navigator>
            <Stack.Screen name='Sign In' component={SignInScreen} />
            <Stack.Screen name='Register' component={SignUpScreen} />
            <Stack.Screen name='Confirm Email' component={ConfirmEmailScreen} />
            <Stack.Screen name='Forgot Password' component={ForgotPasswordScreen} />
            <Stack.Screen name='Reset Password' component={ResetPasswordScreen} />
        </Stack.Navigator>
    )
}