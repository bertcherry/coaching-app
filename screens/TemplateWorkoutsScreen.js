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
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';

const PAGE_SIZE = 10;

// ─── Confirm copy overlay ─────────────────────────────────────────────────────

const ConfirmCopyModal = ({ workout, onCancel, onConfirm, theme }) => {
    if (!workout) return null;
    return (
        <Modal transparent animationType="fade" onRequestClose={onCancel}>
            <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Use this workout?</Text>
                    <View style={[styles.workoutPreviewCard, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.accent }]}>
                        <Text style={[styles.workoutPreviewName, { color: theme.textPrimary }]}>{workout.workoutName}</Text>
                        <Text style={[styles.workoutPreviewMeta, { color: theme.textSecondary }]}>
                            {workout.data?.length ?? 0} section{workout.data?.length !== 1 ? 's' : ''}
                            {' · '}
                            {workout.data?.reduce((acc, s) => acc + (s.data?.length ?? 0), 0) ?? 0} exercises
                        </Text>
                    </View>
                    <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                        This will open the workout editor with this template pre-filled.
                        You can rename it, assign a client, and modify anything before saving.
                    </Text>
                    <View style={styles.modalActions}>
                        <Pressable style={[styles.modalButtonSecondary, { borderColor: theme.divider }]} onPress={onCancel}>
                            <Text style={[styles.modalButtonSecondaryText, { color: theme.textSecondary }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.modalButtonPrimary, { backgroundColor: theme.accent }]} onPress={() => onConfirm(workout)}>
                            <Text style={styles.modalButtonPrimaryText}>Use Template</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Workout row ──────────────────────────────────────────────────────────────

const WorkoutRow = ({ workout, onCopy, onEdit, theme }) => {
    const sectionCount = workout.data?.length ?? 0;
    const exerciseCount = workout.data?.reduce((acc, s) => acc + (s.data?.length ?? 0), 0) ?? 0;

    return (
        <View style={[styles.workoutRow, { borderBottomColor: theme.divider }]}>
            <View style={styles.workoutRowInfo}>
                <Text style={[styles.workoutName, { color: theme.textPrimary }]}>{workout.workoutName}</Text>
                <Text style={[styles.workoutMeta, { color: theme.textSecondary }]}>
                    {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                </Text>
            </View>
            <View style={styles.workoutRowActions}>
                <Pressable style={[styles.editButton, { borderColor: theme.accentText }]} onPress={() => onEdit(workout)}>
                    <Feather name="edit-2" size={16} color={theme.accentText} />
                </Pressable>
                <Pressable style={[styles.copyButton, { backgroundColor: theme.accent }]} onPress={() => onCopy(workout)}>
                    <Feather name="copy" size={18} color="#000" />
                    <Text style={styles.copyButtonText}>Use</Text>
                </Pressable>
            </View>
        </View>
    );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UnscheduledWorkoutsScreen({ navigation }) {
    const { authFetch } = useAuth();
    const { theme } = useTheme();
    const scrollY = useScrollY();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));

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
                `https://coaching-app.bert-m-cherry.workers.dev/workouts/templates?${params}`
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

    // ── Edit template ───────────────────────────────────────────────────────

    const handleEdit = (workout) => {
        navigation.navigate('Create Workout', {
            editMode: true,
            workoutId: workout.id,
            scheduledWorkoutId: null,
            initialStatus: null,
            workoutData: {
                workoutName: workout.workoutName,
                data: workout.data,
            },
        });
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const renderItem = ({ item }) => (
        <WorkoutRow workout={item} onCopy={(w) => setConfirmWorkout(w)} onEdit={handleEdit} theme={theme} />
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.accent} />
            </View>
        );
    };

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.emptyContainer}>
                <Feather name="inbox" size={40} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                    {search ? `No workouts matching "${search}"` : 'No template workouts yet'}
                </Text>
                <Pressable
                    style={[styles.createButton, { backgroundColor: theme.accent }]}
                    onPress={() => navigation.navigate('Create Workout')}
                >
                    <Text style={styles.createButtonText}>Create a Workout</Text>
                </Pressable>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Template Workouts</Text>
                <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                    {total} workout{total !== 1 ? 's' : ''} · no client assigned
                </Text>
            </View>

            {/* Search + sort bar */}
            <View style={styles.toolbar}>
                <View style={[styles.searchBox, { backgroundColor: theme.surfaceElevated }]}>
                    <Feather name="search" size={16} color={theme.textSecondary} style={{ marginRight: 6 }} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.textPrimary }]}
                        value={searchInput}
                        onChangeText={setSearchInput}
                        placeholder="Search workouts..."
                        placeholderTextColor={theme.textTertiary}
                        clearButtonMode="while-editing"
                    />
                </View>
                <Pressable style={[styles.sortButton, { borderColor: theme.accentText }]} onPress={toggleSort}>
                    <Feather
                        name={sort === 'recent' ? 'clock' : 'type'}
                        size={16}
                        color={theme.accent}
                    />
                    <Text style={[styles.sortButtonText, { color: theme.accentText }]}>
                        {sort === 'recent' ? 'Newest' : 'A–Z'}
                    </Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={workouts}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    contentContainerStyle={styles.listContent}
                    indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
                />
            )}

            {/* FAB — create new template */}
            <Pressable
                style={[styles.fab, { backgroundColor: theme.accent }]}
                onPress={() => navigation.navigate('Create Workout')}
            >
                <Feather name="plus" size={24} color="#000" />
            </Pressable>

            {/* Confirm copy modal */}
            <ConfirmCopyModal
                workout={confirmWorkout}
                onCancel={() => setConfirmWorkout(null)}
                onConfirm={handleCopyConfirm}
                theme={theme}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 13, marginTop: 2 },

    toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, height: 38 },
    searchInput: { flex: 1, fontSize: 15 },
    sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    sortButtonText: { fontSize: 13, fontWeight: '600' },

    listContent: { paddingHorizontal: 16, paddingBottom: 100 },

    workoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5 },
    workoutRowInfo: { flex: 1 },
    workoutName: { fontSize: 16, fontWeight: '600' },
    workoutMeta: { fontSize: 12, marginTop: 3 },
    workoutRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editButton: { padding: 8, borderWidth: 1, borderRadius: 8 },
    copyButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    copyButtonText: { fontSize: 13, color: '#000', fontWeight: '700' },

    footerLoader: { paddingVertical: 20, alignItems: 'center' },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
    createButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
    createButtonText: { color: '#000', fontWeight: '700', fontSize: 15 },

    fab: { position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 6 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { borderRadius: 12, padding: 24, width: '100%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    modalSubtitle: { fontSize: 13, marginTop: 12, marginBottom: 20, lineHeight: 18 },
    workoutPreviewCard: { borderRadius: 8, padding: 14, borderLeftWidth: 3 },
    workoutPreviewName: { fontSize: 16, fontWeight: '600' },
    workoutPreviewMeta: { fontSize: 12, marginTop: 4 },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalButtonPrimary: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonPrimaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
    modalButtonSecondary: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonSecondaryText: { fontSize: 16 },
});
