import * as React from 'react';
import {
    View, Text, TextInput, FlatList, Pressable,
    Modal, StyleSheet, Platform, KeyboardAvoidingView,
    ActivityIndicator, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../context/ThemeContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Create Exercise modal ────────────────────────────────────────────────────

const CreateExerciseModal = ({ visible, initialName, onClose, onCreated, authFetch }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [name, setName]           = React.useState(initialName ?? '');
    const [description, setDesc]    = React.useState('');
    const [loading, setLoading]     = React.useState(false);

    // Sync initial name when modal opens with pre-filled search term
    React.useEffect(() => {
        if (visible) setName(initialName ?? '');
    }, [visible, initialName]);

    const handleCreate = async () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Exercise name is required.');
            return;
        }
        if (!description.trim()) {
            Alert.alert('Required', 'Description is required so clients know how to perform the exercise.');
            return;
        }
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/demos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), description: description.trim() }),
            });
            const body = await res.json();
            if (res.ok) {
                onCreated({ id: body.id, name: body.name, hasVideo: 0, description: description.trim() });
                setName('');
                setDesc('');
            } else if (res.status === 409) {
                Alert.alert('Already exists', body.error);
            } else {
                Alert.alert('Error', body.error ?? 'Could not create exercise.');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error. Please try again.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.createModalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.createModalCard}>
                    <View style={styles.createModalHeader}>
                        <Text style={styles.createModalTitle}>New Exercise</Text>
                        <Pressable onPress={onClose}>
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </Pressable>
                    </View>
                    <Text style={styles.createModalSubtitle}>
                        This exercise will be added to the library without a video.
                        You can film and link it later from the To Be Filmed list.
                    </Text>

                    <Text style={styles.createLabel}>Name <Text style={styles.required}>*</Text></Text>
                    <TextInput
                        style={styles.createInput}
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Romanian Deadlift"
                        placeholderTextColor={theme.textTertiary}
                        autoFocus
                    />

                    <Text style={styles.createLabel}>Description <Text style={styles.required}>*</Text></Text>
                    <TextInput
                        style={[styles.createInput, styles.createInputMultiline]}
                        value={description}
                        onChangeText={setDesc}
                        placeholder="Describe how to perform the exercise, cues to focus on, common errors to avoid..."
                        placeholderTextColor={theme.textTertiary}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    {loading ? (
                        <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
                    ) : (
                        <Pressable style={styles.createButton} onPress={handleCreate}>
                            <Text style={styles.createButtonText}>Add to Library</Text>
                        </Pressable>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Result row ───────────────────────────────────────────────────────────────

const ResultRow = ({ item, onSelect }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <Pressable style={styles.resultRow} onPress={() => onSelect(item)}>
            <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name}</Text>
                {item.description ? (
                    <Text style={styles.resultDesc} numberOfLines={1}>{item.description}</Text>
                ) : null}
            </View>
            <View style={[styles.videoBadge, item.hasVideo ? styles.videoBadgeYes : styles.videoBadgeNo]}>
                <Feather
                    name={item.hasVideo ? 'film' : 'video-off'}
                    size={11}
                    color={item.hasVideo ? theme.success : theme.textTertiary}
                />
                <Text style={[styles.videoBadgeText, item.hasVideo ? styles.videoBadgeTextYes : styles.videoBadgeTextNo]}>
                    {item.hasVideo ? 'Video' : 'No video'}
                </Text>
            </View>
        </Pressable>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExerciseSearch({
    exercise,
    exerciseNameField,
    exerciseIdField,
    setFieldValue,
    handleBlur,
    isCoach,
    authFetch,
}) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [showModal, setShowModal]       = React.useState(false);
    const [showCreate, setShowCreate]     = React.useState(false);
    const [searchValue, setSearchValue]   = React.useState('');
    const [results, setResults]           = React.useState([]);
    const [loading, setLoading]           = React.useState(false);
    const [searched, setSearched]         = React.useState(false); // has user searched at all

    // Debounced search
    React.useEffect(() => {
        if (!showModal) return;
        let isActive = true;
        if (!searchValue.trim()) {
            setResults([]);
            setSearched(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${WORKER_URL}/demos/search?q=${encodeURIComponent(searchValue.trim())}&limit=15`
                );
                if (!res.ok) {
                    const text = await res.text();
                    console.error('Search failed:', res.status, text);
                    throw new Error('Search failed');
                }
                const body = await res.json();
                if (!isActive) return;
                const exercises = Array.isArray(body.exercises) ? body.exercises : [];
                setResults(exercises);
                setSearched(true);
            } catch (e) {
                console.error('Exercise search error:', e);
                setResults([]);
            } finally {
                if (!isActive) return;
                setLoading(false);
            }
        }, 500);
        return () => {
            isActive = false;
            clearTimeout(t);
        };
    }, [searchValue, showModal]);

    const onSelectExercise = (item) => {
        setFieldValue(exerciseIdField, item.id);
        setFieldValue(exerciseNameField, item.name);
        setShowModal(false);
        setSearchValue('');
        setResults([]);
        setSearched(false);
    };

    const onCreated = (newExercise) => {
        setShowCreate(false);
        onSelectExercise(newExercise);
    };

    const handleClose = () => {
        setShowModal(false);
        setSearchValue('');
        setResults([]);
        setSearched(false);
        handleBlur(exerciseNameField);
    };

    const hasSelection = !!exercise?.name;
    const noResults = searched && !loading && results.length === 0;

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Exercise Name</Text>

            {hasSelection ? (
                <Pressable style={styles.selectedRow} onPress={() => setShowModal(true)}>
                    <Text style={styles.selectedName}>{exercise.name}</Text>
                    <Feather name="chevron-down" size={18} color={theme.inputText} />
                </Pressable>
            ) : (
                <Pressable style={styles.searchPlaceholder} onPress={() => setShowModal(true)}>
                    <Feather name="search" size={15} color={theme.textTertiary} style={{ marginRight: 8 }} />
                    <Text style={styles.searchPlaceholderText}>Search exercises...</Text>
                </Pressable>
            )}

            {/* Search modal */}
            <Modal visible={showModal} transparent animationType="slide" onRequestClose={handleClose}>
                <KeyboardAvoidingView
                    style={styles.modalContainer}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalContent}>
                        {/* Search bar */}
                        <View style={styles.searchBar}>
                            <Feather name="search" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                value={searchValue}
                                onChangeText={setSearchValue}
                                placeholder="Search exercises..."
                                placeholderTextColor={theme.textTertiary}
                                autoFocus
                            />
                            <Pressable onPress={handleClose} style={styles.closeButton}>
                                <Feather name="x" size={18} color={theme.textSecondary} />
                            </Pressable>
                        </View>

                        {/* Loading */}
                        {loading && (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator size="small" color={theme.accent} />
                            </View>
                        )}

                        {/* Results */}
                        {!loading && results.length > 0 && (
                            <FlatList
                                data={results}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => (
                                    <ResultRow item={item} onSelect={onSelectExercise} />
                                )}
                                keyboardShouldPersistTaps="handled"
                                style={styles.resultsList}
                                indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
                            />
                        )}

                        {/* No results — offer to create (coaches only) */}
                        {noResults && (
                            <View style={styles.noResults}>
                                <Text style={styles.noResultsText}>
                                    No exercises found for "{searchValue}"
                                </Text>
                                {isCoach && (
                                    <Pressable
                                        style={styles.createFromSearch}
                                        onPress={() => {
                                            setShowModal(false);
                                            setShowCreate(true);
                                        }}
                                    >
                                        <Feather name="plus-circle" size={16} color={theme.accent} />
                                        <Text style={styles.createFromSearchText}>
                                            Add "{searchValue}" to library
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {/* Prompt before searching */}
                        {!loading && !noResults && isCoach && (
                            <Pressable
                                style={styles.createPrompt}
                                onPress={() => {
                                    setShowModal(false);
                                    setShowCreate(true);
                                }}
                            >
                                <Feather name="plus" size={15} color={theme.accent} style={{ marginRight: 6 }} />
                                <Text style={styles.createPromptText}>Create a new exercise</Text>
                            </Pressable>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Create exercise modal */}
            {isCoach && (
                <CreateExerciseModal
                    visible={showCreate}
                    initialName={searchValue}
                    onClose={() => {
                        setShowCreate(false);
                        setShowModal(true); // go back to search
                    }}
                    onCreated={onCreated}
                    authFetch={authFetch}
                />
            )}
        </View>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container:      { flex: 1, marginHorizontal: 10, marginTop: 8 },
        label:          { fontSize: 11, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },

        selectedRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.inputBackground, paddingHorizontal: 12, paddingVertical: 10 },
        selectedName:   { fontSize: 15, color: theme.inputText, flex: 1 },

        searchPlaceholder:     { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.textPrimary },
        searchPlaceholderText: { color: theme.textSecondary, fontSize: 15 },

        // Modal
        modalContainer: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
        modalContent:   { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '80%' },

        searchBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceBorder },
        searchInput: { flex: 1, color: theme.textPrimary, fontSize: 16 },
        closeButton: { padding: 4, marginLeft: 8 },

        loadingRow: { paddingVertical: 24, alignItems: 'center' },

        resultsList: { flex: 1 },
        resultRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceElevated },
        resultInfo:  { flex: 1 },
        resultName:  { fontSize: 15, color: theme.textPrimary, fontWeight: '500' },
        resultDesc:  { fontSize: 12, color: theme.textTertiary, marginTop: 2 },

        videoBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
        videoBadgeYes:     { borderColor: theme.success, backgroundColor: 'rgba(123, 181, 51, 0.1)' },
        videoBadgeNo:      { borderColor: theme.surfaceBorder, backgroundColor: 'transparent' },
        videoBadgeText:    { fontSize: 10, fontWeight: '600' },
        videoBadgeTextYes: { color: theme.success },
        videoBadgeTextNo:  { color: theme.textTertiary },

        noResults:           { padding: 24, alignItems: 'center', gap: 16 },
        noResultsText:       { color: theme.textTertiary, fontSize: 14, textAlign: 'center' },
        createFromSearch:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.accent },
        createFromSearchText:{ color: theme.accent, fontSize: 14, fontWeight: '600' },

        createPrompt:     { flexDirection: 'row', alignItems: 'center', padding: 20, borderTopWidth: 0.5, borderTopColor: theme.surfaceBorder, marginTop: 8 },
        createPromptText: { color: theme.accent, fontSize: 14 },

        // Create exercise modal
        createModalOverlay:  { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
        createModalCard:     { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 },
        createModalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
        createModalTitle:    { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary },
        createModalSubtitle: { fontSize: 13, color: theme.textTertiary, marginBottom: 20, lineHeight: 18 },

        createLabel:    { fontSize: 13, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
        required:       { color: theme.accent },
        createInput:    { borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceElevated, color: theme.inputText, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
        createInputMultiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 },
        createButton:   { backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
        createButtonText: { color: '#000', fontWeight: '700', fontSize: 16 },
    });
}
