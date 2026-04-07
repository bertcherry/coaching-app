import * as React from 'react';
import { ScrollView, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';
import { ErrorMessage, Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../../context/AuthContext';

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

    const onForgotPasswordPressed = () => {
        navigation.navigate('Forgot Password');
    };

    const onSignUpPressed = () => {
        navigation.navigate('Register');
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.regularText}>Sign in to continue</Text>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Formik
                    initialValues={initialValues}
                    validationSchema={signInSchema}
                    onSubmit={async (values) => {
                        try {
                            await signIn(values.email, values.password);
                            // no navigate() needed — RootNavigator re-renders automatically
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
                                keyboardType='email-address'
                                autoCapitalize='none'
                                style={styles.input}
                            />
                            <ErrorMessage name='email' render={msg => <Text style={styles.errorText}>{msg}</Text>} />
                            <TextInput
                                value={values.password}
                                onChangeText={handleChange('password')}
                                onBlur={handleBlur('password')}
                                placeholder='password'
                                secureTextEntry={true}
                                style={styles.input}
                            />
                            <ErrorMessage name='password' render={msg => <Text style={styles.errorText}>{msg}</Text>} />
                            <CustomButton onPress={handleSubmit} text="Sign In" />
                        </>
                    )}
                </Formik>
                <CustomButton onPress={onForgotPasswordPressed} text="Forgot Password?" type="TERTIARY" />
                <CustomButton onPress={onSignUpPressed} text="Don't have an account? Create one" type="TERTIARY" />
            </KeyboardAvoidingView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    headerText: {
        padding: 40,
        fontSize: 30,
        color: '#fae9e9',
        textAlign: 'center',
    },
    regularText: {
        fontSize: 24,
        padding: 20,
        marginVertical: 8,
        color: '#fae9e9',
        textAlign: 'center',
    },
    smallText: {
        fontSize: 16,
        padding: 8,
        marginVertical: 8,
        color: '#fae9e9',
        textAlign: 'center',
    },
    input: {
        height: 40,
        margin: 12,
        borderWidth: 1,
        padding: 10,
        fontSize: 16,
        borderColor: '#fba8a0',
        backgroundColor: '#fae9e9',
    },
    errorText: {
        fontSize: 12,
        fontStyle: 'italic',
        paddingHorizontal: 12,
        color: '#fba8a0',
    },
});