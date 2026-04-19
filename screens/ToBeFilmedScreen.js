/**
 * ToBeFilmedScreen.js
 * Location: screens/ToBeFilmedScreen.js
 *
 * Coach-only screen listing exercises in the demos table with no Cloudflare
 * Stream video ID. Each row opens a sheet where the coach can:
 *   - Upload a video directly to Cloudflare Stream
 *   - Edit the exercise name and description
 *
 * ─── New worker endpoints required ────────────────────────────────────────────
 *
 *   POST /demos/:id/stream-upload-url
 *     → worker calls CF Stream direct_upload API, returns { uploadURL, uid }
 *       CF API: POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/stream/direct_upload
 *               body: { maxDurationSeconds: 300, requireSignedURLs: false }
 *
 *   PATCH /demos/:id
 *     → body: { name, description }  — updates name/description in demos table
 *
 * ─── Video requirements enforced ──────────────────────────────────────────────
 *   • Landscape orientation (width >= height) — portrait is rejected
 *   • No audio — coaches are warned; audio cannot be stripped client-side
 *     without a native library like ffmpeg-kit-react-native
 */

import * as React from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput,
    Pressable, ActivityIndicator, Modal, Alert,
    KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';
const PAGE_SIZE  = 20;

// Amber — used for the audio warning; not in the brand palette
const WARNING_COLOR         = '#d97706';
const WARNING_BG            = 'rgba(217,119,6,0.10)';
const WARNING_BORDER        = 'rgba(217,119,6,0.30)';

// ─── XHR upload to Cloudflare Stream direct-creator-upload URL ────────────────
function uploadToStream(uploadURL, asset, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadURL);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        });
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed (${xhr.status}).`));
            }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

        const form = new FormData();
        form.append('file', {
            uri: asset.uri,
            name: asset.fileName ?? 'video.mp4',
            type: asset.mimeType ?? 'video/mp4',
        });
        xhr.send(form);
    });
}

// ─── Edit & upload sheet ──────────────────────────────────────────────────────

const EditExerciseSheet = ({ exercise, onClose, onSaved, onUploaded, authFetch }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);

    // Details
    const [name, setName]               = React.useState('');
    const [description, setDescription] = React.useState('');
    const [saving, setSaving]           = React.useState(false);

    // Video
    const [pickedAsset, setPickedAsset]     = React.useState(null);
    const [uploading, setUploading]         = React.useState(false);
    const [uploadProgress, setUploadProgress] = React.useState(0);

    React.useEffect(() => {
        if (exercise) {
            setName(exercise.name ?? '');
            setDescription(exercise.description ?? '');
            setPickedAsset(null);
            setUploading(false);
            setUploadProgress(0);
        }
    }, [exercise?.id]);

    if (!exercise) return null;

    const detailsChanged =
        name.trim() !== (exercise.name ?? '').trim() ||
        description.trim() !== (exercise.description ?? '').trim();

    // ── Save name / description ───────────────────────────────────────────────
    const handleSaveDetails = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            Alert.alert('Required', 'Exercise name cannot be empty.');
            return;
        }
        setSaving(true);
        try {
            const res = await authFetch(`${WORKER_URL}/demos/${exercise.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmedName, description: description.trim() }),
            });
            const body = await res.json();
            if (res.ok) {
                onSaved(exercise.id, trimmedName, description.trim());
            } else {
                Alert.alert('Error', body.error ?? 'Could not save details.');
            }
        } catch {
            Alert.alert('Error', 'Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // ── Pick video from library ───────────────────────────────────────────────
    const pickVideo = async (withEditing = false) => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsEditing: withEditing,
                // Note: `aspect` only affects image editing on iOS; videos use
                // the native trimmer which does not crop spatially.
                quality: 1,
            });

            if (result.canceled) return;
            const asset = result.assets[0];
            const { width, height } = asset;

            // Portrait check — only when the picker returns valid dimensions.
            // On some Android versions video dimensions may be absent; in that
            // case we accept the video and rely on the user to verify it.
            if (width != null && height != null && height > width) {
                if (withEditing) {
                    // Still portrait after the native editor — spatial crop
                    // requires an external app (e.g. ffmpeg-kit-react-native).
                    Alert.alert(
                        'Still Portrait',
                        'The video is still portrait. Please convert it to landscape (16:9) using a video editor before uploading.',
                        [
                            { text: 'OK', style: 'cancel' },
                            { text: 'Pick New Video', onPress: () => pickVideo(false) },
                        ]
                    );
                } else {
                    Alert.alert(
                        'Portrait Video',
                        'This video is portrait (taller than wide). Landscape orientation is required.\n\nTap "Open Editor" to use the native video editor, or pick a landscape video.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Pick New Video', onPress: () => pickVideo(false) },
                            { text: 'Open Editor', onPress: () => pickVideo(true) },
                        ]
                    );
                }
                return;
            }

            setPickedAsset(asset);
        } catch {
            Alert.alert(
                'Permission Denied',
                'Please allow access to your photo library in Settings.'
            );
        }
    };

    // ── Upload to Cloudflare Stream ───────────────────────────────────────────
    const handleUploadVideo = async () => {
        if (!pickedAsset) return;
        setUploading(true);
        setUploadProgress(0);
        try {
            // 1. Get a one-time direct-upload URL + uid from the worker
            const urlRes = await authFetch(
                `${WORKER_URL}/demos/${exercise.id}/stream-upload-url`,
                { method: 'POST' }
            );
            const { uploadURL, uid, error: urlError } = await urlRes.json();
            if (!urlRes.ok || !uploadURL || !uid) {
                throw new Error(urlError ?? 'Could not obtain upload URL.');
            }

            // 2. Upload directly to Cloudflare Stream (bypasses the worker)
            await uploadToStream(uploadURL, pickedAsset, setUploadProgress);

            // 3. Persist the stream ID in the demos table
            const patchRes = await authFetch(`${WORKER_URL}/demos/${exercise.id}/stream`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ streamId: uid }),
            });
            const patchBody = await patchRes.json();
            if (!patchRes.ok) {
                throw new Error(patchBody.error ?? 'Could not save stream ID.');
            }

            onUploaded(exercise.id);
        } catch (e) {
            Alert.alert('Upload Failed', e.message ?? 'An unexpected error occurred.');
            console.error(e);
        } finally {
            setUploading(false);
        }
    };

    const fileSizeMB = pickedAsset?.fileSize
        ? `${(pickedAsset.fileSize / 1_048_576).toFixed(1)} MB`
        : null;
    const durationSec = pickedAsset?.duration
        ? `${Math.round(pickedAsset.duration / 1000)}s`
        : null;
    const dimensions = (pickedAsset?.width != null && pickedAsset?.height != null)
        ? `${pickedAsset.width}×${pickedAsset.height}`
        : null;
    const pickedMeta = [dimensions, durationSec, fileSizeMB].filter(Boolean).join('  ·  ');

    return (
        <Modal transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.modalTitle}>Edit Exercise</Text>
                            <Text style={styles.modalSubtitle} numberOfLines={1}>
                                {exercise.name}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            accessibilityLabel="Close"
                            accessibilityRole="button"
                            hitSlop={12}
                        >
                            <Feather name="x" size={22} color={theme.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* ── Video ──────────────────────────────────────── */}
                        <Text style={styles.sectionLabel}>Video</Text>

                        {/* Audio warning */}
                        <View style={styles.warningStrip}>
                            <Feather
                                name="volume-x"
                                size={13}
                                color={WARNING_COLOR}
                                style={styles.stripIcon}
                            />
                            <Text style={[styles.stripText, { color: WARNING_COLOR }]}>
                                Videos must have no audio. Please mute or remove audio before
                                uploading — it cannot be stripped automatically.
                            </Text>
                        </View>

                        {/* Landscape requirement */}
                        <View style={styles.infoStrip}>
                            <Feather
                                name="monitor"
                                size={13}
                                color={theme.textTertiary}
                                style={styles.stripIcon}
                            />
                            <Text style={styles.stripText}>
                                Videos must be landscape (wider than tall). Portrait videos will
                                be rejected.
                            </Text>
                        </View>

                        {/* Selected video card */}
                        {pickedAsset && (
                            <View
                                style={styles.pickedCard}
                                accessibilityLabel={`Selected video: ${pickedAsset.fileName ?? 'video.mp4'}`}
                            >
                                <Feather name="film" size={22} color={theme.textPrimary} />
                                <View style={styles.pickedCardInfo}>
                                    <Text style={styles.pickedCardName} numberOfLines={1}>
                                        {pickedAsset.fileName ?? 'video.mp4'}
                                    </Text>
                                    {pickedMeta ? (
                                        <Text style={styles.pickedCardMeta}>{pickedMeta}</Text>
                                    ) : null}
                                </View>
                                {!uploading && (
                                    <Pressable
                                        onPress={() => setPickedAsset(null)}
                                        accessibilityLabel="Remove selected video"
                                        accessibilityRole="button"
                                        hitSlop={10}
                                    >
                                        <Feather
                                            name="x-circle"
                                            size={18}
                                            color={theme.textTertiary}
                                        />
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {/* Upload progress */}
                        {uploading && (
                            <View style={styles.progressContainer}>
                                <View style={styles.progressLabelRow}>
                                    <Text style={styles.progressLabel}>Uploading…</Text>
                                    <Text style={styles.progressLabel}>
                                        {Math.round(uploadProgress * 100)}%
                                    </Text>
                                </View>
                                <View
                                    style={styles.progressTrack}
                                    accessibilityRole="progressbar"
                                    accessibilityValue={{
                                        min: 0,
                                        max: 100,
                                        now: Math.round(uploadProgress * 100),
                                    }}
                                >
                                    <View
                                        style={[
                                            styles.progressFill,
                                            { width: `${Math.round(uploadProgress * 100)}%` },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}

                        {!uploading && (
                            <View style={styles.videoActions}>
                                <Pressable
                                    style={styles.pickButton}
                                    onPress={() => pickVideo(false)}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                        pickedAsset ? 'Change selected video' : 'Select video from library'
                                    }
                                >
                                    <Feather name="folder" size={14} color={theme.textPrimary} />
                                    <Text style={styles.pickButtonText}>
                                        {pickedAsset ? 'Change Video' : 'Select Video'}
                                    </Text>
                                </Pressable>

                                {pickedAsset && (
                                    <Pressable
                                        style={styles.uploadButton}
                                        onPress={handleUploadVideo}
                                        accessibilityRole="button"
                                        accessibilityLabel="Upload selected video to Cloudflare Stream"
                                    >
                                        <Feather name="upload-cloud" size={14} color="#000" />
                                        <Text style={styles.uploadButtonText}>Upload</Text>
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {/* ── Details ────────────────────────────────────── */}
                        <View style={styles.divider} />
                        <Text style={styles.sectionLabel}>Details</Text>

                        <Text style={styles.fieldLabel}>
                            Name <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={styles.textInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Exercise name"
                            placeholderTextColor={theme.inputPlaceholder}
                            returnKeyType="next"
                            accessibilityLabel="Exercise name"
                        />

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Description</Text>
                        <TextInput
                            style={[styles.textInput, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Optional description or filming notes…"
                            placeholderTextColor={theme.inputPlaceholder}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            accessibilityLabel="Exercise description"
                        />

                        {saving ? (
                            <ActivityIndicator
                                color={theme.accent}
                                style={{ marginTop: 16 }}
                            />
                        ) : (
                            <Pressable
                                style={[
                                    styles.saveButton,
                                    !detailsChanged && styles.saveButtonDisabled,
                                ]}
                                onPress={handleSaveDetails}
                                disabled={!detailsChanged}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !detailsChanged }}
                                accessibilityLabel="Save exercise details"
                            >
                                <Feather
                                    name="save"
                                    size={14}
                                    color={detailsChanged ? '#000' : theme.textTertiary}
                                />
                                <Text style={[
                                    styles.saveButtonText,
                                    !detailsChanged && styles.saveButtonTextDisabled,
                                ]}>
                                    Save Details
                                </Text>
                            </Pressable>
                        )}

                        <View style={{ height: 48 }} />
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Exercise row ─────────────────────────────────────────────────────────────

const ExerciseRow = ({ exercise, onEdit }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <View style={styles.row}>
            <View style={styles.rowContent}>
                <Text style={styles.rowName}>{exercise.name}</Text>
                {exercise.description ? (
                    <Text style={styles.rowDesc} numberOfLines={2}>
                        {exercise.description}
                    </Text>
                ) : null}
            </View>
            <Pressable
                style={styles.uploadRowButton}
                onPress={() => onEdit(exercise)}
                accessibilityRole="button"
                accessibilityLabel={`Upload video for ${exercise.name}`}
            >
                <Feather name="upload-cloud" size={15} color="#000" />
                <Text style={styles.uploadRowButtonText}>Upload</Text>
            </Pressable>
        </View>
    );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ToBeFilmedScreen() {
    const { authFetch } = useAuth();
    const { theme }     = useTheme();
    const styles        = makeStyles(theme);
    const scrollY = useScrollY();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));

    const [exercises, setExercises]         = React.useState([]);
    const [loading, setLoading]             = React.useState(true);
    const [loadingMore, setLoadingMore]     = React.useState(false);
    const [page, setPage]                   = React.useState(1);
    const [total, setTotal]                 = React.useState(0);
    const [searchInput, setSearchInput]     = React.useState('');
    const [search, setSearch]               = React.useState('');
    const [editTarget, setEditTarget]       = React.useState(null);

    const hasMore = exercises.length < total;

    // Debounce search
    React.useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchExercises = React.useCallback(async (opts = {}) => {
        const targetPage   = opts.page   ?? 1;
        const targetSearch = opts.search ?? search;
        const append       = opts.append ?? false;

        if (append) setLoadingMore(true);
        else        setLoading(true);

        try {
            const params = new URLSearchParams({
                page:     targetPage,
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
        } catch {
            Alert.alert('Error', 'Could not load exercises.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [search]);

    React.useEffect(() => {
        fetchExercises({ page: 1 });
    }, [search]);

    const loadMore = () => {
        if (!loadingMore && hasMore) fetchExercises({ page: page + 1, append: true });
    };

    // Update exercise name/description in list after details save
    const handleSaved = (exerciseId, newName, newDescription) => {
        setExercises(prev => prev.map(e =>
            e.id === exerciseId
                ? { ...e, name: newName, description: newDescription }
                : e
        ));
        setEditTarget(null);
    };

    // Remove exercise from list after successful video upload
    const handleUploaded = (exerciseId) => {
        setEditTarget(null);
        setExercises(prev => prev.filter(e => e.id !== exerciseId));
        setTotal(t => Math.max(0, t - 1));
    };

    const renderItem = ({ item }) => (
        <ExerciseRow exercise={item} onEdit={setEditTarget} />
    );

    const renderFooter = () =>
        loadingMore ? (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.accent} />
            </View>
        ) : null;

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.emptyContainer}>
                <Feather name="video" size={40} color={theme.surfaceBorder} />
                <Text style={styles.emptyTitle}>
                    {search
                        ? `No unfilmed exercises matching "${search}"`
                        : 'All caught up!'}
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
                    <Feather name="video-off" size={20} color={theme.textPrimary} />
                    <Text style={styles.headerTitle}>To Be Filmed</Text>
                </View>
                <Text style={styles.headerSubtitle}>
                    {total} exercise{total !== 1 ? 's' : ''} without a video
                </Text>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
                <Feather
                    name="search"
                    size={15}
                    color={theme.textSecondary}
                    style={{ marginRight: 8 }}
                />
                <TextInput
                    style={styles.searchInput}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    placeholder="Search exercises..."
                    placeholderTextColor={theme.textSecondary}
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search exercises"
                />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={exercises}
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

            <EditExerciseSheet
                exercise={editTarget}
                onClose={() => setEditTarget(null)}
                onSaved={handleSaved}
                onUploaded={handleUploaded}
                authFetch={authFetch}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container:          { flex: 1, backgroundColor: theme.background },

        header:             { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
        headerTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
        headerTitle:        { fontSize: 24, fontWeight: 'bold', color: theme.textPrimary },
        headerSubtitle:     { fontSize: 13, color: theme.textSecondary, marginTop: 4 },

        searchBox:          { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderRadius: 8, paddingHorizontal: 12, height: 38, marginHorizontal: 16, marginBottom: 12 },
        searchInput:        { flex: 1, color: theme.textPrimary, fontSize: 15 },

        listContent:        { paddingHorizontal: 16, paddingBottom: 40 },

        row:                { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceElevated, gap: 12 },
        rowContent:         { flex: 1 },
        rowName:            { fontSize: 16, color: theme.textPrimary, fontWeight: '600' },
        rowDesc:            { fontSize: 12, color: theme.textTertiary, marginTop: 4, lineHeight: 16 },
        uploadRowButton:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
        uploadRowButtonText:{ fontSize: 13, color: '#000', fontWeight: '700' },

        footerLoader:       { paddingVertical: 20, alignItems: 'center' },
        loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center' },

        emptyContainer:     { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
        emptyTitle:         { fontSize: 16, color: theme.textTertiary, textAlign: 'center', fontWeight: '600' },
        emptySubtitle:      { fontSize: 13, color: theme.surfaceBorder, textAlign: 'center', paddingHorizontal: 32 },

        // ── Modal ────────────────────────────────────────────────────────────
        modalOverlay:       { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
        modalCard:          { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, maxHeight: '92%' },
        modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
        modalTitle:         { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary },
        modalSubtitle:      { fontSize: 13, color: theme.textSecondary, marginTop: 2 },

        sectionLabel:       { fontSize: 11, fontWeight: '700', color: theme.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

        // Info / warning strips
        warningStrip:       { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: WARNING_BG, borderWidth: 0.5, borderColor: WARNING_BORDER, borderRadius: 8, padding: 10, marginBottom: 8 },
        infoStrip:          { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.surfaceElevated, borderWidth: 0.5, borderColor: theme.surfaceBorder, borderRadius: 8, padding: 10, marginBottom: 14 },
        stripIcon:          { marginRight: 6, flexShrink: 0, marginTop: 1 },
        stripText:          { fontSize: 12, color: theme.textTertiary, lineHeight: 17, flex: 1 },

        // Selected video card
        pickedCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderRadius: 10, padding: 12, marginBottom: 12 },
        pickedCardInfo:     { flex: 1, marginHorizontal: 10 },
        pickedCardName:     { fontSize: 14, color: theme.textPrimary, fontWeight: '600' },
        pickedCardMeta:     { fontSize: 12, color: theme.textTertiary, marginTop: 3 },

        // Upload progress bar
        progressContainer:  { marginBottom: 12 },
        progressLabelRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
        progressLabel:      { fontSize: 12, color: theme.textSecondary },
        progressTrack:      { height: 4, backgroundColor: theme.surfaceElevated, borderRadius: 2, overflow: 'hidden' },
        progressFill:       { height: 4, backgroundColor: theme.accent, borderRadius: 2 },

        // Video action buttons
        videoActions:       { flexDirection: 'row', gap: 10, marginBottom: 4 },
        pickButton:         { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingVertical: 11 },
        pickButtonText:     { fontSize: 14, color: theme.textPrimary, fontWeight: '600' },
        uploadButton:       { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 11 },
        uploadButtonText:   { fontSize: 14, color: '#000', fontWeight: '700' },

        divider:            { height: 1, backgroundColor: theme.surfaceBorder, marginVertical: 20 },

        // Details fields
        fieldLabel:         { fontSize: 12, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
        required:           { color: theme.accentText },
        textInput:          { borderWidth: 1, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
        textArea:           { minHeight: 90, paddingTop: 10 },

        // Save details button
        saveButton:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 12, marginTop: 16 },
        saveButtonDisabled: { backgroundColor: theme.surfaceElevated },
        saveButtonText:     { fontSize: 15, color: '#000', fontWeight: '700' },
        saveButtonTextDisabled: { color: theme.textTertiary },
    });
}
