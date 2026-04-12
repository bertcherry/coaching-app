import * as React from 'react';
import { ScrollView, Text, StyleSheet, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import CustomButton from '../../components/Button';
import { useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../../context/ThemeContext';

export default function ResetPasswordScreen() {
    const [code, onChangeCode] = React.useState('');
    const [newPassword, onChangeNewPassword] = React.useState('');

    const navigation = useNavigation();
    const { theme } = useTheme();
    const headerHeight = useHeaderHeight();

    const onSetPressed = () => {
      //update password in back end
      //validate user
      navigation.navigate('Welcome');
    };

    const onSignInPressed = () => {
      navigation.navigate('Sign In');
    };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <Text style={[styles.regularText, { color: theme.textPrimary }]}>Reset your password</Text>
        <TextInput
            value={code}
            onChangeText={onChangeCode}
            placeholder='code'
            placeholderTextColor={theme.inputPlaceholder}
            secureTextEntry={true}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
        />
        <TextInput
            value={newPassword}
            onChangeText={onChangeNewPassword}
            placeholder='new password'
            placeholderTextColor={theme.inputPlaceholder}
            secureTextEntry={true}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
        />
        <CustomButton onPress={onSetPressed} text="Set Password"></CustomButton>
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
