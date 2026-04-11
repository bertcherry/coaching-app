import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';

export default function ConfirmEmailScreen() {
    const [confirmationCode, onChangeConfirmationCode] = React.useState('');

    const navigation = useNavigation();
    const { theme } = useTheme();

    const onConfirmPressed = () => {
      //validate code
      navigation.navigate('Welcome');
    };

    const onResendPressed = () => {
      //send a confirmation code to email
    };

    const onSignInPressed = () => {
      navigation.navigate('Sign In');
    };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.regularText, { color: theme.textPrimary }]}>Confirm your email</Text>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
  input: {
    flex: 1,
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 16,
  },
});
