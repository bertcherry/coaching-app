import * as React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../context/ThemeContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

function clientStreamUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/manifest/video.m3u8`;
}

function formatTs(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const ANNOTATION_FIELDS = [
    { key: 'observation',  label: 'Observation',  placeholder: 'e.g. knee valgus, right' },
    { key: 'rootCause',    label: 'Root Cause',   placeholder: 'e.g. hip, not ankle' },
    { key: 'cue',          label: 'Cue',          placeholder: 'e.g. screw feet into floor' },
    { key: 'programming',  label: 'Programming',  placeholder: 'e.g. add hip 90/90' },
];

export default function VideoAnnotationCard({ video, authFetch }) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);

    const [annotations, setAnnotations] = React.useState(
        () => [...(video.annotations ?? [])].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    );
    const [formOpen, setFormOpen] = React.useState(false);
    const [capturedTs, setCapturedTs] = React.useState(null);
    const [fields, setFields] = React.useState({ observation: '', rootCause: '', cue: '', programming: '' });
    const [saving, setSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState(null);

    const player = useVideoPlayer(
        { uri: clientStreamUrl(video.streamId) },
        p => { p.loop = false; p.muted = false; }
    );

    // Fetch annotations if not pre-loaded (GET /videos returns them without annotations)
    React.useEffect(() => {
        if (video.annotations != null) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(`${WORKER_URL}/videos/${video.id}/annotations`);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) {
                    setAnnotations(
                        [...(data.annotations ?? [])].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
                    );
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [video.id]);

    const handleCaptureTs = () => {
        player.pause();
        setCapturedTs(player.currentTime ?? 0);
        setFormOpen(true);
        setSaveError(null);
    };

    const handleCancel = () => {
        setFormOpen(false);
        setCapturedTs(null);
        setFields({ observation: '', rootCause: '', cue: '', programming: '' });
        setSaveError(null);
    };

    const handleSave = async () => {
        if (capturedTs === null) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await authFetch(`${WORKER_URL}/videos/${video.id}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestampSeconds: capturedTs,
                    observation:  fields.observation  || null,
                    rootCause:    fields.rootCause    || null,
                    cue:          fields.cue          || null,
                    programming:  fields.programming  || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error ?? 'Failed to save');
            }
            const data = await res.json();
            setAnnotations(prev =>
                [...prev, {
                    id: data.annotationId,
                    timestampSeconds: capturedTs,
                    ...Object.fromEntries(
                        Object.entries(fields).map(([k, v]) => [k, v || null])
                    ),
                    createdAt: new Date().toISOString(),
                }].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
            );
            handleCancel();
        } catch (e) {
            setSaveError(e.message ?? 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.card}>
            {/* Player */}
            <View style={styles.playerWrap}>
                <VideoView
                    player={player}
                    style={styles.player}
                    nativeControls
                    contentFit="contain"
                    accessibilityLabel="Client form video"
                />
            </View>

            {/* Add annotation / capture */}
            {!formOpen ? (
                <Pressable
                    style={styles.captureRow}
                    onPress={handleCaptureTs}
                    accessibilityRole="button"
                    accessibilityLabel="Pause video and add annotation at current time"
                >
                    <Feather name="plus-circle" size={13} color={theme.accentText} style={{ marginRight: 5 }} />
                    <Text style={styles.captureText}>Add annotation at current time</Text>
                </Pressable>
            ) : (
                <View style={styles.form}>
                    <Text style={styles.formHeader}>
                        {'Annotation at '}
                        <Text style={styles.formTs}>{formatTs(capturedTs)}</Text>
                        {'  '}
                        <Text
                            style={styles.recheckTs}
                            onPress={handleCaptureTs}
                            accessibilityRole="button"
                            accessibilityLabel="Re-capture timestamp from video"
                        >
                            re-capture
                        </Text>
                    </Text>

                    {ANNOTATION_FIELDS.map(f => (
                        <View key={f.key} style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>{f.label}</Text>
                            <TextInput
                                style={styles.fieldInput}
                                value={fields[f.key]}
                                onChangeText={v => setFields(prev => ({ ...prev, [f.key]: v }))}
                                placeholder={f.placeholder}
                                placeholderTextColor={theme.textSecondary}
                                multiline
                                autoCapitalize="sentences"
                                accessibilityLabel={f.label}
                            />
                        </View>
                    ))}

                    {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

                    <View style={styles.formButtons}>
                        <Pressable
                            style={styles.cancelButton}
                            onPress={handleCancel}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel annotation"
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={saving}
                            accessibilityRole="button"
                            accessibilityLabel="Save annotation"
                        >
                            {saving
                                ? <ActivityIndicator size="small" color={theme.textInverse} />
                                : <Text style={styles.saveText}>Save annotation</Text>
                            }
                        </Pressable>
                    </View>
                </View>
            )}

            {/* Annotations list — default open */}
            {annotations.length > 0 && (
                <View style={styles.annotList}>
                    <Text style={styles.annotListHeader}>
                        {annotations.length === 1 ? '1 annotation' : `${annotations.length} annotations`}
                    </Text>
                    {annotations.map((a, i) => (
                        <View
                            key={a.id ?? i}
                            style={[styles.annotItem, i > 0 && styles.annotItemBorder]}
                            accessible
                            accessibilityLabel={`Annotation at ${formatTs(a.timestampSeconds)}`}
                        >
                            <Text style={styles.annotTs}>{formatTs(a.timestampSeconds)}</Text>
                            <View style={styles.annotFields}>
                                {ANNOTATION_FIELDS.map(f => a[f.key] ? (
                                    <View key={f.key} style={styles.annotField}>
                                        <Text style={styles.annotFieldLabel}>{f.label}</Text>
                                        <Text style={styles.annotFieldValue}>{a[f.key]}</Text>
                                    </View>
                                ) : null)}
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        card: {
            marginTop: 8,
            marginHorizontal: 0,
            borderWidth: 0.5,
            borderColor: theme.surfaceBorder,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: theme.surface,
        },

        playerWrap: { backgroundColor: '#000', width: '100%' },
        player:     { width: '100%', aspectRatio: 16 / 9 },

        captureRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 0.5,
            borderTopColor: theme.surfaceBorder,
        },
        captureText: { fontSize: 13, color: theme.accentText, fontWeight: '500' },

        form: {
            borderTopWidth: 0.5,
            borderTopColor: theme.surfaceBorder,
            padding: 12,
            gap: 10,
        },
        formHeader: { fontSize: 12, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
        formTs:     { color: theme.accentText },
        recheckTs:  { color: theme.accentText, textDecorationLine: 'underline', fontWeight: '400', textTransform: 'none', letterSpacing: 0 },

        fieldRow:   { gap: 4 },
        fieldLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
        fieldInput: {
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 6,
            backgroundColor: theme.surfaceElevated,
            color: theme.textPrimary,
            fontSize: 14,
            paddingHorizontal: 10,
            paddingVertical: 7,
            minHeight: 38,
        },

        saveError: { fontSize: 12, color: theme.danger },

        formButtons: { flexDirection: 'row', gap: 8, marginTop: 2 },
        cancelButton: {
            flex: 1,
            paddingVertical: 9,
            borderRadius: 7,
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            alignItems: 'center',
        },
        cancelText:  { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
        saveButton:  {
            flex: 2,
            paddingVertical: 9,
            borderRadius: 7,
            backgroundColor: theme.accentText,
            alignItems: 'center',
        },
        saveButtonDisabled: { opacity: 0.5 },
        saveText: { fontSize: 14, color: theme.textInverse, fontWeight: '600' },

        annotList: {
            borderTopWidth: 0.5,
            borderTopColor: theme.surfaceBorder,
            padding: 12,
            gap: 0,
        },
        annotListHeader: {
            fontSize: 11,
            color: theme.textSecondary,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 8,
        },
        annotItem:       { paddingVertical: 8 },
        annotItemBorder: { borderTopWidth: 0.5, borderTopColor: theme.surfaceBorder },
        annotTs:         { fontSize: 13, color: theme.accentText, fontWeight: '700', marginBottom: 6 },
        annotFields:     { gap: 4 },
        annotField:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
        annotFieldLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, minWidth: 88, paddingTop: 1 },
        annotFieldValue: { fontSize: 14, color: theme.textPrimary, flex: 1, lineHeight: 20 },
    });
}
