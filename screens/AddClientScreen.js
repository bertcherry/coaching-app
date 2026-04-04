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

export default function AddClientScreen() {
    const [fname, onChangeFname] = React.useState('');
    const [lname, onChangeLname] = React.useState('');
    const [email, onChangeEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(null); // { name, email } on success

    const { authFetch } = useAuth();

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
            const response = await authFetch('https://auth-worker.bert-m-cherry.workers.dev/coach/add-client', {
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
            <ScrollView style={styles.container}>
                <View style={styles.successContainer}>
                    <Text style={styles.successIcon}>✓</Text>
                    <Text style={styles.headerText}>Client Added</Text>
                    <Text style={styles.regularText}>{success.name}</Text>
                    <Text style={styles.smallText}>
                        An invitation with their access code has been sent to:
                    </Text>
                    <Text style={styles.emailText}>{success.email}</Text>
                    <Text style={styles.smallText}>
                        They can sign up using that code. You'll be set as their coach automatically.
                    </Text>
                    <CustomButton onPress={onAddAnother} text="Add Another Client" />
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.headerText}>Add a Client</Text>
            <Text style={styles.smallText}>
                We'll create their account and email them an access code to sign up.
            </Text>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <TextInput
                    value={fname}
                    onChangeText={onChangeFname}
                    placeholder="first name"
                    autoCapitalize="words"
                    style={styles.input}
                />
                <TextInput
                    value={lname}
                    onChangeText={onChangeLname}
                    placeholder="last name"
                    autoCapitalize="words"
                    style={styles.input}
                />
                <TextInput
                    value={email}
                    onChangeText={onChangeEmail}
                    placeholder="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                />
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#fba8a0" />
                        <Text style={styles.smallText}>Sending invitation...</Text>
                    </View>
                ) : (
                    <CustomButton onPress={onAddClientPressed} text="Add Client & Send Invite" />
                )}
            </KeyboardAvoidingView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    successContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 60,
    },
    successIcon: {
        fontSize: 64,
        color: '#7bb533',
        marginBottom: 10,
    },
    headerText: {
        padding: 20,
        paddingTop: 30,
        fontSize: 28,
        color: '#fae9e9',
        textAlign: 'center',
    },
    regularText: {
        fontSize: 20,
        padding: 8,
        color: '#fae9e9',
        textAlign: 'center',
    },
    smallText: {
        fontSize: 14,
        padding: 8,
        marginVertical: 4,
        color: '#fae9e9',
        textAlign: 'center',
    },
    emailText: {
        fontSize: 16,
        padding: 8,
        color: '#fba8a0',
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
        borderColor: '#fba8a0',
        backgroundColor: '#fae9e9',
    },
});