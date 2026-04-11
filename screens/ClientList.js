import * as React from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import CustomButton from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ClientList() {
    const navigation = useNavigation();
    const { authFetch } = useAuth();
    const { theme } = useTheme();
    const [clients, setClients] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);

    const fetchClients = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authFetch(
                'https://coaching-app.bert-m-cherry.workers.dev/coach/clients'
            );
            const body = await response.json();
            if (response.ok) {
                setClients(body.clients);
            } else {
                setError(body.error || 'Could not load clients.');
            }
        } catch (err) {
            setError('Network error. Please check your connection.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    // Refresh the list whenever this screen comes into focus (e.g. after adding a client)
    useFocusEffect(fetchClients);

    const goToClientCalendar = (client) => {
        navigation.navigate('Calendar', {
            clientEmail: client.email,
            clientName: `${client.fname} ${client.lname}`,
            clientTimezone: client.timezone ?? 'UTC',
        });
    };

    const renderClient = ({ item }) => (
        <TouchableOpacity
            style={[styles.clientRow, { borderBottomColor: theme.divider }]}
            onPress={() => goToClientCalendar(item)}
        >
            <View style={styles.clientInfo}>
                <Text style={[styles.clientName, { color: theme.textPrimary }]}>{item.fname} {item.lname}</Text>
                <Text style={[styles.clientEmail, { color: theme.textSecondary }]}>{item.email}</Text>
            </View>
            {!item.emailConfirmed && (
                <Text style={[styles.pendingBadge, { color: theme.accent, borderColor: theme.accent }]}>Pending</Text>
            )}
            <Text style={[styles.chevron, { color: theme.textTertiary }]}>›</Text>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Text style={[styles.headingText, { color: theme.textPrimary }]}>Clients</Text>
            <CustomButton onPress={() => navigation.navigate('Add Client')} text="Add Client" type="PRIMARY" />

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
            ) : error ? (
                <Text style={[styles.errorText, { color: theme.accent }]}>{error}</Text>
            ) : clients.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No clients yet. Add one to get started.</Text>
            ) : (
                <FlatList
                    data={clients}
                    keyExtractor={(item) => item.email}
                    renderItem={renderClient}
                    contentContainerStyle={styles.listContent}
                    indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headingText: {
        paddingTop: 30,
        paddingBottom: 10,
        fontSize: 30,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    loader: {
        marginTop: 40,
    },
    errorText: {
        textAlign: 'center',
        padding: 20,
        fontSize: 16,
    },
    emptyText: {
        textAlign: 'center',
        padding: 30,
        fontSize: 16,
        opacity: 0.6,
    },
    listContent: {
        paddingVertical: 8,
    },
    clientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    clientInfo: {
        flex: 1,
    },
    clientName: {
        fontSize: 18,
        fontWeight: '600',
    },
    clientEmail: {
        fontSize: 13,
        marginTop: 2,
    },
    pendingBadge: {
        fontSize: 11,
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginRight: 8,
    },
    chevron: {
        fontSize: 24,
        opacity: 0.4,
    },
});
