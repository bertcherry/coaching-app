import * as React from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Video, ResizeMode } from 'expo-av';
import SetRow from './SetRow';
import { useTheme } from '../context/ThemeContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

function streamUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/manifest/video.mpd`;
}

const VideoPlayer = ({ streamId }) => {
    const videoRef = React.useRef(null);
    return (
        <View style={styles.videoContainer}>
            <Video ref={videoRef} style={styles.video} source={{ uri: streamUrl(streamId) }}
                useNativeControls resizeMode={ResizeMode.CONTAIN} isLooping isMuted shouldPlay />
        </View>
    );
};

function formatPrescription(item) {
    const { countType, countMin, countMax, timeCapSeconds } = item;
    if (!countType) return '';
    if (countType === 'AMRAP') return timeCapSeconds ? `AMRAP · ${Math.round(timeCapSeconds / 60)} min cap` : 'AMRAP';
    const unit = countType === 'Timed' ? 'sec' : 'reps';
    if (countMax) return `${countMin}–${countMax} ${unit}`;
    if (countMin) return `${countMin} ${unit}`;
    return countType;
}

export default function WorkoutPreviewItem({
    workoutId, clientId, unitDefault, onSetSaved,
    id, name,
    sets,      // legacy
    setsMin, setsMax,
    countType, countMin, countMax, timeCapSeconds,
    recommendedRpe, recommendedWeight,
    coachNotes,
    setConfigs, // per-set coach targets [{ weight, rpe, countMin }]
    readOnly,   // when true: hides the log-sets button (edit icon)
}) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [demo,         setDemo]         = React.useState(null);
    const [loading,      setLoading]      = React.useState(true);
    const [showLogs,     setShowLogs]     = React.useState(false);
    const [showVideo,    setShowVideo]    = React.useState(false);
    const [savedSetNums, setSavedSetNums] = React.useState(() => new Set());

    // Close log panel when readOnly becomes true (e.g. leaving edit mode)
    React.useEffect(() => {
        if (readOnly) setShowLogs(false);
    }, [readOnly]);

    // Intercept onSetSaved to track which sets have been saved
    const handleSetSaved = React.useCallback((record) => {
        setSavedSetNums(prev => {
            if (prev.has(record.set)) return prev;
            const next = new Set(prev);
            next.add(record.set);
            return next;
        });
        onSetSaved?.(record);
    }, [onSetSaved]);

    React.useEffect(() => {
        if (!id) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const res  = await fetch(`${WORKER_URL}/demos/${id}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (!cancelled) setDemo(data);
            } catch {
                if (!cancelled) setDemo({ id, name, hasVideo: false, streamId: null });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    // Resolve sets: new setsMin/setsMax > legacy sets
    const resolvedSetsMin = setsMin ?? (sets ? parseInt(sets) : null);
    const resolvedSetsMax = setsMax ?? null;
    const hasRange        = resolvedSetsMax && resolvedSetsMax > (resolvedSetsMin ?? 0);
    const totalSets       = resolvedSetsMax ?? resolvedSetsMin ?? 1;
    const requiredSets    = resolvedSetsMin ?? totalSets;
    const setRows         = Array.from({ length: totalSets }, (_, i) => ({ setNumber: i + 1, isOptional: i >= requiredSets }));

    // Required sets are 1..requiredSets. Complete = every required set has been saved.
    const requiredComplete = requiredSets > 0 &&
        Array.from({ length: requiredSets }, (_, i) => i + 1).every(n => savedSetNums.has(n));

    const setsLabel = hasRange
        ? `${resolvedSetsMin}–${resolvedSetsMax} sets (+${resolvedSetsMax - resolvedSetsMin} optional)`
        : resolvedSetsMin ? `${resolvedSetsMin} set${resolvedSetsMin !== 1 ? 's' : ''}` : null;

    const displayName = demo?.name ?? name ?? 'Unknown exercise';
    const hasVideo    = !!demo?.streamId;

    if (loading) return (
        <View style={styles.itemContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
        </View>
    );

    return (
        <>
            <View style={styles.itemContainer}>
                <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseText}>{displayName}</Text>
                    <View style={styles.pillsRow}>
                        {setsLabel && (
                            <View style={styles.pill}>
                                <Text style={styles.pillText}>{setsLabel}</Text>
                            </View>
                        )}
                        {countType && (
                            <View style={styles.pill}>
                                <Text style={styles.pillText}>
                                    {formatPrescription({ countType, countMin, countMax, timeCapSeconds })}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.actionButtons}>
                    {hasVideo && (
                        <Pressable style={[styles.iconButton, showVideo && styles.iconButtonActive]} onPress={() => setShowVideo(v => !v)}>
                            <Feather name="film" size={15} color={showVideo ? theme.accent : theme.textPrimary} />
                        </Pressable>
                    )}
                    {!hasVideo && <View style={styles.noVideoTag}><Feather name="video-off" size={12} color={theme.surfaceBorder} /></View>}
                    {!readOnly && (
                        <Pressable
                            style={[styles.iconButton, showLogs && styles.iconButtonActive, requiredComplete && styles.iconButtonDone]}
                            onPress={() => setShowLogs(v => !v)}
                        >
                            <Feather
                                name={requiredComplete && !showLogs ? 'check' : 'edit-3'}
                                size={15}
                                color={requiredComplete ? theme.success : showLogs ? theme.accent : theme.textPrimary}
                            />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Coach notes — shown as guidance below exercise row */}
            {coachNotes ? (
                <View style={styles.coachNotesContainer}>
                    <Feather name="message-square" size={12} color={theme.accent} style={{ marginRight: 6, marginTop: 1, flexShrink: 0 }} />
                    <Text style={styles.coachNotesText}>{coachNotes}</Text>
                </View>
            ) : null}

            {showVideo && hasVideo && <VideoPlayer streamId={demo.streamId} />}

            {showLogs && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.logsContainer}>
                    <View style={styles.logsHeader}>
                        <View style={styles.setsHeaderRow}>
                            {requiredComplete && <Feather name="check" size={13} color={theme.success} style={styles.setsHeaderCheck} />}
                            <Text style={[styles.setsHeader, requiredComplete && styles.setsHeaderDone]}>
                                {setsLabel ?? `${totalSets} sets`} · {formatPrescription({ countType, countMin, countMax, timeCapSeconds })}
                            </Text>
                        </View>
                        {/* Recommendations as helper text above set rows */}
                        {(recommendedWeight || recommendedRpe) && (
                            <View style={styles.recBanner}>
                                <Feather name="info" size={12} color={theme.accent} style={{ marginRight: 6 }} />
                                <Text style={styles.recBannerText}>
                                    Coach rec:{recommendedWeight ? ` ${recommendedWeight} ${unitDefault ?? 'lbs'}` : ''}{recommendedRpe ? `  ·  RPE ${recommendedRpe}` : ''}
                                </Text>
                            </View>
                        )}
                    </View>

                    {setRows.map(({ setNumber, isOptional }) => (
                        <SetRow
                            key={`${id}-set-${setNumber}`}
                            setNumber={setNumber}
                            isOptional={isOptional}
                            exerciseId={id}
                            workoutId={workoutId}
                            clientId={clientId}
                            unitDefault={unitDefault}
                            countType={countType}
                            countMin={countMin != null ? parseFloat(countMin) : null}
                            countMax={countMax != null ? parseFloat(countMax) : null}
                            timeCapSeconds={timeCapSeconds != null ? parseFloat(timeCapSeconds) : null}
                            recommendedWeight={recommendedWeight ?? null}
                            recommendedRpe={recommendedRpe ?? null}
                            setConfig={Array.isArray(setConfigs) ? (setConfigs[setNumber - 1] ?? null) : null}
                            onSave={handleSetSaved}
                        />
                    ))}
                </KeyboardAvoidingView>
            )}
        </>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        itemContainer:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4, paddingVertical: 8 },
        exerciseInfo:    { flex: 1 },
        exerciseText:    { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, fontSize: 16, color: theme.textPrimary, fontWeight: '500' },
        pillsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 4 },
        pill:            { backgroundColor: theme.surfaceElevated, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
        pillText:        { fontSize: 12, color: theme.textSecondary },
        loadingText:     { padding: 20, fontSize: 14, color: theme.textSecondary },
        actionButtons:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8, paddingTop: 4 },
        iconButton:      { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderColor: theme.surfaceBorder, borderWidth: 1, borderRadius: 8 },
        iconButtonActive:{ borderColor: theme.accent, backgroundColor: theme.accentSubtle },
        iconButtonDone:  { borderColor: theme.success, backgroundColor: theme.surface },
        noVideoTag:      { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },

        coachNotesContainer: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.accentSubtle, borderLeftWidth: 2, borderLeftColor: theme.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4 },
        coachNotesText:      { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18, fontStyle: 'italic' },

        videoContainer: { flex: 1, justifyContent: 'center', backgroundColor: theme.background },
        video:          { alignSelf: 'center', width: 320, height: 200 },

        logsContainer: { backgroundColor: theme.surface, marginHorizontal: 8, marginBottom: 8, borderRadius: 8, padding: 10, borderWidth: 0.5, borderColor: theme.surfaceBorder },
        logsHeader:    { marginBottom: 8, gap: 6 },
        setsHeaderRow:   { flexDirection: 'row', alignItems: 'center' },
        setsHeaderCheck: { marginRight: 4 },
        setsHeader:      { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
        setsHeaderDone:  { color: theme.success },
        recBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 0.5, borderColor: theme.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
        recBannerText: { fontSize: 12, color: theme.accent, fontStyle: 'italic' },
    });
}