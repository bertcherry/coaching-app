import * as React from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Video, ResizeMode } from 'expo-av';
import SetRow from './SetRow';

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
}) {
    const [demo,      setDemo]      = React.useState(null);
    const [loading,   setLoading]   = React.useState(true);
    const [showLogs,  setShowLogs]  = React.useState(false);
    const [showVideo, setShowVideo] = React.useState(false);

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
                            <Feather name="film" size={15} color={showVideo ? '#fba8a0' : '#fae9e9'} />
                        </Pressable>
                    )}
                    {!hasVideo && <View style={styles.noVideoTag}><Feather name="video-off" size={12} color="#333" /></View>}
                    <Pressable style={[styles.iconButton, showLogs && styles.iconButtonActive]} onPress={() => setShowLogs(v => !v)}>
                        <Feather name="edit-3" size={15} color={showLogs ? '#fba8a0' : '#fae9e9'} />
                    </Pressable>
                </View>
            </View>

            {/* Coach notes — shown as guidance below exercise row */}
            {coachNotes ? (
                <View style={styles.coachNotesContainer}>
                    <Feather name="message-square" size={12} color="#fba8a0" style={{ marginRight: 6, marginTop: 1, flexShrink: 0 }} />
                    <Text style={styles.coachNotesText}>{coachNotes}</Text>
                </View>
            ) : null}

            {showVideo && hasVideo && <VideoPlayer streamId={demo.streamId} />}

            {showLogs && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.logsContainer}>
                    <View style={styles.logsHeader}>
                        <Text style={styles.setsHeader}>
                            {setsLabel ?? `${totalSets} sets`} · {formatPrescription({ countType, countMin, countMax, timeCapSeconds })}
                        </Text>
                        {/* Recommendations as helper text above set rows */}
                        {(recommendedWeight || recommendedRpe) && (
                            <View style={styles.recBanner}>
                                <Feather name="info" size={12} color="#fba8a0" style={{ marginRight: 6 }} />
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
                            onSave={onSetSaved}
                        />
                    ))}
                </KeyboardAvoidingView>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    itemContainer:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4, paddingVertical: 8 },
    exerciseInfo:    { flex: 1 },
    exerciseText:    { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, fontSize: 16, color: '#fae9e9', fontWeight: '500' },
    pillsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 4 },
    pill:            { backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
    pillText:        { fontSize: 12, color: '#ccc' },
    loadingText:     { padding: 20, fontSize: 14, color: '#888' },
    actionButtons:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8, paddingTop: 4 },
    iconButton:      { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderColor: '#222', borderWidth: 1, borderRadius: 8 },
    iconButtonActive:{ borderColor: '#fba8a0', backgroundColor: 'rgba(251,168,160,0.08)' },
    noVideoTag:      { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },

    coachNotesContainer: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(251,168,160,0.05)', borderLeftWidth: 2, borderLeftColor: 'rgba(251,168,160,0.3)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4 },
    coachNotesText:      { fontSize: 13, color: '#ccc', flex: 1, lineHeight: 18, fontStyle: 'italic' },

    videoContainer: { flex: 1, justifyContent: 'center', backgroundColor: 'black' },
    video:          { alignSelf: 'center', width: 320, height: 200 },

    logsContainer: { backgroundColor: '#0d0d0d', marginHorizontal: 8, marginBottom: 8, borderRadius: 8, padding: 10, borderWidth: 0.5, borderColor: '#222' },
    logsHeader:    { marginBottom: 8, gap: 6 },
    setsHeader:    { fontSize: 11, color: '#bbb', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    recBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251,168,160,0.06)', borderWidth: 0.5, borderColor: 'rgba(251,168,160,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
    recBannerText: { fontSize: 12, color: '#fba8a0', fontStyle: 'italic' },
});