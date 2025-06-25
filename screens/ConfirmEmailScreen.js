import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import CustomButton from '../components/Button';
import { useNavigation } from '@react-navigation/native';

export default function ConfirmEmailScreen() {
    const [confirmationCode, onChangeConfirmationCode] = React.useState('');
    
    const navigation = useNavigation();

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
    <ScrollView style={styles.container}>
      <Text style={styles.regularText}>Confirm your email</Text>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TextInput 
                value={confirmationCode}
                onChangeText={onChangeConfirmationCode}
                placeholder='confirmation code'
                secureTextEntry={true}
                style={styles.input}
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
