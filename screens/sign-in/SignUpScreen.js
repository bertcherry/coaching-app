import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';

export default function SignUpScreen() {
    const [email, onChangeEmail] = React.useState('');
    const [accessCode, onChangeAccessCode] = React.useState('');
    const [password, onChangePassword] = React.useState('');
    const [passwordRepeat, onChangePasswordRepeat] = React.useState('');

    const navigation = useNavigation();
    const { theme } = useTheme();

    const onRegisterPressed = async () => {
      const res = await fetch('https://coaching-app.bert-m-cherry.workers.dev/auth/register', {
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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.regularText, { color: theme.textPrimary }]}>Create an account</Text>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TextInput
                value={email}
                onChangeText={onChangeEmail}
                placeholder='email'
                placeholderTextColor={theme.inputPlaceholder}
                keyboardType='email-address'
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
            />
            <TextInput
                value={accessCode}
                onChangeText={onChangeAccessCode}
                placeholder='access code'
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={true}
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
            />
            <TextInput
                value={password}
                onChangeText={onChangePassword}
                placeholder='password'
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={true}
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
            />
            <TextInput
                value={passwordRepeat}
                onChangeText={onChangePasswordRepeat}
                placeholder='confirm password'
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={true}
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
            />
            <CustomButton onPress={onRegisterPressed} text="Register"></CustomButton>
            <Text style={[styles.smallText, { color: theme.textSecondary }]}>By registering you confirm agreement to our{' '}
              <Text style={[styles.link, { color: theme.accent }]} onPress={onTermsOfUsePressed}>Terms of Use</Text> and{' '}
              <Text style={[styles.link, { color: theme.accent }]} onPress={onPrivacyPressed}>Privacy Policy</Text>. Clients are reminded of their agreement to the{' '}
              <Text style={[styles.link, { color: theme.accent }]} onPress={onWaiverPressed}>coaching waiver</Text>.
            </Text>
            <CustomButton onPress={onSignInPressed} text="Have an account? Sign in" type="TERTIARY"></CustomButton>
        </KeyboardAvoidingView>
    </ScrollView>
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
  smallText: {
    fontSize: 14,
    padding: 8,
    marginVertical: 8,
    textAlign: 'center',
  },
  link: {},
  input: {
    flex: 1,
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 16,
  },
});
