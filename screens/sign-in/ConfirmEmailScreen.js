import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform, Alert } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../../context/ThemeContext';

export default function ConfirmEmailScreen() {
    const [confirmationCode, onChangeConfirmationCode] = React.useState('');

    const navigation = useNavigation();
    const route = useRoute();
    const email = route?.params?.email || '';
    const { theme } = useTheme();
    const headerHeight = useHeaderHeight();

    const onConfirmPressed = async () => {
      const res = await fetch('https://coaching-app.bert-m-cherry.workers.dev/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: confirmationCode, email }),
      });
      if (res.ok) navigation.navigate('Welcome');
      else {
        const err = await res.json();
        Alert.alert('Error', err.error);
      }
    };

    const onResendPressed = async () => {
      await fetch('https://coaching-app.bert-m-cherry.workers.dev/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    };

    const onSignInPressed = () => {
      navigation.navigate('Sign In');
    };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <Text style={[styles.regularText, { color: theme.textPrimary }]}>Confirm your email</Text>
        <TextInput
            value={confirmationCode}
            onChangeText={onChangeConfirmationCode}
            placeholder='confirmation code'
            placeholderTextColor={theme.inputPlaceholder}
            secureTextEntry={true}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
        />
        <CustomButton onPress={onConfirmPressed} text="Confirm"></CustomButton>
        <CustomButton onPress={onResendPressed} text="Resend Code" type="SECONDARY"></CustomButton>
        <CustomButton onPress={onSignInPressed} text="Back to sign in" type="TERTIARY"></CustomButton>
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
    flex: 1,
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 16,
  },
});
