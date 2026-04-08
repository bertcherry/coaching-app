import * as React from 'react';
import {
    View, Text, SectionList, TextInput, KeyboardAvoidingView,
    StyleSheet, Platform, Pressable, Modal, Animated,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../context/AuthContext';
import { enqueueRecord, syncQueue } from '../utils/WorkoutSync';
import SetRow from '../components/SetRow';

// ─── Rotating finish messages ─────────────────────────────────────────────────

const FINISH_MESSAGES = [
    { emoji: '💪', text: 'Nice job, friend!' },
    { emoji: '🎉', text: "Yay, you did it!" },
    { emoji: '✨', text: 'Way to show up for yourself today.' },
    { emoji: '🔥', text: "You're on fire. Keep that momentum." },
    { emoji: '🏆', text: 'Another one in the books.' },
    { emoji: '⚡', text: 'Hard work, done. Proud of you.' },
];

// ─── Workout Finished confirmation overlay ────────────────────────────────────

const FinishOverlay = ({ visible, onDismiss, onConfirm }) => {
    const message = React.useMemo(
        () => FINISH_MESSAGES[Math.floor(Math.random() * FINISH_MESSAGES.length)],
        [visible],
    );

    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
            <View style={styles.overlayBackdrop}>
                <View style={styles.overlayCard}>
                    <Text style={styles.overlayEmoji}>{message.emoji}</Text>
                    <Text style={styles.overlayMessage}>{message.text}</Text>
                    <Text style={styles.overlaySubtext}>
                        Mark this workout as finished?
                    </Text>
                    <View style={styles.overlayActions}>
                        <Pressable style={styles.overlayButtonSecondary} onPress={onDismiss}>
                            <Text style={styles.overlayButtonSecondaryText}>I'm not done</Text>
                        </Pressable>
                        <Pressable style={styles.overlayButtonPrimary} onPress={onConfirm}>
                            <Text style={styles.overlayButtonPrimaryText}>Thanks! 🎊</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Exercise item ────────────────────────────────────────────────────────────
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

const Item = ({ workoutId, clientId, unitDefault, onSetSaved, ...item }) => {
    const [video, setVideo] = React.useState({});
    const [showLogs, setShowLogs] = React.useState(false);
    const [showVideo, setShowVideo] = React.useState(false);

    React.useEffect(() => {
        const getVideo = async () => {
            try {
                const resp = await fetch(new URL(`https://videos.bert-m-cherry.workers.dev/${item.id}`));
                const videoResp = await resp.json();
                setVideo(videoResp);
            } catch (error) {
                console.error(error);
            }
        };
        getVideo();
    }, [item.id]);

    // Build set rows based on the sets value from the workout
    const setCount = item.sets ? parseInt(item.sets) : 1;
    const setRows = Array.from({ length: setCount }, (_, i) => i + 1);

    if (!Object.keys(video).length) return (
        <View style={styles.itemContainer}>
            <Text style={styles.bodyText}>Loading...</Text>
            <Text style={styles.bodyText}>Reps or Time: {item.count}</Text>
        </View>
    );

    const VideoPlayer = () => {
        const videoRef = React.useRef(null);
        return (
            <View style={styles.videoContainer}>
                <Video
                    ref={videoRef}
                    style={styles.video}
                    source={{ uri: `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${item.id}/manifest/video.mpd` }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                    isMuted
                    shouldPlay
                />
            </View>
        );
    };

    return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.exerciseText}>{video.name}</Text>
                {item.countType === 'AMRAP'
                    ? <Text style={styles.bodyText}>AMRAP</Text>
                    : <Text style={styles.bodyText}>{item.countType}: {item.count}</Text>
                }
                <Pressable style={styles.iconButton} onPress={() => setShowVideo(!showVideo)}>
                    <Feather name="film" size={16} color={showVideo ? '#fba8a0' : '#fae9e9'} />
                </Pressable>
                <Pressable style={styles.iconButton} onPress={() => setShowLogs(!showLogs)}>
                    <Feather name="clipboard" size={16} color={showLogs ? '#fba8a0' : '#fae9e9'} />
                </Pressable>
            </View>

            {showVideo && <VideoPlayer />}

            {showLogs && (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.logsContainer}
                >
                    <Text style={styles.setsHeader}>
                        {setCount} set{setCount !== 1 ? 's' : ''} · {formatPrescription(item)}
                    </Text>
                    {setRows.map(setNum => (
                        <SetRow
                            key={`${item.id}-set-${setNum}`}
                            setNumber={setNum}
                            exerciseId={item.id}
                            workoutId={workoutId}
                            clientId={clientId}
                            unitDefault={unitDefault}
                            countType={item.countType}
                            countMin={item.countMin != null ? parseFloat(item.countMin) : null}
                            countMax={item.countMax != null ? parseFloat(item.countMax) : null}
                            timeCapSeconds={item.timeCapSeconds != null ? parseFloat(item.timeCapSeconds) : null}
                            onSave={onSetSaved}
                        />
                    ))}
                </KeyboardAvoidingView>
            )}
        </>
    );
};

// ─── WorkoutPreview ───────────────────────────────────────────────────────────

export default function WorkoutPreview({ route, navigation }) {
    const { id, scheduledWorkoutId } = route.params;
    const { user, accessToken, authFetch } = useAuth();

    const [workoutData, setWorkoutData] = React.useState(undefined);
    const [showFinishOverlay, setShowFinishOverlay] = React.useState(false);
    const [workoutStatus, setWorkoutStatus] = React.useState('scheduled'); // 'scheduled' | 'completed'

    React.useEffect(() => {
        const getWorkout = async () => {
            try {
                const resp = await fetch(new URL(`https://coaching-app.bert-m-cherry.workers.dev/${id}`));
                const workoutResp = await resp.json();
                let respData = [...workoutResp];
                respData.forEach((section, index) => {
                    section.title = `Section ${index + 1}`;
                });
                setWorkoutData(respData);
            } catch (error) {
                console.error(error);
            }
        };
        getWorkout();
    }, [id]);

    // Sync any pending records when this screen mounts
    React.useEffect(() => {
        if (accessToken) syncQueue(accessToken);
    }, [accessToken]);

    const handleSetSaved = () => {
        // Attempt background sync after each save — no-ops if already syncing
        if (accessToken) syncQueue(accessToken);
    };

    const handleFinishConfirm = async () => {
        setShowFinishOverlay(false);
        setWorkoutStatus('completed');

        // Mark scheduled workout complete on server
        if (scheduledWorkoutId) {
            try {
                await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: scheduledWorkoutId,
                        completedAt: new Date().toISOString(),
                    }),
                });
            } catch (e) {
                console.error('Could not mark workout complete:', e);
                // Non-blocking — local status already updated
            }
        }

        // Final sync push
        if (accessToken) syncQueue(accessToken);
    };

    if (workoutData === undefined) {
        return (
            <View style={styles.container}>
                <Text style={styles.headingText}>Loading...</Text>
            </View>
        );
    }

    const renderItem = ({ item }) => (
        <Item
            {...item}
            workoutId={id}
            clientId={user?.email}
            unitDefault={user?.unitDefault}
            onSetSaved={handleSetSaved}
        />
    );

    const renderSectionHeader = ({ section: { title } }) => (
        <View>
            <Text style={styles.headingText}>{title}</Text>
        </View>
    );

    const renderFooter = () => (
        <View style={styles.footerContainer}>
            {workoutStatus === 'completed' ? (
                <View style={styles.completedBadge}>
                    <Feather name="check-circle" size={18} color="#7bb533" />
                    <Text style={styles.completedText}>Workout completed</Text>
                </View>
            ) : (
                <Pressable
                    style={styles.finishButton}
                    onPress={() => setShowFinishOverlay(true)}
                >
                    <Feather name="check-circle" size={20} color="#000" />
                    <Text style={styles.finishButtonText}>Workout Finished</Text>
                </Pressable>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <SectionList
                sections={workoutData}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                ListFooterComponent={renderFooter}
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 40 }}
            />

            <FinishOverlay
                visible={showFinishOverlay}
                onDismiss={() => setShowFinishOverlay(false)}
                onConfirm={handleFinishConfirm}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    headingText: {
        padding: 40,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fae9e9',
        textAlign: 'center',
    },
    itemContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    bodyText: {
        padding: 20,
        fontSize: 16,
        color: '#fae9e9',
        flexWrap: 'wrap',
    },
    exerciseText: {
        padding: 20,
        fontSize: 16,
        color: '#fae9e9',
        flexWrap: 'wrap',
        flex: 1,
    },
    iconButton: {
        padding: 10,
        height: 40,
        justifyContent: 'center',
        alignSelf: 'center',
        borderColor: '#fae9e9',
        borderWidth: 1,
        borderRadius: 8,
        marginHorizontal: 2,
    },

    // ── Set logging ──
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
    setRow: {
        borderTopWidth: 0.5,
        borderTopColor: '#222',
        paddingTop: 8,
        paddingBottom: 4,
        marginBottom: 4,
    },
    setLabel: {
        fontSize: 12,
        color: '#fba8a0',
        fontWeight: '700',
        marginBottom: 6,
    },
    setInputs: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 6,
    },
    setInputGroup: {
        flex: 1,
        alignItems: 'center',
    },
    setInputLabel: {
        fontSize: 10,
        color: '#666',
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    setInput: {
        width: '100%',
        height: 36,
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 6,
        backgroundColor: '#1a1a1a',
        color: '#fae9e9',
        textAlign: 'center',
        fontSize: 15,
    },
    setInputSaved: {
        borderColor: '#7bb533',
    },
    setNoteInput: {
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 6,
        backgroundColor: '#1a1a1a',
        color: '#fae9e9',
        padding: 8,
        fontSize: 13,
        minHeight: 34,
    },
    savedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 4,
    },
    savedBadgeText: {
        fontSize: 10,
        color: '#7bb533',
    },

    // ── Footer ──
    footerContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    finishButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#7bb533',
        borderRadius: 12,
        paddingVertical: 16,
    },
    finishButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#000',
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: '#7bb533',
        borderRadius: 12,
    },
    completedText: {
        fontSize: 16,
        color: '#7bb533',
        fontWeight: '600',
    },

    // ── Finish overlay ──
    overlayBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    overlayCard: {
        backgroundColor: '#111',
        borderRadius: 16,
        padding: 28,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#7bb533',
    },
    overlayEmoji: {
        fontSize: 52,
        marginBottom: 12,
    },
    overlayMessage: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fae9e9',
        textAlign: 'center',
        marginBottom: 8,
    },
    overlaySubtext: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        marginBottom: 28,
    },
    overlayActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    overlayButtonPrimary: {
        flex: 1,
        backgroundColor: '#7bb533',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
    },
    overlayButtonPrimaryText: {
        color: '#000',
        fontWeight: '700',
        fontSize: 15,
    },
    overlayButtonSecondary: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
    },
    overlayButtonSecondaryText: {
        color: '#888',
        fontSize: 15,
    },

    // ── Video ──
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
});