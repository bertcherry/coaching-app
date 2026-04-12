import * as React from 'react';
import { ScrollView, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';
import { ErrorMessage, Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const initialValues = {
    email: '',
    password: '',
};

const signInSchema = Yup.object().shape({
    email: Yup.string().email('Invalid email').required('Required'),
    password: Yup.string().required('Required'),
});

export default function SignInScreen() {
    const navigation = useNavigation();
    const { signIn } = useAuth();
    const { theme } = useTheme();
    const headerHeight = useHeaderHeight();

    const onForgotPasswordPressed = () => {
        navigation.navigate('Forgot Password');
    };

    const onSignUpPressed = () => {
        navigation.navigate('Register');
    };

    return (
        <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
            <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
                <Text style={[styles.regularText, { color: theme.textPrimary }]}>Sign in to continue</Text>
                <Formik
                    initialValues={initialValues}
                    validationSchema={signInSchema}
                    onSubmit={async (values) => {
                        try {
                            await signIn(values.email, values.password);
                        } catch (e) {
                            Alert.alert('Sign In Failed', e.message);
                        }
                    }}
                >
                    {({ handleChange, handleBlur, handleSubmit, values }) => (
                        <>
                            <TextInput
                                value={values.email}
                                onChangeText={handleChange('email')}
                                onBlur={handleBlur('email')}
                                placeholder='email'
                                placeholderTextColor={theme.inputPlaceholder}
                                keyboardType='email-address'
                                autoCapitalize='none'
                                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
                            />
                            <ErrorMessage name='email' render={msg => <Text style={[styles.errorText, { color: theme.accent }]}>{msg}</Text>} />
                            <TextInput
                                value={values.password}
                                onChangeText={handleChange('password')}
                                onBlur={handleBlur('password')}
                                placeholder='password'
                                placeholderTextColor={theme.inputPlaceholder}
                                secureTextEntry={true}
                                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
                            />
                            <ErrorMessage name='password' render={msg => <Text style={[styles.errorText, { color: theme.accent }]}>{msg}</Text>} />
                            <CustomButton onPress={handleSubmit} text="Sign In" />
                        </>
                    )}
                </Formik>
                <CustomButton onPress={onForgotPasswordPressed} text="Forgot Password?" type="TERTIARY" />
                <CustomButton onPress={onSignUpPressed} text="Don't have an account? Create one" type="TERTIARY" />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    regularText: {
        fontSize: 24,
        padding: 20,
        marginVertical: 8,
        textAlign: 'center',
    },
    input: {
        height: 40,
        margin: 12,
        borderWidth: 1,
        padding: 10,
        fontSize: 16,
    },
    errorText: {
        fontSize: 12,
        fontStyle: 'italic',
        paddingHorizontal: 12,
    },
});
