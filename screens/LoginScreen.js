import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform, Pressable, } from 'react-native';

export default function LoginScreen() {
    const [email, onChangeEmail] = React.useState('');
    const [password, onChangePassword] = React.useState('');
    const [isLoggedIn, onLogin] = React.useState(false);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerText}>Welcome to Cherry Coaching</Text>
      <Text style={styles.regularText}>{isLoggedIn ? 'You are logged in' : 'Login to continue'}</Text>
      {!isLoggedIn && (
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
            <Pressable style={styles.button} onPress={() => {onLogin(!isLoggedIn)}}>
                <Text style={styles.buttonText}>Login</Text>
            </Pressable>
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
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginVertical: 8,
    backgroundColor: '#fba8a0',
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 24,
    color: 'black',
    textAlign: 'center',
  },
});
