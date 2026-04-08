/**
 * ToBeFilmedScreen.js
 * Location: screens/ToBeFilmedScreen.js
 *
 * Coach-only screen listing all exercises in the demos table that have no
 * Cloudflare Stream video ID. Each row lets the coach:
 *   - See the exercise name and description
 *   - Tap to enter/update the Stream video ID once they've uploaded
 *
 * Add to CoachNavigation:
 *   <Drawer.Screen name="To Be Filmed" component={ToBeFilmedScreen} />
 */

import * as React from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput,
    Pressable, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';
const PAGE_SIZE  = 20;

// ─── Link Stream ID modal ─────────────────────────────────────────────────────

const LinkStreamModal = ({ exercise, onClose, onLinked, authFetch }) => {
    const [streamId, setStreamId] = React.useState('');
    const [loading, setLoading]   = React.useState(false);

    if (!exercise) return null;

    const handleLink = async () => {
        if (!streamId.trim()) {
            Alert.alert('Required', 'Paste the Cloudflare Stream video ID.');
            return;
        }
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/demos/${exercise.id}/stream`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ streamId: streamId.trim() }),
            });
            const body = await res.json();
            if (res.ok) {
                onLinked(exercise.id);
            } else {
                Alert.alert('Error', body.error ?? 'Could not update video ID.');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error. Please try again.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderText}>
                            <Text style={styles.modalTitle}>Link video</Text>
                            <Text style={styles.modalSubtitle} numberOfLines={1}>{exercise.name}</Text>
                        </View>
                        <Pressable onPress={onClose}>
                            <Feather name="x" size={20} color="#888" />
                        </Pressable>
                    </View>

                    <Text style={styles.modalDesc}>{exercise.description}</Text>

                    <Text style={styles.fieldLabel}>
                        Cloudflare Stream Video ID <Text style={styles.required}>*</Text>
                    </Text>
                    <Text style={styles.fieldHint}>
                        Upload the video to Cloudflare Stream first, then paste the video ID here.
                        You can find it in the Stream dashboard under your video's details.
                        Updating this ID here will not affect any workouts — they use a stable internal ID.
                    </Text>
                    <TextInput
                        style={styles.streamInput}
                        value={streamId}
                        onChangeText={setStreamId}
                        placeholder="e.g. a8f3b2c1d4e5f6a7b8c9d0e1f2a3b4c5"
                        placeholderTextColor="#555"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                    />

                    {loading ? (
                        <ActivityIndicator color="#fba8a0" style={{ marginTop: 20 }} />
                    ) : (
                        <View style={styles.modalActions}>
                            <Pressable style={styles.cancelButton} onPress={onClose}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={styles.linkButton} onPress={handleLink}>
                                <Feather name="link" size={16} color="#000" />
                                <Text style={styles.linkButtonText}>Link Video</Text>
                            </Pressable>
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Exercise row ─────────────────────────────────────────────────────────────

const ExerciseRow = ({ exercise, onLink }) => (
    <View style={styles.row}>
        <View style={styles.rowContent}>
            <Text style={styles.rowName}>{exercise.name}</Text>
            {exercise.description ? (
                <Text style={styles.rowDesc} numberOfLines={2}>{exercise.description}</Text>
            ) : null}
        </View>
        <Pressable style={styles.linkRowButton} onPress={() => onLink(exercise)}>
            <Feather name="video" size={15} color="#000" />
            <Text style={styles.linkRowButtonText}>Link</Text>
        </Pressable>
    </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ToBeFilmedScreen() {
    const { authFetch } = useAuth();

    const [exercises, setExercises] = React.useState([]);
    const [loading, setLoading]     = React.useState(true);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [page, setPage]           = React.useState(1);
    const [total, setTotal]         = React.useState(0);
    const [searchInput, setSearchInput] = React.useState('');
    const [search, setSearch]       = React.useState('');
    const [linkTarget, setLinkTarget]   = React.useState(null);

    const hasMore = exercises.length < total;

    // Debounce search
    React.useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchExercises = React.useCallback(async (opts = {}) => {
        const targetPage   = opts.page ?? 1;
        const targetSearch = opts.search ?? search;
        const append       = opts.append ?? false;

        if (append) setLoadingMore(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({
                page: targetPage,
                pageSize: PAGE_SIZE,
                ...(targetSearch ? { search: targetSearch } : {}),
            });
            const res  = await authFetch(`${WORKER_URL}/demos/unfilmed?${params}`);
            const body = await res.json();
            setTotal(body.total ?? 0);
            setExercises(prev =>
                append
                    ? [...prev, ...(body.exercises ?? [])]
                    : (body.exercises ?? [])
            );
            setPage(targetPage);
        } catch (e) {
            Alert.alert('Error', 'Could not load exercises.');
            console.error(e);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [search]);

    React.useEffect(() => {
        fetchExercises({ page: 1 });
    }, [search]);

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchExercises({ page: page + 1, append: true });
        }
    };

    // Remove linked exercise from list optimistically
    const handleLinked = (exerciseId) => {
        setLinkTarget(null);
        setExercises(prev => prev.filter(e => e.id !== exerciseId));
        setTotal(t => Math.max(0, t - 1));
    };

    const renderItem = ({ item }) => (
        <ExerciseRow exercise={item} onLink={setLinkTarget} />
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
                <Feather name="video" size={40} color="#333" />
                <Text style={styles.emptyTitle}>
                    {search ? `No unfilmed exercises matching "${search}"` : 'All caught up!'}
                </Text>
                <Text style={styles.emptySubtitle}>
                    {search
                        ? 'Try a different search term'
                        : 'Every exercise in your library has a video linked.'}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Feather name="video-off" size={20} color="#fba8a0" />
                    <Text style={styles.headerTitle}>To Be Filmed</Text>
                </View>
                <Text style={styles.headerSubtitle}>
                    {total} exercise{total !== 1 ? 's' : ''} without a video
                </Text>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
                <Feather name="search" size={15} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                    style={styles.searchInput}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    placeholder="Search exercises..."
                    placeholderTextColor="#888"
                    clearButtonMode="while-editing"
                />
            </View>

            {/* How it works */}
            <View style={styles.infoStrip}>
                <Feather name="info" size={13} color="#555" style={{ marginRight: 6, flexShrink: 0 }} />
                <Text style={styles.infoText}>
                    Upload to Cloudflare Stream, then tap Link to connect the video ID.
                    Updating the ID never breaks existing workouts.
                </Text>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fba8a0" />
                </View>
            ) : (
                <FlatList
                    data={exercises}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    contentContainerStyle={styles.listContent}
                />
            )}

            <LinkStreamModal
                exercise={linkTarget}
                onClose={() => setLinkTarget(null)}
                onLinked={handleLinked}
                authFetch={authFetch}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:     { flex: 1, backgroundColor: 'black' },

    header:        { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
    headerTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle:   { fontSize: 24, fontWeight: 'bold', color: '#fae9e9' },
    headerSubtitle:{ fontSize: 13, color: '#888', marginTop: 4 },

    searchBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, height: 38, marginHorizontal: 16, marginBottom: 8 },
    searchInput:   { flex: 1, color: '#fae9e9', fontSize: 15 },

    infoStrip:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0d0d0d', borderWidth: 0.5, borderColor: '#222', borderRadius: 8, marginHorizontal: 16, marginBottom: 12, padding: 10 },
    infoText:      { fontSize: 12, color: '#555', lineHeight: 17, flex: 1 },

    listContent:   { paddingHorizontal: 16, paddingBottom: 40 },

    row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a', gap: 12 },
    rowContent:    { flex: 1 },
    rowName:       { fontSize: 16, color: '#fae9e9', fontWeight: '600' },
    rowDesc:       { fontSize: 12, color: '#555', marginTop: 4, lineHeight: 16 },
    linkRowButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fba8a0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    linkRowButtonText: { fontSize: 13, color: '#000', fontWeight: '700' },

    footerLoader:  { paddingVertical: 20, alignItems: 'center' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    emptyContainer:  { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
    emptyTitle:      { fontSize: 16, color: '#555', textAlign: 'center', fontWeight: '600' },
    emptySubtitle:   { fontSize: 13, color: '#333', textAlign: 'center', paddingHorizontal: 32 },

    // Modal
    modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalCard:     { backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 },
    modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    modalHeaderText: { flex: 1 },
    modalTitle:    { fontSize: 18, fontWeight: 'bold', color: '#fae9e9' },
    modalSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
    modalDesc:     { fontSize: 13, color: '#555', lineHeight: 18, marginBottom: 20 },

    fieldLabel:    { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    required:      { color: '#fba8a0' },
    fieldHint:     { fontSize: 12, color: '#444', lineHeight: 17, marginBottom: 10 },
    streamInput:   { borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', color: '#fae9e9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

    modalActions:  { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton:  { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    cancelButtonText: { color: '#888', fontSize: 15 },
    linkButton:    { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 12 },
    linkButtonText:{ color: '#000', fontWeight: '700', fontSize: 15 },
});