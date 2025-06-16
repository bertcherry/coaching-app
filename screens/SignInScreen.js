import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform, Pressable, } from 'react-native';
import CustomButton from '../components/Button';
import SocialSignIn from '../components/SocialSignInButtons';

export default function SignInScreen() {
    const [email, onChangeEmail] = React.useState('');
    const [password, onChangePassword] = React.useState('');
    const [isSignedIn, onSignIn] = React.useState(false);

    const onForgotPasswordPressed = () => {};
    const onSignUpPressed = () => {};

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.regularText}>{isSignedIn ? 'You are signed in' : 'Sign in to continue'}</Text>
      {!isSignedIn && (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TextInput 
                value={email}
                onChangeText={onChangeEmail}
                placeholder='email'
                keyboardType='email-address'
                style={styles.input}
            />
            <TextInput 
                value={password}
                onChangeText={onChangePassword}
                placeholder='password'
                secureTextEntry={true}
                style={styles.input}
            />
            <CustomButton onPress={() => {onSignIn(!isSignedIn)}} text="Sign In"></CustomButton>
            <CustomButton onPress={onForgotPasswordPressed} text="Forgot Password?" type="TERTIARY"></CustomButton>
            <SocialSignIn />
            <CustomButton onPress={onSignUpPressed} text="Don't have an account? Create one" type="TERTIARY"></CustomButton>
        </KeyboardAvoidingView>
      )}
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
    flex: 1,
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 16,
    borderColor: '#fba8a0',
    backgroundColor: '#fae9e9'
  },
});
