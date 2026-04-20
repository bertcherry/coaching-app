import * as React from 'react';
import {
    View, Text, SectionList, TextInput, KeyboardAvoidingView,
    StyleSheet, Platform, Pressable, Modal, Animated, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';
import { enqueueRecord, syncQueue } from '../utils/WorkoutSync';
import SetRow from '../components/SetRow';
import WorkoutPreviewItem from '../components/WorkoutPreviewItem';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseISODate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getMonthGrid(year, month) {
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(year, month, 1 - firstDay.getDay());
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        return { dateStr: toISO(d), currentMonth: d.getMonth() === month };
    });
}

function formatScheduledDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.length === 7) {
        // Month-only: YYYY-MM
        const [year, month] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ─── Rotating finish messages ─────────────────────────────────────────────────

const FINISH_MESSAGES = [
    { icon: 'thumbs-up', text: 'Nice job, friend!' },
    { icon: 'star',      text: "Yay, you did it!" },
    { icon: 'sun',       text: 'Way to show up for yourself today.' },
    { icon: 'zap',       text: "You're on fire. Keep that momentum." },
    { icon: 'award',     text: 'Another one in the books.' },
    { icon: 'heart',     text: 'Hard work, done. Proud of you.' },
];

// ─── Reschedule to today overlay ──────────────────────────────────────────────

const RescheduleOverlay = ({ visible, scheduledDate, onDismiss, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const isMonthOnly = scheduledDate?.length === 7;
    const dateLabel = formatScheduledDate(scheduledDate);

    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
            <View style={styles.overlayBackdrop}>
                <View style={[styles.overlayCard, styles.rescheduleCard]}>
                    <Text style={styles.overlayMessage}>Move to today?</Text>
                    <Text style={styles.overlaySubtext}>
                        {isMonthOnly
                            ? `This workout is unscheduled for ${dateLabel}. Move it to today?`
                            : `This workout is scheduled for ${dateLabel}.`}
                    </Text>
                    <View style={styles.overlayActions}>
                        <Pressable style={styles.overlayButtonSecondary} onPress={onDismiss}>
                            <Text style={styles.overlayButtonSecondaryText}>Keep date</Text>
                        </Pressable>
                        <Pressable style={[styles.overlayButtonPrimary, styles.rescheduleButtonPrimary]} onPress={onConfirm}>
                            <Text style={styles.overlayButtonPrimaryText}>Reschedule</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Workout Finished confirmation overlay ────────────────────────────────────

const FinishOverlay = ({ visible, onDismiss, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const message = React.useMemo(
        () => FINISH_MESSAGES[Math.floor(Math.random() * FINISH_MESSAGES.length)],
        [visible],
    );

    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
            <View style={styles.overlayBackdrop}>
                <View style={styles.overlayCard}>
                    <Feather name={message.icon} size={52} color={theme.textPrimary} style={styles.overlayIcon} />
                    <Text style={styles.overlayMessage}>{message.text}</Text>
                    <Text style={styles.overlaySubtext}>
                        Mark this workout as finished?
                    </Text>
                    <View style={styles.overlayActions}>
                        <Pressable style={styles.overlayButtonSecondary} onPress={onDismiss}>
                            <Text style={styles.overlayButtonSecondaryText}>I'm not done</Text>
                        </Pressable>
                        <Pressable style={styles.overlayButtonPrimary} onPress={onConfirm}>
                            <Text style={styles.overlayButtonPrimaryText}>Thanks!</Text>
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
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [video, setVideo] = React.useState({});
    const [showLogs, setShowLogs] = React.useState(false);
    const [showVideo, setShowVideo] = React.useState(false);
    const player = useVideoPlayer(
        { uri: `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${item.id}/manifest/video.m3u8` },
        p => { p.loop = true; p.muted = true; p.play(); }
    );

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

    // Build set rows: prefer setsMax → setsMin → legacy sets field
    const setCount = item.setsMax ? parseInt(item.setsMax) : item.setsMin ? parseInt(item.setsMin) : item.sets ? parseInt(item.sets) : 1;
    const setRows = Array.from({ length: setCount }, (_, i) => i + 1);

    if (!Object.keys(video).length) return (
        <View style={styles.itemContainer}>
            <Text style={styles.bodyText}>Loading...</Text>
            <Text style={styles.bodyText}>Reps or Time: {item.count}</Text>
        </View>
    );

    return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.exerciseText}>{video.name}</Text>
                {item.countType === 'AMRAP'
                    ? <Text style={styles.bodyText}>AMRAP</Text>
                    : <Text style={styles.bodyText}>{item.countType}: {item.count}</Text>
                }
                <Pressable style={styles.iconButton} onPress={() => setShowVideo(!showVideo)}>
                    <Feather name="film" size={16} color={showVideo ? theme.accent : theme.textPrimary} />
                </Pressable>
                <Pressable style={styles.iconButton} onPress={() => setShowLogs(!showLogs)}>
                    <Feather name="clipboard" size={16} color={showLogs ? theme.accent : theme.textPrimary} />
                </Pressable>
            </View>

            {showVideo && (
                <View style={styles.videoContainer}>
                    <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
                </View>
            )}

            {showLogs && (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.logsContainer}
                >
                    {setRows.map(setNum => (
                        <SetRow
                            key={`${item.id}-set-${setNum}`}
                            setNumber={setNum}
                            isOptional={item.setsMin != null && setNum > parseInt(item.setsMin)}
                            exerciseId={item.id}
                            workoutId={workoutId}
                            clientId={clientId}
                            unitDefault={unitDefault}
                            countType={item.countType}
                            countMin={item.countMin != null ? parseFloat(item.countMin) : null}
                            countMax={item.countMax != null ? parseFloat(item.countMax) : null}
                            timeCapSeconds={item.timeCapSeconds != null ? parseFloat(item.timeCapSeconds) : null}
                            recommendedWeight={item.recommendedWeight ?? null}
                            recommendedRpe={item.recommendedRpe != null ? parseFloat(item.recommendedRpe) : null}
                            setConfig={Array.isArray(item.setConfigs) ? (item.setConfigs[setNum - 1] ?? null) : null}
                            onSave={onSetSaved}
                        />
                    ))}
                </KeyboardAvoidingView>
            )}
        </>
    );
};

// ─── Date picker modal ────────────────────────────────────────────────────────

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DatePickerModal = ({ minDate, sourceDate, onClose, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const now = new Date();
    const [pickerYear,  setPickerYear]  = React.useState(now.getFullYear());
    const [pickerMonth, setPickerMonth] = React.useState(now.getMonth());
    const [selected,    setSelected]    = React.useState(null);

    const rows = React.useMemo(() => {
        const grid = getMonthGrid(pickerYear, pickerMonth);
        const r = [];
        for (let i = 0; i < grid.length; i += 7) r.push(grid.slice(i, i + 7));
        return r;
    }, [pickerYear, pickerMonth]);

    const prevMonth = () => {
        if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
        else setPickerMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
        else setPickerMonth(m => m + 1);
    };

    return (
        <Modal
            transparent
            animationType="fade"
            onRequestClose={onClose}
            accessibilityViewIsModal={true}
        >
            <View style={styles.overlayBackdrop}>
                <View style={styles.datePickerCard}>
                    <Text style={styles.datePickerTitle} accessibilityRole="header">
                        Reschedule to…
                    </Text>

                    <View style={styles.datePickerNavRow}>
                        <Pressable onPress={prevMonth} style={styles.datePickerNavBtn} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="chevron-left" size={20} color={theme.textPrimary} accessible={false} />
                        </Pressable>
                        <Text style={styles.datePickerMonthLabel}>{monthLabel(pickerYear, pickerMonth)}</Text>
                        <Pressable onPress={nextMonth} style={styles.datePickerNavBtn} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="chevron-right" size={20} color={theme.textPrimary} accessible={false} />
                        </Pressable>
                    </View>

                    <View style={styles.datePickerDowRow}>
                        {DOW_LABELS.map(l => (
                            <Text key={l} style={styles.datePickerDowLabel} accessible={false}>{l}</Text>
                        ))}
                    </View>

                    {rows.map((row, ri) => (
                        <View key={ri} style={styles.datePickerRow}>
                            {row.map(({ dateStr, currentMonth }) => {
                                const isPast     = minDate ? dateStr < minDate : false;
                                const isBlocked  = isPast || !currentMonth;
                                const isSelected = dateStr === selected;
                                const isToday    = dateStr === getTodayStr();
                                const isSource   = sourceDate ? dateStr === sourceDate : false;
                                const dayNum     = parseInt(dateStr.split('-')[2], 10);
                                return (
                                    <View key={dateStr} style={styles.datePickerCellWrap}>
                                        <Pressable
                                            style={[
                                                styles.datePickerCell,
                                                isToday   && !isSelected && styles.datePickerCellTodayRing,
                                                isSource  && !isSelected && styles.datePickerCellSourceRing,
                                                isSelected && styles.datePickerCellSelected,
                                            ]}
                                            onPress={() => !isBlocked && setSelected(dateStr)}
                                            disabled={isBlocked}
                                            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                                            accessibilityRole="button"
                                            accessibilityLabel={isToday ? `${dayNum}, today` : isSource ? `${dayNum}, original date` : String(dayNum)}
                                            accessibilityState={{ selected: isSelected, disabled: isBlocked }}
                                        >
                                            <Text style={[
                                                styles.datePickerCellText,
                                                isToday    && styles.datePickerCellTodayText,
                                                isSelected && styles.datePickerCellSelectedText,
                                                isPast     && styles.datePickerCellPastText,
                                                !currentMonth && styles.datePickerCellOtherMonth,
                                            ]}>
                                                {dayNum}
                                            </Text>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                    ))}

                    <View style={styles.overlayActions}>
                        <Pressable style={styles.overlayButtonSecondary} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                            <Text style={styles.overlayButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.overlayButtonPrimary, styles.rescheduleButtonPrimary, !selected && styles.datePickerConfirmDisabled]}
                            onPress={() => selected && onConfirm(selected)}
                            disabled={!selected}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm date"
                            accessibilityState={{ disabled: !selected }}
                        >
                            <Text style={styles.overlayButtonPrimaryText}>Confirm</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Skip modal ───────────────────────────────────────────────────────────────

const SkipModal = ({ onClose, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [reason, setReason] = React.useState('');
    return (
        <Modal
            transparent
            animationType="fade"
            onRequestClose={onClose}
            accessibilityViewIsModal={true}
        >
            <KeyboardAvoidingView
                style={styles.overlayBackdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.skipModalCard}>
                    <Text style={styles.skipModalTitle} accessibilityRole="header">
                        Mark as skipped?
                    </Text>
                    <TextInput
                        style={styles.skipModalInput}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Why was it skipped? (optional)"
                        placeholderTextColor={theme.textTertiary}
                        multiline
                        returnKeyType="done"
                        accessibilityLabel="Skip reason"
                        accessibilityHint="Optional. Describe why this workout was skipped."
                    />
                    <View style={styles.overlayActions}>
                        <Pressable
                            style={styles.overlayButtonSecondary}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                        >
                            <Text style={styles.overlayButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={styles.overlayButtonPrimary}
                            onPress={() => onConfirm(reason)}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm mark as skipped"
                        >
                            <Text style={styles.overlayButtonPrimaryText}>Mark Skipped</Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Delete confirmation overlay ─────────────────────────────────────────────

const DeleteConfirmModal = ({ workoutName: name, onClose, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <Modal
            transparent
            animationType="fade"
            onRequestClose={onClose}
            accessibilityViewIsModal={true}
        >
            <View style={styles.overlayBackdrop}>
                <View style={[styles.overlayCard, styles.deleteCard]}>
                    <Feather name="trash-2" size={28} color={theme.danger} accessible={false} style={styles.overlayIcon} />
                    <Text style={styles.overlayMessage}>Delete workout?</Text>
                    <Text style={styles.overlaySubtext}>
                        {name} will be permanently removed from your schedule.
                    </Text>
                    <View style={styles.overlayActions}>
                        <Pressable
                            style={styles.overlayButtonSecondary}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel delete"
                        >
                            <Text style={styles.overlayButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={styles.deleteConfirmButton}
                            onPress={onConfirm}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm delete workout"
                        >
                            <Text style={styles.deleteConfirmButtonText}>Delete</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── WorkoutPreview ───────────────────────────────────────────────────────────

export default function WorkoutPreview({ route, navigation }) {
    const { id, scheduledWorkoutId, scheduledDate, initialStatus, viewerIsAthlete, clientEmail: clientEmailParam, localHistory, calendarRefresh, workoutName } = route.params;
    const { user, accessToken, authFetch } = useAuth();
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const scrollY = useScrollY();
    const headerHeight = useHeaderHeight();

    // The email of the athlete whose history we display/fetch
    const clientEmail = clientEmailParam ?? user?.email;

    useFocusEffect(React.useCallback(() => {
        scrollY.setValue(0);
    }, [scrollY]));

    const [workoutData, setWorkoutData] = React.useState(undefined);
    const [showFinishOverlay, setShowFinishOverlay] = React.useState(false);
    const [showRescheduleOverlay, setShowRescheduleOverlay] = React.useState(false);
    const [showSkipModal,       setShowSkipModal]       = React.useState(false);
    const [showRescheduleModal, setShowRescheduleModal] = React.useState(false);
    const [showDeleteModal,     setShowDeleteModal]     = React.useState(false);
    const [workoutStatus, setWorkoutStatus] = React.useState(initialStatus ?? 'scheduled');
    // Edit mode: clients and coaches can review/edit logged data on completed workouts
    const [editMode, setEditMode] = React.useState(false);
    // Logged sets for completed workout: keyed by `${exerciseId}-${setNumber}`
    // Seeded immediately from localHistory (AsyncStorage) so summary shows before sync
    const [completedHistory, setCompletedHistory] = React.useState(localHistory ?? null);
    // Track if any set has been saved so we can warn before leaving
    const hasSavedSets = React.useRef(false);
    const pendingAction = React.useRef(null);
    const hasPromptedReschedule = React.useRef(false);

    // Back-navigation guard: warn if client has saved sets without finishing
    React.useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            // Allow if: workout completed, no sets saved, or navigating to settings
            const targetRoute = e.data?.action?.payload?.name;
            if (workoutStatus === 'completed' || !hasSavedSets.current || targetRoute === 'Settings') return;
            e.preventDefault();
            Alert.alert(
                'Leave workout?',
                'You have logged sets but haven\'t marked this workout as finished. Leave anyway?',
                [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
                ],
            );
        });
        return unsubscribe;
    }, [navigation, workoutStatus]);

    // Set nav header title
    React.useEffect(() => {
        navigation.setOptions({ title: 'Workout Summary' });
    }, []);

    // Signal CalendarScreen to mark this workout completed without a full refetch
    React.useEffect(() => {
        if (!calendarRefresh || !scheduledWorkoutId) return;
        navigation.navigate('Calendar', { completedWorkoutId: scheduledWorkoutId });
    }, []);

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

    // Fetch logged history when viewing a completed workout
    React.useEffect(() => {
        if (workoutStatus !== 'completed' || !accessToken || !clientEmail) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(
                    `https://coaching-app.bert-m-cherry.workers.dev/history/workout?workoutId=${encodeURIComponent(id)}&clientEmail=${encodeURIComponent(clientEmail)}`
                );
                if (!res.ok || cancelled) return;
                const { records } = await res.json();
                if (cancelled) return;
                // Merge: start from localHistory so unsynced sets are present,
                // then overwrite with server records (source of truth once synced)
                const map = { ...(localHistory ?? {}) };
                for (const r of records) {
                    map[`${r.exerciseId}-${r.set}`] = r;
                }
                setCompletedHistory(map);
            } catch {
                // Non-fatal — summary panel will just show empty
            }
        })();
        return () => { cancelled = true; };
    }, [workoutStatus, accessToken, clientEmail, id]);

    const maybePromptReschedule = (action) => {
        const isToday = !scheduledDate || scheduledDate === getTodayStr();
        if (isToday || hasPromptedReschedule.current) {
            action();
            return;
        }
        hasPromptedReschedule.current = true;
        pendingAction.current = action;
        setShowRescheduleOverlay(true);
    };

    const handleRescheduleConfirm = async () => {
        setShowRescheduleOverlay(false);
        if (scheduledWorkoutId) {
            try {
                await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: scheduledWorkoutId, newDate: getTodayStr(), today: getTodayStr() }),
                });
            } catch (e) {
                console.error('Could not reschedule workout:', e);
            }
        }
        pendingAction.current?.();
        pendingAction.current = null;
    };

    const handleRescheduleDismiss = () => {
        setShowRescheduleOverlay(false);
        pendingAction.current?.();
        pendingAction.current = null;
    };

    const handleSetSaved = () => {
        hasSavedSets.current = true;
        maybePromptReschedule(() => {
            // Attempt background sync after each save — no-ops if already syncing
            if (accessToken) syncQueue(accessToken);
        });
    };

    const handleRescheduleConfirmPicker = async (newDate) => {
        setShowRescheduleModal(false);
        if (scheduledWorkoutId) {
            try {
                await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: scheduledWorkoutId, newDate, today: getTodayStr() }),
                });
                if (workoutStatus === 'skipped' || workoutStatus === 'missed') {
                    setWorkoutStatus('scheduled');
                }
            } catch (e) {
                console.error('Could not reschedule workout:', e);
            }
        }
    };

    const handleSkipConfirm = async (reason) => {
        setShowSkipModal(false);
        setWorkoutStatus('skipped');
        if (scheduledWorkoutId) {
            try {
                await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/skip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: scheduledWorkoutId, reason }),
                });
            } catch (e) {
                console.error('Could not skip workout:', e);
                setWorkoutStatus(initialStatus);
            }
        }
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

    const handleDeleteConfirm = async () => {
        setShowDeleteModal(false);
        try {
            const res = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: scheduledWorkoutId }),
            });
            if (!res.ok) throw new Error(`Delete failed (${res.status})`);
            navigation.goBack();
        } catch (e) {
            console.error('[WorkoutPreview] handleDeleteConfirm error:', e);
            Alert.alert('Error', 'Could not delete workout. Please try again.');
        }
    };

    if (workoutData === undefined) {
        return (
            <View style={styles.container}>
                <Text style={styles.headingText}>Loading...</Text>
            </View>
        );
    }

    // Anyone can edit logged sets on a completed workout while in editMode
    const loggingEnabled = workoutStatus !== 'completed' || editMode;

    const renderItem = ({ item }) => (
        <WorkoutPreviewItem
            {...item}
            workoutId={id}
            clientId={clientEmail}
            unitDefault={user?.unitDefault}
            onSetSaved={handleSetSaved}
            readOnly={!loggingEnabled}
            isCompleted={workoutStatus === 'completed'}
            completedHistory={completedHistory}
        />
    );

    const renderSectionHeader = ({ section: { title } }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
    );

    const renderListHeader = () => workoutName ? (
        <View style={styles.workoutTitleContainer}>
            <Text style={styles.workoutTitleText}>{workoutName}</Text>
        </View>
    ) : null;

    const handleStartWorkout = () => {
        maybePromptReschedule(() => {
            navigation.navigate('Workout Active', {
                workoutData,
                workoutId: id,
                scheduledWorkoutId,
                scheduledDate,
                clientEmail,
                viewerIsAthlete,
            });
        });
    };

    const renderFooter = () => (
        <View style={styles.footerContainer}>
            {workoutStatus === 'completed' ? (
                <>
                    <View style={styles.completedBadge}>
                        <Feather name="check-circle" size={18} color={theme.success} />
                        <Text style={styles.completedText}>Workout completed</Text>
                    </View>
                    <Pressable
                        style={[styles.editButton, editMode && styles.editButtonActive]}
                        onPress={() => setEditMode(v => !v)}
                    >
                        <Feather name={editMode ? 'x' : 'edit-2'} size={16} color={editMode ? theme.textSecondary : theme.accentText} />
                        <Text style={[styles.editButtonText, editMode && styles.editButtonTextActive]}>
                            {editMode ? 'Done editing' : 'Edit workout'}
                        </Text>
                    </Pressable>
                </>
            ) : workoutStatus === 'skipped' ? (
                <>
                    <View style={styles.skippedBadge}>
                        <Feather name="slash" size={18} color={theme.textSecondary} accessible={false} />
                        <Text style={styles.skippedText}>Workout skipped</Text>
                    </View>
                    {viewerIsAthlete && scheduledWorkoutId && (
                        <Pressable
                            style={styles.rescheduleButton}
                            onPress={() => setShowRescheduleModal(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Reschedule workout"
                        >
                            <Feather name="calendar" size={16} color={theme.accentText} accessible={false} />
                            <Text style={styles.rescheduleButtonText}>Reschedule Workout</Text>
                        </Pressable>
                    )}
                </>
            ) : (
                <>
                    <Pressable style={styles.startButton} onPress={handleStartWorkout}>
                        <Feather name="play" size={20} color="#000" />
                        <Text style={styles.startButtonText}>Start Workout</Text>
                    </Pressable>
                    <Pressable
                        style={styles.finishButton}
                        onPress={() => setShowFinishOverlay(true)}
                    >
                        <Feather name="check-circle" size={20} color="#000" />
                        <Text style={styles.finishButtonText}>Workout Finished</Text>
                    </Pressable>
                    {viewerIsAthlete && scheduledWorkoutId && (
                        <>
                            <Pressable
                                style={styles.skipButton}
                                onPress={() => setShowSkipModal(true)}
                                accessibilityRole="button"
                                accessibilityLabel="Mark as skipped"
                            >
                                <Feather name="slash" size={16} color={theme.textSecondary} accessible={false} />
                                <Text style={styles.skipButtonText}>Mark as Skipped</Text>
                            </Pressable>
                            <Pressable
                                style={styles.rescheduleButton}
                                onPress={() => setShowRescheduleModal(true)}
                                accessibilityRole="button"
                                accessibilityLabel="Reschedule workout"
                            >
                                <Feather name="calendar" size={16} color={theme.accentText} accessible={false} />
                                <Text style={styles.rescheduleButtonText}>Reschedule Workout</Text>
                            </Pressable>
                        </>
                    )}
                    {scheduledWorkoutId && (
                        <Pressable
                            style={styles.deleteButton}
                            onPress={() => setShowDeleteModal(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete workout"
                            accessibilityHint="Permanently remove this workout from your schedule"
                        >
                            <Feather name="trash-2" size={16} color={theme.danger} accessible={false} />
                            <Text style={styles.deleteButtonText}>Delete Workout</Text>
                        </Pressable>
                    )}
                </>
            )}
        </View>
    );

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
            <SectionList
                sections={workoutData}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                ListHeaderComponent={renderListHeader}
                ListFooterComponent={renderFooter}
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                contentContainerStyle={{ paddingBottom: 40 }}
                indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
                onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
            />

            <FinishOverlay
                visible={showFinishOverlay}
                onDismiss={() => setShowFinishOverlay(false)}
                onConfirm={handleFinishConfirm}
            />

            {showSkipModal && (
                <SkipModal
                    onClose={() => setShowSkipModal(false)}
                    onConfirm={handleSkipConfirm}
                />
            )}

            {showRescheduleModal && (
                <DatePickerModal
                    minDate={getTodayStr()}
                    sourceDate={scheduledDate?.length === 10 ? scheduledDate : undefined}
                    onClose={() => setShowRescheduleModal(false)}
                    onConfirm={handleRescheduleConfirmPicker}
                />
            )}

            <RescheduleOverlay
                visible={showRescheduleOverlay}
                scheduledDate={scheduledDate}
                onDismiss={handleRescheduleDismiss}
                onConfirm={handleRescheduleConfirm}
            />

            {showDeleteModal && (
                <DeleteConfirmModal
                    workoutName={workoutName}
                    onClose={() => setShowDeleteModal(false)}
                    onConfirm={handleDeleteConfirm}
                />
            )}
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        headingText: {
            padding: 40,
            fontSize: 20,
            fontWeight: 'bold',
            color: theme.textPrimary,
            textAlign: 'center',
        },
        workoutTitleContainer: {
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 4,
        },
        workoutTitleText: {
            fontSize: 22,
            fontWeight: '700',
            color: theme.textPrimary,
        },
        sectionHeader: {
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 4,
            backgroundColor: theme.background,
        },
        sectionHeaderText: {
            fontSize: 12,
            fontWeight: '700',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
        },
        itemContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        bodyText: {
            padding: 20,
            fontSize: 16,
            color: theme.textPrimary,
            flexWrap: 'wrap',
        },
        exerciseText: {
            padding: 20,
            fontSize: 16,
            color: theme.textPrimary,
            flexWrap: 'wrap',
            flex: 1,
        },
        iconButton: {
            padding: 10,
            height: 40,
            justifyContent: 'center',
            alignSelf: 'center',
            borderColor: theme.textPrimary,
            borderWidth: 1,
            borderRadius: 8,
            marginHorizontal: 2,
        },

        // ── Set logging ──
        logsContainer: {
            backgroundColor: theme.surface,
            marginHorizontal: 8,
            marginBottom: 8,
            borderRadius: 8,
            padding: 10,
            borderWidth: 0.5,
            borderColor: theme.surfaceBorder,
        },
        setsHeader: {
            fontSize: 12,
            color: theme.textSecondary,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            paddingBottom: 8,
        },
        setRow: {
            borderTopWidth: 0.5,
            borderTopColor: theme.surfaceBorder,
            paddingTop: 8,
            paddingBottom: 4,
            marginBottom: 4,
        },
        setLabel: {
            fontSize: 12,
            color: theme.accentText,
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
            color: theme.textTertiary,
            marginBottom: 3,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        setInput: {
            width: '100%',
            height: 36,
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 6,
            backgroundColor: theme.surfaceElevated,
            color: theme.textPrimary,
            textAlign: 'center',
            fontSize: 15,
        },
        setInputSaved: {
            borderColor: theme.success,
        },
        setNoteInput: {
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 6,
            backgroundColor: theme.surfaceElevated,
            color: theme.textPrimary,
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
            color: theme.success,
        },

        // ── Footer ──
        footerContainer: {
            padding: 20,
            paddingBottom: 40,
            gap: 12,
        },
        startButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: theme.accent,
            borderRadius: 12,
            paddingVertical: 16,
        },
        startButtonText: {
            fontSize: 18,
            fontWeight: '700',
            color: '#000',
        },
        finishButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: theme.success,
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
            borderColor: theme.success,
            borderRadius: 12,
        },
        completedText: {
            fontSize: 16,
            color: theme.success,
            fontWeight: '600',
        },
        editButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: theme.accentText,
            borderRadius: 12,
        },
        editButtonActive: {
            borderColor: theme.surfaceBorder,
            backgroundColor: theme.surfaceElevated,
        },
        editButtonText: {
            fontSize: 15,
            color: theme.accentText,
            fontWeight: '600',
        },
        editButtonTextActive: {
            color: theme.textSecondary,
        },
        skippedBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 12,
        },
        skippedText: {
            fontSize: 16,
            color: theme.textSecondary,
            fontWeight: '600',
        },
        skipButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            minHeight: 44,  // WCAG 2.5.5
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 12,
        },
        skipButtonText: {
            fontSize: 15,
            color: theme.textSecondary,
            fontWeight: '600',
        },

        // ── Skip modal ──
        skipModalCard: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 28,
            width: '100%',
        },
        skipModalTitle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: theme.textPrimary,
            marginBottom: 16,
        },
        skipModalInput: {
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 8,
            backgroundColor: theme.surfaceElevated,
            color: theme.textPrimary,
            padding: 12,
            fontSize: 15,
            minHeight: 80,
            marginBottom: 20,
            textAlignVertical: 'top',
        },
        rescheduleButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            minHeight: 44,  // WCAG 2.5.5
            borderWidth: 1,
            borderColor: theme.accentText,
            borderRadius: 12,
        },
        rescheduleButtonText: {
            fontSize: 15,
            color: theme.accentText,
            fontWeight: '600',
        },

        // ── Date picker modal ──
        datePickerCard: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 20,
            width: '100%',
        },
        datePickerTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: theme.textPrimary,
            marginBottom: 12,
            textAlign: 'center',
        },
        datePickerNavRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
        },
        datePickerNavBtn: {
            minWidth: 44,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
        },
        datePickerMonthLabel: {
            fontSize: 15,
            fontWeight: '600',
            color: theme.textPrimary,
        },
        datePickerDowRow: {
            flexDirection: 'row',
            marginBottom: 4,
        },
        datePickerDowLabel: {
            flex: 1,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: '600',
            color: theme.textSecondary,  // textTertiary fails 4.5:1 on dark surface
        },
        datePickerRow: {
            flexDirection: 'row',
            marginBottom: 2,
        },
        datePickerCellWrap: {
            flex: 1,
            alignItems: 'center',
        },
        datePickerCell: {
            width: 34,
            height: 34,
            borderRadius: 17,
            justifyContent: 'center',
            alignItems: 'center',
        },
        datePickerCellTodayRing: {
            borderWidth: 1.5,
            borderColor: theme.textPrimary,
        },
        datePickerCellSourceRing: {
            borderWidth: 1.5,
            borderColor: theme.accentText,
        },
        datePickerCellSelected: {
            backgroundColor: theme.accent,
        },
        datePickerCellText: {
            fontSize: 13,
            color: theme.textPrimary,
        },
        datePickerCellTodayText: {
            fontWeight: '700',
        },
        datePickerCellSelectedText: {
            color: '#000',
            fontWeight: '700',
        },
        datePickerCellPastText: {
            color: theme.textTertiary,
        },
        datePickerCellOtherMonth: {
            color: 'transparent',
        },
        datePickerConfirmDisabled: {
            opacity: 0.4,
        },

        // ── Finish overlay ──
        overlayBackdrop: {
            flex: 1,
            backgroundColor: theme.overlay,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
        },
        overlayCard: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 28,
            width: '100%',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.success,
        },
        rescheduleCard: {
            borderColor: theme.accentText,
        },
        rescheduleButtonPrimary: {
            backgroundColor: theme.accent,
        },
        overlayIcon: { marginBottom: 12 },
        overlayMessage: {
            fontSize: 22,
            fontWeight: 'bold',
            color: theme.textPrimary,
            textAlign: 'center',
            marginBottom: 8,
        },
        overlaySubtext: {
            fontSize: 14,
            color: theme.textSecondary,
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
            backgroundColor: theme.success,
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
            borderColor: theme.surfaceBorder,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: 'center',
        },
        overlayButtonSecondaryText: {
            color: theme.textSecondary,
            fontSize: 15,
        },
        deleteCard: {
            borderColor: theme.danger,
        },
        deleteButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderWidth: 1,
            borderColor: theme.danger,
            borderRadius: 12,
            minHeight: 48,
        },
        deleteButtonText: {
            fontSize: 15,
            color: theme.danger,
            fontWeight: '600',
        },
        deleteConfirmButton: {
            flex: 1,
            backgroundColor: theme.danger,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: 'center',
        },
        deleteConfirmButtonText: {
            color: '#ffffff',
            fontWeight: '700',
            fontSize: 15,
        },

        // ── Video ──
        videoContainer: {
            flex: 1,
            justifyContent: 'center',
            backgroundColor: theme.background,
        },
        video: {
            alignSelf: 'center',
            width: 320,
            height: 200,
        },
    });
}
