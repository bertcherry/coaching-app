import * as React from 'react';
import {
    View, Text, StyleSheet, TextInput,
    Pressable, ActivityIndicator, Alert, ScrollView,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const WORKER_URL      = 'https://coaching-app.bert-m-cherry.workers.dev';
const CF_STREAM_BASE  = 'https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com';

const WARNING_COLOR  = '#d97706';
const WARNING_BG     = 'rgba(217,119,6,0.10)';
const WARNING_BORDER = 'rgba(217,119,6,0.30)';

// ─── XHR upload to Cloudflare Stream direct-creator-upload URL ────────────────
function uploadToStream(uploadURL, asset, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadURL);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        });
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status}).`));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

        const form = new FormData();
        form.append('file', {
            uri:  asset.uri,
            name: asset.fileName ?? 'video.mp4',
            type: asset.mimeType ?? 'video/mp4',
        });
        xhr.send(form);
    });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExerciseDetailScreen({ route, navigation }) {
    const { exercise: initialExercise } = route.params;
    const { authFetch } = useAuth();
    const { theme }     = useTheme();
    const styles        = makeStyles(theme);

    const [exercise, setExercise]   = React.useState(initialExercise);
    const [fetching, setFetching]   = React.useState(true);

    // Edit fields
    const [name, setName]               = React.useState(initialExercise.name        ?? '');
    const [description, setDescription] = React.useState(initialExercise.description ?? '');
    const [saving, setSaving]           = React.useState(false);

    // Video upload
    const [pickedAsset, setPickedAsset]         = React.useState(null);
    const [uploading, setUploading]             = React.useState(false);
    const [uploadProgress, setUploadProgress]   = React.useState(0);

    // ── Fetch fresh exercise data on mount ────────────────────────────────────
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(`${WORKER_URL}/demos/${initialExercise.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) {
                        setExercise(data);
                        setName(data.name        ?? '');
                        setDescription(data.description ?? '');
                    }
                }
            } finally {
                if (!cancelled) setFetching(false);
            }
        })();
        return () => { cancelled = true; };
    }, [initialExercise.id]);

    // Keep nav title in sync with exercise name
    React.useEffect(() => {
        navigation.setOptions({ title: exercise.name });
    }, [exercise.name]);

    const detailsChanged =
        name.trim()        !== (exercise.name        ?? '').trim() ||
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
                setExercise(prev => ({ ...prev, name: trimmedName, description: description.trim() }));
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
                quality: 1,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            const { width, height } = asset;

            if (width != null && height != null && height > width) {
                if (withEditing) {
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
            Alert.alert('Permission Denied', 'Please allow access to your photo library in Settings.');
        }
    };

    // ── Upload to Cloudflare Stream ───────────────────────────────────────────
    const handleUploadVideo = async () => {
        if (!pickedAsset) return;
        setUploading(true);
        setUploadProgress(0);
        try {
            const urlRes = await authFetch(
                `${WORKER_URL}/demos/${exercise.id}/stream-upload-url`,
                { method: 'POST' }
            );
            const { uploadURL, uid, error: urlError } = await urlRes.json();
            if (!urlRes.ok || !uploadURL || !uid) {
                throw new Error(urlError ?? 'Could not obtain upload URL.');
            }

            await uploadToStream(uploadURL, pickedAsset, setUploadProgress);

            const patchRes = await authFetch(`${WORKER_URL}/demos/${exercise.id}/stream`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ streamId: uid }),
            });
            const patchBody = await patchRes.json();
            if (!patchRes.ok) throw new Error(patchBody.error ?? 'Could not save stream ID.');

            setExercise(prev => ({ ...prev, streamId: uid, hasVideo: 1 }));
            setPickedAsset(null);
            Alert.alert('Success', 'Video uploaded successfully.');
        } catch (e) {
            Alert.alert('Upload Failed', e.message ?? 'An unexpected error occurred.');
        } finally {
            setUploading(false);
        }
    };

    const fileSizeMB  = pickedAsset?.fileSize
        ? `${(pickedAsset.fileSize / 1_048_576).toFixed(1)} MB`
        : null;
    const durationSec = pickedAsset?.duration
        ? `${Math.round(pickedAsset.duration / 1000)}s`
        : null;
    const dimensions  = (pickedAsset?.width != null && pickedAsset?.height != null)
        ? `${pickedAsset.width}×${pickedAsset.height}`
        : null;
    const pickedMeta  = [dimensions, durationSec, fileSizeMB].filter(Boolean).join('  ·  ');

    const hasVideo = !!exercise.streamId;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* ── Loading overlay while re-fetching ─────────────────── */}
                {fetching && (
                    <ActivityIndicator
                        color={theme.accent}
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* ── Demo video player ─────────────────────────────────── */}
                {hasVideo && (
                    <>
                        <Text style={styles.sectionLabel}>Demo Video</Text>
                        <View style={styles.videoContainer}>
                            <Video
                                style={styles.video}
                                source={{ uri: `${CF_STREAM_BASE}/${exercise.streamId}/manifest/video.mpd` }}
                                useNativeControls
                                resizeMode={ResizeMode.CONTAIN}
                                isLooping
                                shouldPlay={false}
                            />
                        </View>
                    </>
                )}

                {/* ── Details ──────────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, hasVideo && { marginTop: 24 }]}>Details</Text>

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
                    placeholder="Optional description or coaching notes…"
                    placeholderTextColor={theme.inputPlaceholder}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    accessibilityLabel="Exercise description"
                />

                {saving ? (
                    <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
                ) : (
                    <Pressable
                        style={[styles.saveButton, !detailsChanged && styles.saveButtonDisabled]}
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

                {/* ── Upload / replace video ────────────────────────────── */}
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>
                    {hasVideo ? 'Replace Video' : 'Upload Video'}
                </Text>

                <View style={styles.warningStrip}>
                    <Feather name="volume-x" size={13} color={WARNING_COLOR} style={styles.stripIcon} />
                    <Text style={[styles.stripText, { color: WARNING_COLOR }]}>
                        Videos must have no audio. Please mute or remove audio before
                        uploading — it cannot be stripped automatically.
                    </Text>
                </View>

                <View style={styles.infoStrip}>
                    <Feather name="monitor" size={13} color={theme.textTertiary} style={styles.stripIcon} />
                    <Text style={styles.stripText}>
                        Videos must be landscape (wider than tall). Portrait videos will be rejected.
                    </Text>
                </View>

                {pickedAsset && (
                    <View style={styles.pickedCard}>
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
                                hitSlop={10}
                            >
                                <Feather name="x-circle" size={18} color={theme.textTertiary} />
                            </Pressable>
                        )}
                    </View>
                )}

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
                            accessibilityValue={{ min: 0, max: 100, now: Math.round(uploadProgress * 100) }}
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
                            accessibilityLabel={pickedAsset ? 'Change selected video' : 'Select video from library'}
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
                                accessibilityLabel="Upload selected video"
                            >
                                <Feather name="upload-cloud" size={14} color="#000" />
                                <Text style={styles.uploadButtonText}>Upload</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                <View style={{ height: 48 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container:     { flex: 1, backgroundColor: theme.background },
        scrollContent: { padding: 16 },

        sectionLabel:  { fontSize: 11, fontWeight: '700', color: theme.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

        videoContainer: { backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', aspectRatio: 16 / 9, marginBottom: 4 },
        video:          { flex: 1 },

        fieldLabel:    { fontSize: 12, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
        required:      { color: theme.accentText },
        textInput:     { borderWidth: 1, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.inputText, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
        textArea:      { minHeight: 90, paddingTop: 10 },

        saveButton:            { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 12, marginTop: 16 },
        saveButtonDisabled:    { backgroundColor: theme.surfaceElevated },
        saveButtonText:        { fontSize: 15, color: '#000', fontWeight: '700' },
        saveButtonTextDisabled:{ color: theme.textTertiary },

        divider: { height: 1, backgroundColor: theme.surfaceBorder, marginVertical: 20 },

        warningStrip: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: WARNING_BG, borderWidth: 0.5, borderColor: WARNING_BORDER, borderRadius: 8, padding: 10, marginBottom: 8 },
        infoStrip:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.surfaceElevated, borderWidth: 0.5, borderColor: theme.surfaceBorder, borderRadius: 8, padding: 10, marginBottom: 14 },
        stripIcon:    { marginRight: 6, flexShrink: 0, marginTop: 1 },
        stripText:    { fontSize: 12, color: theme.textTertiary, lineHeight: 17, flex: 1 },

        pickedCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderRadius: 10, padding: 12, marginBottom: 12 },
        pickedCardInfo: { flex: 1, marginHorizontal: 10 },
        pickedCardName: { fontSize: 14, color: theme.textPrimary, fontWeight: '600' },
        pickedCardMeta: { fontSize: 12, color: theme.textTertiary, marginTop: 3 },

        progressContainer: { marginBottom: 12 },
        progressLabelRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
        progressLabel:     { fontSize: 12, color: theme.textSecondary },
        progressTrack:     { height: 4, backgroundColor: theme.surfaceElevated, borderRadius: 2, overflow: 'hidden' },
        progressFill:      { height: 4, backgroundColor: theme.accent, borderRadius: 2 },

        videoActions:   { flexDirection: 'row', gap: 10, marginBottom: 4 },
        pickButton:     { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingVertical: 11 },
        pickButtonText: { fontSize: 14, color: theme.textPrimary, fontWeight: '600' },
        uploadButton:   { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 11 },
        uploadButtonText: { fontSize: 14, color: '#000', fontWeight: '700' },
    });
}
