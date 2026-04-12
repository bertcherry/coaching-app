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
import { useTheme } from '../context/ThemeContext';

// ─── Confirm step ─────────────────────────────────────────────────────────────

const ConfirmStep = ({ workout, clientName, scheduledDate, onBack, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <View style={styles.confirmContainer}>
            <Pressable style={styles.backRow} onPress={onBack}>
                <Feather name="arrow-left" size={18} color={theme.accent} />
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
                    <Feather name="user" size={14} color={theme.textSecondary} />
                    <Text style={styles.confirmDetailText}>{clientName}</Text>
                </View>
                {scheduledDate && (
                    <View style={styles.confirmDetailRow}>
                        <Feather name="calendar" size={14} color={theme.textSecondary} />
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
};

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
    const { theme } = useTheme();
    const styles = makeStyles(theme);

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
                    `https://coaching-app.bert-m-cherry.workers.dev/workouts/templates?${params}`
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
                <Feather name="chevron-right" size={18} color={theme.textTertiary} />
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
                                <Feather name="x" size={20} color={theme.textSecondary} />
                            </Pressable>
                        </View>

                        {/* Search */}
                        <View style={styles.searchBox}>
                            <Feather name="search" size={15} color={theme.textSecondary} style={{ marginRight: 6 }} />
                            <TextInput
                                style={styles.searchInput}
                                value={searchInput}
                                onChangeText={setSearchInput}
                                placeholder="Search templates..."
                                placeholderTextColor={theme.textSecondary}
                                clearButtonMode="while-editing"
                            />
                        </View>

                        {!search && (
                            <Text style={styles.defaultLabel}>Most recent</Text>
                        )}

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color={theme.accent} />
                            </View>
                        ) : (
                            <FlatList
                                data={templates}
                                renderItem={renderTemplate}
                                keyExtractor={item => item.id}
                                style={styles.list}
                                indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
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

function makeStyles(theme) {
    return StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: theme.overlay },

        sheet: {
            backgroundColor: theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 40,
            maxHeight: '75%',
        },
        handle: { width: 36, height: 4, backgroundColor: theme.surfaceBorder, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

        sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
        sheetTitle: { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary },
        sheetSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
        closeButton: { padding: 4 },

        searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderRadius: 8, paddingHorizontal: 12, height: 38, marginHorizontal: 16, marginBottom: 8 },
        searchInput: { flex: 1, color: theme.textPrimary, fontSize: 15 },

        defaultLabel: { fontSize: 11, color: theme.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingBottom: 4 },

        list: { flex: 1 },

        templateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceElevated },
        templateInfo: { flex: 1 },
        templateName: { fontSize: 15, color: theme.textPrimary, fontWeight: '600' },
        templateMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },

        loadingContainer: { paddingVertical: 30, alignItems: 'center' },
        emptyText: { color: theme.textTertiary, textAlign: 'center', padding: 30 },

        // Confirm step
        confirmContainer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
        backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
        backText: { color: theme.accent, fontSize: 14 },
        confirmTitle: { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 16 },
        confirmCard: { backgroundColor: theme.surfaceElevated, borderRadius: 8, padding: 16, borderLeftWidth: 3, borderLeftColor: theme.accent, marginBottom: 16 },
        confirmWorkoutName: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
        confirmMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
        confirmDetails: { gap: 8, marginBottom: 16 },
        confirmDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        confirmDetailText: { fontSize: 14, color: theme.textSecondary },
        confirmNote: { fontSize: 13, color: theme.textTertiary, lineHeight: 18, marginBottom: 24 },
        confirmButton: { backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
        confirmButtonText: { color: '#000', fontWeight: '700', fontSize: 16 },
    });
}
