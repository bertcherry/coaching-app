import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import CustomButton from '../components/Button';
import { useNavigation } from '@react-navigation/native';

export default function ResetPasswordScreen() {
    const [code, onChangeCode] = React.useState('');
    const [newPassword, onChangeNewPassword] = React.useState('');

    const navigation = useNavigation();

    const onSetPressed = () => {
      //update password in back end
      //validate user
      navigation.navigate('Welcome');
    };

    const onSignInPressed = () => {
      navigation.navigate('Sign In');
    };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.regularText}>Reset your password</Text>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TextInput 
                value={code}
                onChangeText={onChangeCode}
                placeholder='code'
                secureTextEntry={true}
                style={styles.input}
            />
            <TextInput 
                value={newPassword}
                onChangeText={onChangeNewPassword}
                placeholder='new password'
                secureTextEntry={true}
                style={styles.input}
            />
            <CustomButton onPress={onSetPressed} text="Set Password"></CustomButton>
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
