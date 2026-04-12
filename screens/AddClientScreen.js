import * as React from 'react';
import {
    ScrollView,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    TextInput,
    Platform,
    View,
    Alert,
    ActivityIndicator,
} from 'react-native';
import CustomButton from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';

export default function AddClientScreen() {
    const [fname, onChangeFname] = React.useState('');
    const [lname, onChangeLname] = React.useState('');
    const [email, onChangeEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(null); // { name, email } on success

    const { authFetch } = useAuth();
    const { theme } = useTheme();
    const scrollY = useScrollY();
    const headerHeight = useHeaderHeight();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));

    const onAddClientPressed = async () => {
        if (!fname.trim() || !lname.trim() || !email.trim()) {
            Alert.alert('Missing Fields', 'Please fill in all fields before adding a client.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }

        setLoading(true);
        try {
            const response = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/coach/add-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fname: fname.trim(),
                    lname: lname.trim(),
                    email: email.trim().toLowerCase(),
                }),
            });

            const body = await response.json();

            if (response.ok) {
                setSuccess({ name: `${fname.trim()} ${lname.trim()}`, email: email.trim() });
                onChangeFname('');
                onChangeLname('');
                onChangeEmail('');
            } else {
                Alert.alert('Error', body.error || 'Could not add client. Try again.');
            }
        } catch (error) {
            Alert.alert('Error', 'Network error. Please check your connection.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const onAddAnother = () => {
        setSuccess(null);
    };

    if (success) {
        return (
            <ScrollView style={[styles.container, { backgroundColor: theme.background }]} onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)} scrollEventThrottle={16}>
                <View style={styles.successContainer}>
                    <Text style={[styles.successIcon, { color: theme.success }]}>✓</Text>
                    <Text style={[styles.headerText, { color: theme.textPrimary }]}>Client Added</Text>
                    <Text style={[styles.regularText, { color: theme.textPrimary }]}>{success.name}</Text>
                    <Text style={[styles.smallText, { color: theme.textSecondary }]}>
                        An invitation with their access code has been sent to:
                    </Text>
                    <Text style={[styles.emailText, { color: theme.accent }]}>{success.email}</Text>
                    <Text style={[styles.smallText, { color: theme.textSecondary }]}>
                        They can sign up using that code. You'll be set as their coach automatically.
                    </Text>
                    <CustomButton onPress={onAddAnother} text="Add Another Client" />
                </View>
            </ScrollView>
        );
    }

    return (
        <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
            <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
                <Text style={[styles.headerText, { color: theme.textPrimary }]}>Add a Client</Text>
                <Text style={[styles.smallText, { color: theme.textSecondary }]}>
                    We'll create their account and email them an access code to sign up.
                </Text>
                <TextInput
                    value={fname}
                    onChangeText={onChangeFname}
                    placeholder="first name"
                    placeholderTextColor={theme.inputPlaceholder}
                    autoCapitalize="words"
                    style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
                />
                <TextInput
                    value={lname}
                    onChangeText={onChangeLname}
                    placeholder="last name"
                    placeholderTextColor={theme.inputPlaceholder}
                    autoCapitalize="words"
                    style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
                />
                <TextInput
                    value={email}
                    onChangeText={onChangeEmail}
                    placeholder="email"
                    placeholderTextColor={theme.inputPlaceholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText }]}
                />
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={theme.accent} />
                        <Text style={[styles.smallText, { color: theme.textSecondary }]}>Sending invitation...</Text>
                    </View>
                ) : (
                    <CustomButton onPress={onAddClientPressed} text="Add Client & Send Invite" />
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    successContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 60,
    },
    successIcon: {
        fontSize: 64,
        marginBottom: 10,
    },
    headerText: {
        padding: 20,
        paddingTop: 30,
        fontSize: 28,
        textAlign: 'center',
    },
    regularText: {
        fontSize: 20,
        padding: 8,
        textAlign: 'center',
    },
    smallText: {
        fontSize: 14,
        padding: 8,
        marginVertical: 4,
        textAlign: 'center',
    },
    emailText: {
        fontSize: 16,
        padding: 8,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    input: {
        flex: 0,
        height: 40,
        margin: 12,
        borderWidth: 1,
        padding: 10,
        fontSize: 16,
    },
});
