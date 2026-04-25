import * as React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'expo-video';
import SetRow from './SetRow';
import { useTheme } from '../context/ThemeContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

function streamUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/manifest/video.m3u8`;
}

const VideoPlayer = ({ streamId, autoplay = true }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const player = useVideoPlayer({ uri: streamUrl(streamId) }, p => {
        p.loop = true;
        p.muted = true;
        if (autoplay) p.play();
    });
    return (
        <View style={styles.videoContainer}>
            <VideoView player={player} style={styles.video} nativeControls contentFit="contain" testID="video-player" />
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
    setConfigs,       // per-set coach targets [{ weight, rpe, countMin }]
    readOnly,         // when true: hides the log-sets button (edit icon)
    isCompleted,      // workout is completed — show summary, hide video
    completedHistory, // map of `${exerciseId}-${setNumber}` → history record
    initialShowVideo = false, // from WorkoutDisplayContext — default open without autoplay
}) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [demo,         setDemo]         = React.useState(null);
    const [loading,      setLoading]      = React.useState(true);
    const [showLogs,     setShowLogs]     = React.useState(false);
    const [showVideo,    setShowVideo]    = React.useState(initialShowVideo);
    // false = no autoplay when default-open; becomes true on first user-initiated open
    const [videoAutoplay, setVideoAutoplay] = React.useState(false);
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
        ? `${resolvedSetsMin}–${resolvedSetsMax} sets`
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
                    {hasVideo && !isCompleted && (
                        <Pressable
                            style={[styles.iconButton, showVideo && styles.iconButtonActive]}
                            onPress={() => {
                                if (!showVideo) setVideoAutoplay(true);
                                setShowVideo(v => !v);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={showVideo ? `Hide ${displayName} demo video` : `Show ${displayName} demo video`}
                            accessibilityState={{ expanded: showVideo }}
                        >
                            <Feather name="film" size={15} color={showVideo ? theme.accentText : theme.surfaceBorder} />
                        </Pressable>
                    )}
                    {!readOnly && (
                        <Pressable
                            style={[styles.iconButton, showLogs && styles.iconButtonActive, requiredComplete && styles.iconButtonDone]}
                            onPress={() => setShowLogs(v => !v)}
                        >
                            <Feather
                                name={requiredComplete && !showLogs ? 'check' : 'clipboard'}
                                size={15}
                                color={requiredComplete ? theme.success : showLogs ? theme.accentText : theme.textPrimary}
                            />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Coach notes — hidden on completed view */}
            {coachNotes && !isCompleted ? (
                <View style={styles.coachNotesContainer}>
                    <Feather name="message-square" size={12} color={theme.textSecondary} style={{ marginRight: 6, marginTop: 1, flexShrink: 0 }} />
                    <Text style={styles.coachNotesText}>{coachNotes}</Text>
                </View>
            ) : null}

            {/* Completed workout summary — always visible, hidden when edit panel is open */}
            {isCompleted && !showLogs && completedHistory && (() => {
                const setNums = Array.from({ length: totalSets }, (_, i) => i + 1);
                const loggedSets = setNums
                    .map(n => ({ n, record: completedHistory[`${id}-${n}`] }))
                    .filter(({ record }) => record);
                if (loggedSets.length === 0) return null;
                return (
                    <View style={styles.completedSummary}>
                        {loggedSets.map(({ n, record }) => {
                            const parts = [];
                            if (record.weight != null) parts.push(`${record.weight} ${record.weightUnit ?? ''}`);
                            else if (record.weightUnit) parts.push(record.weightUnit);
                            if (record.reps != null) parts.push(`${record.reps} ${countType === 'Timed' ? 'sec' : 'reps'}`);
                            if (record.rpe  != null) parts.push(`RPE ${record.rpe}`);
                            return (
                                <View key={n} style={styles.summaryRow}>
                                    <Text style={styles.summarySetLabel}>Set {n}</Text>
                                    <Text style={styles.summaryValues}>{parts.join('  ·  ') || '—'}</Text>
                                    {record.note ? <Text style={styles.summaryNote}>{record.note}</Text> : null}
                                </View>
                            );
                        })}
                    </View>
                );
            })()}

            {showVideo && hasVideo && !isCompleted && (
                <>
                    <VideoPlayer streamId={demo.streamId} autoplay={videoAutoplay} />
                    {demo.description ? (
                        <View
                            style={styles.videoDescriptionContainer}
                            accessible={true}
                            accessibilityRole="text"
                            accessibilityLabel={`Exercise description: ${demo.description}`}
                            testID="video-description"
                        >
                            <Text style={styles.videoDescriptionText}>{demo.description}</Text>
                        </View>
                    ) : null}
                </>
            )}

            {showLogs && (
                <View style={styles.logsContainer}>
                    <View style={styles.logsHeader}>
                        {requiredComplete && (
                            <View style={styles.setsHeaderRow}>
                                <Feather name="check" size={13} color={theme.success} style={styles.setsHeaderCheck} />
                                <Text style={[styles.setsHeader, styles.setsHeaderDone]}>All sets logged</Text>
                            </View>
                        )}
                        {/* Recommendations as helper text above set rows */}
                        {(recommendedWeight || recommendedRpe) && (
                            <View style={styles.recBanner}>
                                <Feather name="info" size={12} color={theme.accentText} style={{ marginRight: 6 }} />
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
                            noBorderTop={setNumber === 1 && !requiredComplete && !(recommendedWeight || recommendedRpe)}
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
                            loggedRecord={completedHistory?.[`${id}-${setNumber}`] ?? null}
                            onSave={handleSetSaved}
                        />
                    ))}
                </View>
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
        iconButtonActive:{ borderColor: theme.accentText, backgroundColor: theme.accentSubtle },
        iconButtonDone:  { borderColor: theme.success, backgroundColor: theme.surface },
        noVideoTag:      { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },

        coachNotesContainer: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.accentSubtle, borderLeftWidth: 2, borderLeftColor: theme.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4 },
        coachNotesText:      { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18, fontStyle: 'italic' },

        videoContainer:            { flex: 1, justifyContent: 'center', backgroundColor: theme.background },
        video:                     { alignSelf: 'center', width: 320, height: 200 },
        videoDescriptionContainer: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.surface, borderRadius: 6 },
        videoDescriptionText:      { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },

        completedSummary: { marginHorizontal: 16, marginBottom: 8, gap: 4 },
        summaryRow:       { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingVertical: 3, borderTopWidth: 0.5, borderTopColor: theme.surfaceBorder },
        summarySetLabel:  { fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 38 },
        summaryValues:    { fontSize: 13, color: theme.textPrimary, flex: 1 },
        summaryNote:      { fontSize: 12, color: theme.textSecondary, fontStyle: 'italic', width: '100%', paddingLeft: 44 },

        logsContainer: { backgroundColor: theme.surface, marginHorizontal: 8, marginBottom: 8, borderRadius: 8, padding: 10, borderWidth: 0.5, borderColor: theme.surfaceBorder },
        logsHeader:    { marginBottom: 8, gap: 6 },
        setsHeaderRow:   { flexDirection: 'row', alignItems: 'center' },
        setsHeaderCheck: { marginRight: 4 },
        setsHeader:      { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
        setsHeaderDone:  { color: theme.success },
        recBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 0.5, borderColor: theme.accentText, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
        recBannerText: { fontSize: 12, color: theme.accentText, fontStyle: 'italic' },
    });
}