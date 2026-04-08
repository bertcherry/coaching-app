import * as React from 'react';
import {
    View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Video, ResizeMode } from 'expo-av';
import SetRow from './SetRow';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Stream URL helper ────────────────────────────────────────────────────────

function streamUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/manifest/video.mpd`;
}

// ─── Video player (only rendered when hasVideo) ───────────────────────────────

const VideoPlayer = ({ streamId }) => {
    const videoRef = React.useRef(null);
    return (
        <View style={styles.videoContainer}>
            <Video
                ref={videoRef}
                style={styles.video}
                source={{ uri: streamUrl(streamId) }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
                isMuted
                shouldPlay
            />
        </View>
    );
};

// ─── Prescription formatter ───────────────────────────────────────────────────

function formatPrescription(item) {
    const { countType, countMin, countMax, timeCapSeconds } = item;
    if (!countType) return '';
    if (countType === 'AMRAP') {
        return timeCapSeconds
            ? `AMRAP · ${Math.round(timeCapSeconds / 60)} min cap`
            : 'AMRAP';
    }
    const unit = countType === 'Timed' ? 'sec' : 'reps';
    if (countMax) return `${countMin}–${countMax} ${unit}`;
    if (countMin) return `${countMin} ${unit}`;
    return countType;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkoutPreviewItem({
    workoutId,
    clientId,
    unitDefault,
    onSetSaved,
    // exercise fields from workout JSON
    id,         // stable demo UUID
    name,       // may be pre-filled from workout JSON; will be overwritten by API response
    sets,
    countType,
    countMin,
    countMax,
    timeCapSeconds,
}) {
    const [demo, setDemo]         = React.useState(null);  // full demo row from API
    const [loading, setLoading]   = React.useState(true);
    const [showLogs, setShowLogs] = React.useState(false);
    const [showVideo, setShowVideo] = React.useState(false);

    React.useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${WORKER_URL}/demos/${id}`);
                if (!res.ok) throw new Error('Not found');
                const data = await res.json();
                if (!cancelled) setDemo(data);
            } catch (e) {
                console.error('Could not load demo:', e);
                // Fall back to name stored in workout JSON
                if (!cancelled) setDemo({ id, name, hasVideo: false, streamId: null });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    const setCount = sets ? parseInt(sets) : 1;
    const setRows  = Array.from({ length: setCount }, (_, i) => i + 1);
    const displayName = demo?.name ?? name ?? 'Unknown exercise';
    const hasVideo    = !!demo?.streamId;

    if (loading) {
        return (
            <View style={styles.itemContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    return (
        <>
            {/* ── Exercise row ── */}
            <View style={styles.itemContainer}>
                <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseText}>{displayName}</Text>
                    {countType === 'AMRAP'
                        ? <Text style={styles.bodyText}>AMRAP</Text>
                        : <Text style={styles.bodyText}>{countType}: {countMin ?? '—'}</Text>
                    }
                </View>

                {/* Video button — only shown when video exists */}
                {hasVideo && (
                    <Pressable
                        style={[styles.iconButton, showVideo && styles.iconButtonActive]}
                        onPress={() => setShowVideo(v => !v)}
                    >
                        <Feather name="film" size={16} color={showVideo ? '#fba8a0' : '#fae9e9'} />
                    </Pressable>
                )}

                {/* No video indicator — subtle, not intrusive */}
                {!hasVideo && (
                    <View style={styles.noVideoTag}>
                        <Feather name="video-off" size={12} color="#444" />
                    </View>
                )}

                {/* Log sets button */}
                <Pressable
                    style={[styles.iconButton, showLogs && styles.iconButtonActive]}
                    onPress={() => setShowLogs(v => !v)}
                >
                    <Feather name="clipboard" size={16} color={showLogs ? '#fba8a0' : '#fae9e9'} />
                </Pressable>
            </View>

            {/* ── Video player ── */}
            {showVideo && hasVideo && <VideoPlayer streamId={demo.streamId} />}

            {/* ── No video message — only shown if user tries to expand (shouldn't happen with hidden button) ── */}
            {showVideo && !hasVideo && (
                <View style={styles.noVideoMessage}>
                    <Feather name="video-off" size={16} color="#444" />
                    <Text style={styles.noVideoMessageText}>No video available yet</Text>
                </View>
            )}

            {/* ── Set logging ── */}
            {showLogs && (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.logsContainer}
                >
                    <Text style={styles.setsHeader}>
                        {setCount} set{setCount !== 1 ? 's' : ''} · {formatPrescription({ countType, countMin, countMax, timeCapSeconds })}
                    </Text>
                    {setRows.map(setNum => (
                        <SetRow
                            key={`${id}-set-${setNum}`}
                            setNumber={setNum}
                            exerciseId={id}
                            workoutId={workoutId}
                            clientId={clientId}
                            unitDefault={unitDefault}
                            countType={countType}
                            countMin={countMin != null ? parseFloat(countMin) : null}
                            countMax={countMax != null ? parseFloat(countMax) : null}
                            timeCapSeconds={timeCapSeconds != null ? parseFloat(timeCapSeconds) : null}
                            onSave={onSetSaved}
                        />
                    ))}
                </KeyboardAvoidingView>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    exerciseInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    exerciseText: {
        padding: 20,
        paddingRight: 8,
        fontSize: 16,
        color: '#fae9e9',
        flexWrap: 'wrap',
        flex: 1,
    },
    bodyText: {
        paddingRight: 12,
        fontSize: 14,
        color: '#888',
        flexShrink: 0,
    },
    loadingText: {
        padding: 20,
        fontSize: 14,
        color: '#555',
    },
    iconButton: {
        padding: 10,
        height: 40,
        justifyContent: 'center',
        alignSelf: 'center',
        borderColor: '#333',
        borderWidth: 1,
        borderRadius: 8,
        marginHorizontal: 2,
    },
    iconButtonActive: {
        borderColor: '#fba8a0',
        backgroundColor: 'rgba(251,168,160,0.1)',
    },
    noVideoTag: {
        padding: 10,
        marginHorizontal: 2,
        alignSelf: 'center',
        justifyContent: 'center',
    },
    noVideoMessage: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#0d0d0d',
    },
    noVideoMessageText: {
        fontSize: 13,
        color: '#444',
        fontStyle: 'italic',
    },
    videoContainer: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: 'black',
    },
    video: {
        alignSelf: 'center',
        width: 320,
        height: 200,
    },
    logsContainer: {
        backgroundColor: '#0d0d0d',
        marginHorizontal: 8,
        marginBottom: 8,
        borderRadius: 8,
        padding: 10,
        borderWidth: 0.5,
        borderColor: '#222',
    },
    setsHeader: {
        fontSize: 12,
        color: '#888',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        paddingBottom: 8,
    },
});