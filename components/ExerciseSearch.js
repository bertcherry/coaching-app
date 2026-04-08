import * as React from 'react';
import {
    View, Text, TextInput, FlatList, Pressable,
    Modal, StyleSheet, Platform, KeyboardAvoidingView,
    ActivityIndicator, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Create Exercise modal ────────────────────────────────────────────────────

const CreateExerciseModal = ({ visible, initialName, onClose, onCreated, authFetch }) => {
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
                            <Feather name="x" size={20} color="#888" />
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
                        placeholderTextColor="#555"
                        autoFocus
                    />

                    <Text style={styles.createLabel}>Description <Text style={styles.required}>*</Text></Text>
                    <TextInput
                        style={[styles.createInput, styles.createInputMultiline]}
                        value={description}
                        onChangeText={setDesc}
                        placeholder="Describe how to perform the exercise, cues to focus on, common errors to avoid..."
                        placeholderTextColor="#555"
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    {loading ? (
                        <ActivityIndicator color="#fba8a0" style={{ marginTop: 16 }} />
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

const ResultRow = ({ item, onSelect }) => (
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
                color={item.hasVideo ? '#7bb533' : '#555'}
            />
            <Text style={[styles.videoBadgeText, item.hasVideo ? styles.videoBadgeTextYes : styles.videoBadgeTextNo]}>
                {item.hasVideo ? 'Video' : 'No video'}
            </Text>
        </View>
    </Pressable>
);

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
    const [showModal, setShowModal]       = React.useState(false);
    const [showCreate, setShowCreate]     = React.useState(false);
    const [searchValue, setSearchValue]   = React.useState('');
    const [results, setResults]           = React.useState([]);
    const [loading, setLoading]           = React.useState(false);
    const [searched, setSearched]         = React.useState(false); // has user searched at all

    // Debounced search
    React.useEffect(() => {
        if (!showModal) return;
        if (!searchValue.trim()) {
            setResults([]);
            setSearched(false);
            return;
        }
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${WORKER_URL}/demos/search?q=${encodeURIComponent(searchValue.trim())}&limit=15`
                );
                const body = await res.json();
                setResults(body.exercises ?? []);
                setSearched(true);
            } catch (e) {
                console.error('Exercise search error:', e);
            } finally {
                setLoading(false);
            }
        }, 500);
        return () => clearTimeout(t);
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
                    <Feather name="chevron-down" size={18} color="#fae9e9" />
                </Pressable>
            ) : (
                <Pressable style={styles.searchPlaceholder} onPress={() => setShowModal(true)}>
                    <Feather name="search" size={15} color="#555" style={{ marginRight: 8 }} />
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
                            <Feather name="search" size={16} color="#888" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                value={searchValue}
                                onChangeText={setSearchValue}
                                placeholder="Search exercises..."
                                placeholderTextColor="#555"
                                autoFocus
                            />
                            <Pressable onPress={handleClose} style={styles.closeButton}>
                                <Feather name="x" size={18} color="#888" />
                            </Pressable>
                        </View>

                        {/* Loading */}
                        {loading && (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator size="small" color="#fba8a0" />
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
                                        <Feather name="plus-circle" size={16} color="#fba8a0" />
                                        <Text style={styles.createFromSearchText}>
                                            Add "{searchValue}" to library
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {/* Prompt before searching */}
                        {!loading && !searched && !searchValue && isCoach && (
                            <Pressable
                                style={styles.createPrompt}
                                onPress={() => {
                                    setShowModal(false);
                                    setShowCreate(true);
                                }}
                            >
                                <Feather name="plus" size={15} color="#fba8a0" style={{ marginRight: 6 }} />
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

const styles = StyleSheet.create({
    container:      { flex: 1, marginHorizontal: 10, marginTop: 8 },
    label:          { fontSize: 16, fontWeight: 'bold', color: '#fae9e9', padding: 8 },

    selectedRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#fba8a0', backgroundColor: '#fae9e9', paddingHorizontal: 12, paddingVertical: 10 },
    selectedName:   { fontSize: 15, color: '#000', flex: 1 },

    searchPlaceholder:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fba8a0', backgroundColor: '#fae9e9', paddingHorizontal: 12, height: 40 },
    searchPlaceholderText: { color: '#555', fontSize: 15 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    modalContent:   { backgroundColor: '#0d0d0d', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', paddingBottom: 40 },

    searchBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#222' },
    searchInput: { flex: 1, color: '#fae9e9', fontSize: 16 },
    closeButton: { padding: 4, marginLeft: 8 },

    loadingRow: { paddingVertical: 24, alignItems: 'center' },

    resultsList: { flex: 1 },
    resultRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a' },
    resultInfo:  { flex: 1 },
    resultName:  { fontSize: 15, color: '#fae9e9', fontWeight: '500' },
    resultDesc:  { fontSize: 12, color: '#555', marginTop: 2 },

    videoBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
    videoBadgeYes:     { borderColor: '#7bb533', backgroundColor: 'rgba(123, 181, 51, 0.1)' },
    videoBadgeNo:      { borderColor: '#333', backgroundColor: 'transparent' },
    videoBadgeText:    { fontSize: 10, fontWeight: '600' },
    videoBadgeTextYes: { color: '#7bb533' },
    videoBadgeTextNo:  { color: '#555' },

    noResults:           { padding: 24, alignItems: 'center', gap: 16 },
    noResultsText:       { color: '#555', fontSize: 14, textAlign: 'center' },
    createFromSearch:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fba8a0' },
    createFromSearchText:{ color: '#fba8a0', fontSize: 14, fontWeight: '600' },

    createPrompt:     { flexDirection: 'row', alignItems: 'center', padding: 20, borderTopWidth: 0.5, borderTopColor: '#222', marginTop: 8 },
    createPromptText: { color: '#fba8a0', fontSize: 14 },

    // Create exercise modal
    createModalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    createModalCard:     { backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 },
    createModalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    createModalTitle:    { fontSize: 18, fontWeight: 'bold', color: '#fae9e9' },
    createModalSubtitle: { fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 18 },

    createLabel:    { fontSize: 13, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
    required:       { color: '#fba8a0' },
    createInput:    { borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', color: '#fae9e9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    createInputMultiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 },
    createButton:   { backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    createButtonText: { color: '#000', fontWeight: '700', fontSize: 16 },
});