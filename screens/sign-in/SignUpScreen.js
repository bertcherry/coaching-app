import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform, Link } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';

export default function SignUpScreen() {
    const [email, onChangeEmail] = React.useState('');
    const [accessCode, onChangeAccessCode] = React.useState('');
    const [password, onChangePassword] = React.useState('');
    const [passwordRepeat, onChangePasswordRepeat] = React.useState('');

    const navigation = useNavigation();

    const onRegisterPressed = async () => {
      const res = await fetch('https://auth-worker.bert-m-cherry.workers.dev/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fname, lname, accessCode }),
      });
      if (res.ok) navigation.navigate('Confirm Email');
      else {
        const err = await res.json();
        Alert.alert('Error', err.error);
      }
    };

    const onTermsOfUsePressed = () => {
      //link to external page on website
    };
    const onPrivacyPressed = () => {
      //link to external page on website
    };
    const onWaiverPressed = () => {
      //link to external page on website
    };
    const onSignInPressed = () => {
      navigation.navigate('Sign In');
    };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.regularText}>Create an account</Text>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TextInput 
                value={email}
                onChangeText={onChangeEmail}
                placeholder='email'
                keyboardType='email-address'
                style={styles.input}
            />
            <TextInput 
                value={accessCode}
                onChangeText={onChangeAccessCode}
                placeholder='access code'
                secureTextEntry={true}
                style={styles.input}
            />
            <TextInput 
                value={password}
                onChangeText={onChangePassword}
                placeholder='password'
                secureTextEntry={true}
                style={styles.input}
            />
            <TextInput 
                value={passwordRepeat}
                onChangeText={onChangePasswordRepeat}
                placeholder='confirm password'
                secureTextEntry={true}
                style={styles.input}
            />
            <CustomButton onPress={onRegisterPressed} text="Register"></CustomButton>
            <Text style={styles.smallText}>By registering you confirm agreement to our{' '}
              <Text style={styles.link} onPress={onTermsOfUsePressed}>Terms of Use</Text> and{' '}
              <Text style={styles.link} onPress={onPrivacyPressed}>Privacy Policy</Text>. Clients are reminded of their agreement to the{' '}
              <Text style={styles.link} onPress={onWaiverPressed}>coaching waiver</Text>.
            </Text>
            <CustomButton onPress={onSignInPressed} text="Have an account? Sign in" type="TERTIARY"></CustomButton>
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
    padding: 30,
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
    fontSize: 14,
    padding: 8,
    marginVertical: 8,
    color: '#fae9e9',
    textAlign: 'center',
  },
  link: {
    color: '#fba8a0'
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
