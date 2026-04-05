/**
 * TemplatePickerOverlay.js
 * Location: components/TemplatePickerOverlay.js
 *
 * Used from the client calendar view when a coach wants to add a workout
 * from an existing template. Shows the 3 most recent templates by default,
 * with search. After selection the coach confirms, then CreateWorkout opens
 * with client + date prefilled.
 *
 * Usage:
 *   <TemplatePickerOverlay
 *     visible={showOverlay}
 *     onClose={() => setShowOverlay(false)}
 *     clientEmail="jane@example.com"
 *     clientName="Jane Doe"
 *     scheduledDate="2026-05-01"       // optional — from calendar day context
 *     navigation={navigation}
 *   />
 */

import * as React from 'react';
import {
    Modal, View, Text, TextInput, FlatList,
    Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';

// ─── Confirm step ─────────────────────────────────────────────────────────────

const ConfirmStep = ({ workout, clientName, scheduledDate, onBack, onConfirm }) => (
    <View style={styles.confirmContainer}>
        <Pressable style={styles.backRow} onPress={onBack}>
            <Feather name="arrow-left" size={18} color="#fba8a0" />
            <Text style={styles.backText}>Back to search</Text>
        </Pressable>

        <Text style={styles.confirmTitle}>Confirm selection</Text>

        <View style={styles.confirmCard}>
            <Text style={styles.confirmWorkoutName}>{workout.workoutName}</Text>
            <Text style={styles.confirmMeta}>
                {workout.data?.length ?? 0} section{workout.data?.length !== 1 ? 's' : ''} · {workout.data?.reduce((a, s) => a + (s.data?.length ?? 0), 0)} exercises
            </Text>
        </View>

        <View style={styles.confirmDetails}>
            <View style={styles.confirmDetailRow}>
                <Feather name="user" size={14} color="#888" />
                <Text style={styles.confirmDetailText}>{clientName}</Text>
            </View>
            {scheduledDate && (
                <View style={styles.confirmDetailRow}>
                    <Feather name="calendar" size={14} color="#888" />
                    <Text style={styles.confirmDetailText}>{scheduledDate}</Text>
                </View>
            )}
        </View>

        <Text style={styles.confirmNote}>
            The workout editor will open with this template and the client pre-filled.
            You can rename and modify anything before saving.
        </Text>

        <Pressable style={styles.confirmButton} onPress={() => onConfirm(workout)}>
            <Text style={styles.confirmButtonText}>Open in Editor</Text>
        </Pressable>
    </View>
);

// ─── Main overlay ─────────────────────────────────────────────────────────────

export default function TemplatePickerOverlay({
    visible,
    onClose,
    clientEmail,
    clientName,
    scheduledDate,
    navigation,
}) {
    const { authFetch } = useAuth();

    const [searchInput, setSearchInput] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [templates, setTemplates] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [selected, setSelected] = React.useState(null); // workout to confirm

    // Debounce search
    React.useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Fetch templates whenever search changes or overlay opens
    React.useEffect(() => {
        if (!visible) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    page: 1,
                    pageSize: search ? 10 : 3,  // default 3 most recent, more when searching
                    sort: 'recent',
                    ...(search ? { search } : {}),
                });
                const res = await authFetch(
                    `https://your-auth-worker.workers.dev/workouts/templates?${params}`
                );
                const body = await res.json();
                setTemplates(body.workouts ?? []);
            } catch (e) {
                console.error('Could not load templates', e);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [visible, search]);

    const handleClose = () => {
        setSelected(null);
        setSearchInput('');
        setSearch('');
        onClose();
    };

    const handleConfirm = (workout) => {
        handleClose();
        navigation.navigate('Create Workout', {
            clientEmail,
            clientName,
            scheduledDate: scheduledDate ?? null,
            workoutData: {
                workoutName: workout.workoutName,
                data: workout.data,
            },
        });
    };

    const renderTemplate = ({ item }) => {
        const sectionCount = item.data?.length ?? 0;
        const exerciseCount = item.data?.reduce((a, s) => a + (s.data?.length ?? 0), 0) ?? 0;

        return (
            <Pressable
                style={styles.templateRow}
                onPress={() => setSelected(item)}
            >
                <View style={styles.templateInfo}>
                    <Text style={styles.templateName}>{item.workoutName}</Text>
                    <Text style={styles.templateMeta}>
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                    </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#555" />
            </Pressable>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <Pressable style={styles.backdrop} onPress={handleClose} />

            <View style={styles.sheet}>
                <View style={styles.handle} />

                {selected ? (
                    <ConfirmStep
                        workout={selected}
                        clientName={clientName}
                        scheduledDate={scheduledDate}
                        onBack={() => setSelected(null)}
                        onConfirm={handleConfirm}
                    />
                ) : (
                    <>
                        <View style={styles.sheetHeader}>
                            <View>
                                <Text style={styles.sheetTitle}>Choose a template</Text>
                                <Text style={styles.sheetSubtitle}>
                                    For {clientName}{scheduledDate ? ` · ${scheduledDate}` : ''}
                                </Text>
                            </View>
                            <Pressable onPress={handleClose} style={styles.closeButton}>
                                <Feather name="x" size={20} color="#888" />
                            </Pressable>
                        </View>

                        {/* Search */}
                        <View style={styles.searchBox}>
                            <Feather name="search" size={15} color="#888" style={{ marginRight: 6 }} />
                            <TextInput
                                style={styles.searchInput}
                                value={searchInput}
                                onChangeText={setSearchInput}
                                placeholder="Search templates..."
                                placeholderTextColor="#888"
                                clearButtonMode="while-editing"
                            />
                        </View>

                        {!search && (
                            <Text style={styles.defaultLabel}>Most recent</Text>
                        )}

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color="#fba8a0" />
                            </View>
                        ) : (
                            <FlatList
                                data={templates}
                                renderItem={renderTemplate}
                                keyExtractor={item => item.id}
                                style={styles.list}
                                ListEmptyComponent={
                                    <Text style={styles.emptyText}>
                                        {search ? `No templates matching "${search}"` : 'No templates yet'}
                                    </Text>
                                }
                            />
                        )}
                    </>
                )}
            </View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },

    sheet: {
        backgroundColor: '#111',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingBottom: 40,
        maxHeight: '75%',
    },
    handle: { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
    sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#fae9e9' },
    sheetSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
    closeButton: { padding: 4 },

    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, height: 38, marginHorizontal: 16, marginBottom: 8 },
    searchInput: { flex: 1, color: '#fae9e9', fontSize: 15 },

    defaultLabel: { fontSize: 11, color: '#555', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingBottom: 4 },

    list: { flex: 1 },

    templateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1e1e1e' },
    templateInfo: { flex: 1 },
    templateName: { fontSize: 15, color: '#fae9e9', fontWeight: '600' },
    templateMeta: { fontSize: 12, color: '#888', marginTop: 3 },

    loadingContainer: { paddingVertical: 30, alignItems: 'center' },
    emptyText: { color: '#555', textAlign: 'center', padding: 30 },

    // Confirm step
    confirmContainer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
    backText: { color: '#fba8a0', fontSize: 14 },
    confirmTitle: { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 16 },
    confirmCard: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 16, borderLeftWidth: 3, borderLeftColor: '#fba8a0', marginBottom: 16 },
    confirmWorkoutName: { fontSize: 16, fontWeight: '600', color: '#fae9e9' },
    confirmMeta: { fontSize: 12, color: '#888', marginTop: 4 },
    confirmDetails: { gap: 8, marginBottom: 16 },
    confirmDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    confirmDetailText: { fontSize: 14, color: '#aaa' },
    confirmNote: { fontSize: 13, color: '#555', lineHeight: 18, marginBottom: 24 },
    confirmButton: { backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
    confirmButtonText: { color: '#000', fontWeight: '700', fontSize: 16 },
});