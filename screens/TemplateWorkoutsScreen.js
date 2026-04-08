/**
 * UnscheduledWorkoutsScreen.js
 * Location: screens/UnscheduledWorkoutsScreen.js
 *
 * Shows all workouts created by this coach with no client attribution.
 * Supports pagination (newest first), alphabetical sort, search by name,
 * and copying a workout to a client (opens CreateWorkout with prefill).
 *
 * Worker endpoint needed:
 *   GET /workouts/templates?page=1&sort=recent&search=foo
 *   → { workouts: [{ id, workoutName, createdAt, data }], total, page, pageSize }
 */

import * as React from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput,
    Pressable, ActivityIndicator, Modal, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 10;

// ─── Confirm copy overlay ─────────────────────────────────────────────────────

const ConfirmCopyModal = ({ workout, onCancel, onConfirm }) => {
    if (!workout) return null;
    return (
        <Modal transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Use this workout?</Text>
                    <View style={styles.workoutPreviewCard}>
                        <Text style={styles.workoutPreviewName}>{workout.workoutName}</Text>
                        <Text style={styles.workoutPreviewMeta}>
                            {workout.data?.length ?? 0} section{workout.data?.length !== 1 ? 's' : ''}
                            {' · '}
                            {workout.data?.reduce((acc, s) => acc + (s.data?.length ?? 0), 0) ?? 0} exercises
                        </Text>
                    </View>
                    <Text style={styles.modalSubtitle}>
                        This will open the workout editor with this template pre-filled.
                        You can rename it, assign a client, and modify anything before saving.
                    </Text>
                    <View style={styles.modalActions}>
                        <Pressable style={styles.modalButtonSecondary} onPress={onCancel}>
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={styles.modalButtonPrimary} onPress={() => onConfirm(workout)}>
                            <Text style={styles.modalButtonPrimaryText}>Use Template</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Workout row ──────────────────────────────────────────────────────────────

const WorkoutRow = ({ workout, onCopy }) => {
    const sectionCount = workout.data?.length ?? 0;
    const exerciseCount = workout.data?.reduce((acc, s) => acc + (s.data?.length ?? 0), 0) ?? 0;

    return (
        <View style={styles.workoutRow}>
            <View style={styles.workoutRowInfo}>
                <Text style={styles.workoutName}>{workout.workoutName}</Text>
                <Text style={styles.workoutMeta}>
                    {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                </Text>
            </View>
            <Pressable style={styles.copyButton} onPress={() => onCopy(workout)}>
                <Feather name="copy" size={18} color="#000" />
                <Text style={styles.copyButtonText}>Use</Text>
            </Pressable>
        </View>
    );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UnscheduledWorkoutsScreen({ navigation }) {
    const { authFetch } = useAuth();

    const [workouts, setWorkouts] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [page, setPage] = React.useState(1);
    const [total, setTotal] = React.useState(0);
    const [sort, setSort] = React.useState('recent'); // 'recent' | 'alpha'
    const [search, setSearch] = React.useState('');
    const [searchInput, setSearchInput] = React.useState('');
    const [confirmWorkout, setConfirmWorkout] = React.useState(null);

    const hasMore = workouts.length < total;

    // ── Fetch ───────────────────────────────────────────────────────────────

    const fetchWorkouts = React.useCallback(async (opts = {}) => {
        const targetPage = opts.page ?? 1;
        const targetSort = opts.sort ?? sort;
        const targetSearch = opts.search ?? search;
        const append = opts.append ?? false;

        if (append) setLoadingMore(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({
                page: targetPage,
                pageSize: PAGE_SIZE,
                sort: targetSort,
                ...(targetSearch ? { search: targetSearch } : {}),
            });
            const res = await authFetch(
                `https://coaching-app.bert.m.cherry.workers.dev/workouts/templates?${params}`
            );
            const body = await res.json();
            setTotal(body.total ?? 0);
            setWorkouts(prev => append ? [...prev, ...(body.workouts ?? [])] : (body.workouts ?? []));
            setPage(targetPage);
        } catch (e) {
            Alert.alert('Error', 'Could not load workouts.');
            console.error(e);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [sort, search]);

    React.useEffect(() => {
        fetchWorkouts({ page: 1 });
    }, [sort, search]);

    // ── Search debounce ─────────────────────────────────────────────────────

    React.useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // ── Sort toggle ─────────────────────────────────────────────────────────

    const toggleSort = () => {
        const next = sort === 'recent' ? 'alpha' : 'recent';
        setSort(next);
    };

    // ── Load more ───────────────────────────────────────────────────────────

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchWorkouts({ page: page + 1, append: true });
        }
    };

    // ── Copy to client ──────────────────────────────────────────────────────

    const handleCopyConfirm = (workout) => {
        setConfirmWorkout(null);
        navigation.navigate('Create Workout', {
            workoutData: {
                workoutName: workout.workoutName,
                data: workout.data,
            },
        });
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const renderItem = ({ item }) => (
        <WorkoutRow workout={item} onCopy={(w) => setConfirmWorkout(w)} />
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#fba8a0" />
            </View>
        );
    };

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.emptyContainer}>
                <Feather name="inbox" size={40} color="#444" />
                <Text style={styles.emptyText}>
                    {search ? `No workouts matching "${search}"` : 'No template workouts yet'}
                </Text>
                <Pressable
                    style={styles.createButton}
                    onPress={() => navigation.navigate('Create Workout')}
                >
                    <Text style={styles.createButtonText}>Create a Workout</Text>
                </Pressable>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Template Workouts</Text>
                <Text style={styles.headerSubtitle}>
                    {total} workout{total !== 1 ? 's' : ''} · no client assigned
                </Text>
            </View>

            {/* Search + sort bar */}
            <View style={styles.toolbar}>
                <View style={styles.searchBox}>
                    <Feather name="search" size={16} color="#888" style={{ marginRight: 6 }} />
                    <TextInput
                        style={styles.searchInput}
                        value={searchInput}
                        onChangeText={setSearchInput}
                        placeholder="Search workouts..."
                        placeholderTextColor="#888"
                        clearButtonMode="while-editing"
                    />
                </View>
                <Pressable style={styles.sortButton} onPress={toggleSort}>
                    <Feather
                        name={sort === 'recent' ? 'clock' : 'type'}
                        size={16}
                        color="#fba8a0"
                    />
                    <Text style={styles.sortButtonText}>
                        {sort === 'recent' ? 'Newest' : 'A–Z'}
                    </Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fba8a0" />
                </View>
            ) : (
                <FlatList
                    data={workouts}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    contentContainerStyle={styles.listContent}
                />
            )}

            {/* FAB — create new template */}
            <Pressable
                style={styles.fab}
                onPress={() => navigation.navigate('Create Workout')}
            >
                <Feather name="plus" size={24} color="#000" />
            </Pressable>

            {/* Confirm copy modal */}
            <ConfirmCopyModal
                workout={confirmWorkout}
                onCancel={() => setConfirmWorkout(null)}
                onConfirm={handleCopyConfirm}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },

    header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fae9e9' },
    headerSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },

    toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 10, height: 38 },
    searchInput: { flex: 1, color: '#fae9e9', fontSize: 15 },
    sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fba8a0' },
    sortButtonText: { color: '#fba8a0', fontSize: 13, fontWeight: '600' },

    listContent: { paddingHorizontal: 16, paddingBottom: 100 },

    workoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#222' },
    workoutRowInfo: { flex: 1 },
    workoutName: { fontSize: 16, color: '#fae9e9', fontWeight: '600' },
    workoutMeta: { fontSize: 12, color: '#888', marginTop: 3 },
    copyButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fba8a0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    copyButtonText: { fontSize: 13, color: '#000', fontWeight: '700' },

    footerLoader: { paddingVertical: 20, alignItems: 'center' },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyText: { color: '#555', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
    createButton: { backgroundColor: '#fba8a0', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
    createButtonText: { color: '#000', fontWeight: '700', fontSize: 15 },

    fab: { position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#fba8a0', justifyContent: 'center', alignItems: 'center', elevation: 6 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { backgroundColor: '#111', borderRadius: 12, padding: 24, width: '100%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 16 },
    modalSubtitle: { fontSize: 13, color: '#888', marginTop: 12, marginBottom: 20, lineHeight: 18 },
    workoutPreviewCard: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: '#fba8a0' },
    workoutPreviewName: { fontSize: 16, fontWeight: '600', color: '#fae9e9' },
    workoutPreviewMeta: { fontSize: 12, color: '#888', marginTop: 4 },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalButtonPrimary: { flex: 1, backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonPrimaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
    modalButtonSecondary: { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonSecondaryText: { color: '#888', fontSize: 16 },
});