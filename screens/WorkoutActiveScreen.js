/**
 * WorkoutActiveScreen.js
 *
 * Full-screen, set-by-set active workout flow.
 *
 * Progression rules:
 *  - Non-circuit section: run all sets of exercise A, then all sets of B, etc.
 *  - Circuit section: A1 → B1 → C1 → A2 → B2 → C2 … cycling only exercises
 *    that still have sets remaining (so if A has 2 sets but B has 3: A1→B1→A2→B2→B3).
 *  - Timed section: shows work timer (countMin..countMax seconds) then a rest
 *    screen (repRest between exercises, setRest between sets of the same exercise).
 *    Timer starts only when the user taps Start. In auto mode it advances itself;
 *    in manual mode it stops and waits for the user to tap Next.
 *
 * Skip rules:
 *  - Skipping marks all remaining sets for that exercise as handled.
 *  - Required sets (setNum ≤ setsMin) → enqueue history record with skipped=true + note.
 *  - Optional sets (setNum > setsMin) → not recorded.
 *  - Skipped exercises are excluded from weight-recommendation history on the server.
 */

import * as React from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet,
    ScrollView, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';
import { enqueueRecord, syncQueue, getLocalWorkoutHistory } from '../utils/WorkoutSync';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveUnit(raw) {
    if (raw === 'imperial') return 'lbs';
    if (raw === 'metric')   return 'kg';
    if (raw === 'lbs' || raw === 'kg') return raw;
    return null;
}

function totalSetsForExercise(ex) {
    return ex.setsMax ?? ex.setsMin ?? 1;
}

function requiredSetsForExercise(ex) {
    return ex.setsMin ?? 1;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function formatPrescription(ex) {
    const { countType, countMin, countMax, timeCapSeconds } = ex;
    if (!countType) return null;
    if (countType === 'AMRAP') return timeCapSeconds ? `AMRAP · ${Math.round(timeCapSeconds / 60)} min cap` : 'AMRAP';
    const unit = countType === 'Timed' ? 'sec' : 'reps';
    if (countMax) return `${countMin}–${countMax} ${unit}`;
    if (countMin) return `${countMin} ${unit}`;
    return countType;
}

/**
 * Given the current section (circuit), find the next exercise index
 * (after `currentIdx`) that still has sets remaining, wrapping once around.
 * Returns null if all exercises are exhausted.
 */
function nextCircuitExerciseIdx(exercises, setsCompleted, currentIdx) {
    const count = exercises.length;
    for (let offset = 1; offset <= count; offset++) {
        const idx = (currentIdx + offset) % count;
        const ex = exercises[idx];
        if ((setsCompleted[ex.id] ?? 0) < totalSetsForExercise(ex)) {
            return idx;
        }
    }
    return null; // all done
}

// ─── Section complete overlay ─────────────────────────────────────────────────

const SectionCompleteModal = ({ visible, onBackToSummary }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onBackToSummary}>
            <View style={styles.overlayBackdrop}>
                <View style={[styles.overlayCard, styles.sectionCompleteCard]}>
                    <Feather name="check-circle" size={52} color={theme.success} style={styles.overlayIcon} />
                    <Text style={styles.overlayMessage}>Section complete!</Text>
                    <Text style={styles.overlaySubtext}>Great work. Your sets have been saved.</Text>
                    <Pressable
                        style={styles.sectionCompleteButton}
                        onPress={onBackToSummary}
                        testID="section-complete-back-button"
                    >
                        <Feather name="arrow-left" size={16} color="#000" style={{ marginRight: 6 }} />
                        <Text style={styles.sectionCompleteButtonText}>Back to workout summary</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

// ─── Finish overlay ───────────────────────────────────────────────────────────

const FINISH_MESSAGES = [
    { icon: 'thumbs-up', text: 'Nice job, friend!' },
    { icon: 'star',      text: "Yay, you did it!" },
    { icon: 'sun',       text: 'Way to show up for yourself today.' },
    { icon: 'zap',       text: "You're on fire. Keep that momentum." },
    { icon: 'award',     text: 'Another one in the books.' },
    { icon: 'heart',     text: 'Hard work, done. Proud of you.' },
];

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
                    <Text style={styles.overlaySubtext}>Mark this workout as finished?</Text>
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

// ─── Timer component ──────────────────────────────────────────────────────────

/**
 * Displays during a timed section.
 *
 * Props:
 *   phase          'work' | 'rest'
 *   workMin        number (seconds) — min work time (show "Min reached" banner at this point)
 *   workMax        number (seconds) — max work time (auto-advance or stop here)
 *   restSeconds    number (seconds)
 *   timerMode      'auto' | 'manual'
 *   upNextName     string | null    — shown during rest phase
 *   onAdvance      () => void       — called when timer should move to next step
 */
const ON_COLOR_MUTED = 'rgba(255,255,255,0.75)';
const ON_COLOR_BANNER_BG = 'rgba(0,0,0,0.2)';

const WorkTimer = ({ phase, workMin, workMax, restSeconds, timerMode, upNextName, onAdvance, onElapsedWork, paused = false, onTimerStart, phaseLabel, autoStart = false }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);

    const targetSeconds = phase === 'work' ? workMax : restSeconds;
    const [elapsed, setElapsed] = React.useState(0);
    const [started, setStarted] = React.useState(false);
    const [minReached, setMinReached] = React.useState(false);
    const [maxReached, setMaxReached] = React.useState(false);

    // Reset when phase changes
    React.useEffect(() => {
        setElapsed(0);
        setStarted(false);
        setMinReached(false);
        setMaxReached(false);
    }, [phase]);

    // Auto-start on mount when parent signals it (auto-advance mode)
    React.useEffect(() => {
        if (autoStart) {
            setStarted(true);
            onTimerStart?.();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Tick — only increments elapsed, no side effects inside the updater
    React.useEffect(() => {
        if (!started || maxReached || paused) return;
        const interval = setInterval(() => {
            setElapsed(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [started, maxReached, paused]);

    // Threshold checks run after each tick, outside the updater
    React.useEffect(() => {
        if (!started || maxReached) return;
        if (phase === 'work' && workMin && elapsed >= workMin && !minReached) {
            setMinReached(true);
        }
        if (targetSeconds != null && elapsed >= targetSeconds) {
            setMaxReached(true);
        }
    }, [elapsed]);

    // Auto-advance fires once when maxReached flips to true
    React.useEffect(() => {
        if (!maxReached || timerMode !== 'auto') return;
        if (phase === 'work') onElapsedWork?.(elapsed);
        onAdvance();
    }, [maxReached]);

    const remaining = Math.max(0, targetSeconds - elapsed);
    const isWork = phase === 'work';
    const hasRange = workMin && workMax && workMin !== workMax;
    const cardBg = isWork ? theme.success : theme.danger;

    return (
        <View style={[styles.timerContainer, { backgroundColor: cardBg, borderWidth: 0 }]}>
            {isWork ? (
                <>
                    <Text style={[styles.timerPhaseLabel, { color: ON_COLOR_MUTED }]}>{phaseLabel ?? 'WORK'}</Text>
                    <Text style={styles.timerDisplay}>{formatTime(remaining)}</Text>
                    {hasRange && minReached && !maxReached && (
                        <View style={[styles.timerBanner, { backgroundColor: ON_COLOR_BANNER_BG }]}>
                            <Text style={[styles.timerBannerText, { color: '#fff' }]}>Min time reached — keep going or advance</Text>
                        </View>
                    )}
                    {maxReached && (
                        <View style={[styles.timerBanner, { backgroundColor: ON_COLOR_BANNER_BG }]}>
                            <Text style={[styles.timerBannerText, { color: '#fff' }]}>Max time reached</Text>
                        </View>
                    )}
                </>
            ) : (
                <>
                    <Text style={[styles.timerPhaseLabel, { color: ON_COLOR_MUTED }]}>{phaseLabel ?? 'REST'}</Text>
                    <Text style={styles.timerDisplay}>{formatTime(remaining)}</Text>
                    {upNextName && (
                        <View style={styles.upNextContainer}>
                            <Text style={[styles.upNextLabel, { color: ON_COLOR_MUTED }]}>UP NEXT</Text>
                            <Text style={styles.upNextName}>{upNextName}</Text>
                        </View>
                    )}
                    {maxReached && timerMode === 'manual' && (
                        <Pressable
                            style={[styles.timerStartButton, { backgroundColor: '#fff', marginTop: 20 }]}
                            onPress={onAdvance}
                            testID="timer-rest-next-button"
                        >
                            <Text style={[styles.timerStartText, { color: theme.danger }]}>Next →</Text>
                        </Pressable>
                    )}
                </>
            )}

            {!started && (
                <Pressable style={[styles.timerStartButton, { backgroundColor: '#fff' }]} onPress={() => { setStarted(true); onTimerStart?.(); }}>
                    <Feather name="play" size={18} color={cardBg} />
                    <Text style={[styles.timerStartText, { color: cardBg }]}>Start</Text>
                </Pressable>
            )}

            {started && !maxReached && isWork && minReached && (
                <Pressable style={[styles.timerAdvanceButton, { borderColor: ON_COLOR_MUTED }]} onPress={() => {
                    onElapsedWork?.(elapsed);
                    onAdvance();
                }}>
                    <Text style={[styles.timerAdvanceText, { color: '#fff' }]}>Done early</Text>
                </Pressable>
            )}
        </View>
    );
};

// ─── Demo video player ────────────────────────────────────────────────────────

const CF_STREAM = 'https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com';

function ActiveDemoVideo({ streamId, styles }) {
    const player = useVideoPlayer(
        { uri: `${CF_STREAM}/${streamId}/manifest/video.m3u8` },
        p => { p.loop = true; p.muted = true; p.play(); }
    );
    return (
        <View style={styles.videoContainer}>
            <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
        </View>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WorkoutActiveScreen({ route, navigation }) {
    const { workoutData, workoutId, scheduledWorkoutId, scheduledDate, clientEmail: clientEmailParam, viewerIsAthlete, sectionOnly = false, startSectionIdx = 0 } = route.params;
    const { user, accessToken, authFetch } = useAuth();
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const scrollY = useScrollY();
    const headerHeight = useHeaderHeight();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));

    // ── Cursor ──────────────────────────────────────────────────────────────
    const [sectionIdx, setSectionIdx] = React.useState(startSectionIdx);
    const [exerciseIdx, setExerciseIdx] = React.useState(0);
    const [setNum, setSetNum] = React.useState(1);
    const [currentSide, setCurrentSide] = React.useState(1);

    // setsCompleted[exId] = count of sets that have been finished (completed or skipped)
    const [setsCompleted, setSetsCompleted] = React.useState({});

    // ── Demo metadata (name, streamId) fetched per exercise ────────────────
    const [demos, setDemos] = React.useState({});

    // ── Set input ───────────────────────────────────────────────────────────
    const profileUnit = resolveUnit(user?.unitDefault) ?? 'lbs';
    const [weight,     setWeight]     = React.useState('');
    const [count,      setCount]      = React.useState('');
    const [rpe,        setRpe]        = React.useState('');
    const [note,       setNote]       = React.useState('');
    const [weightUnit, setWeightUnit] = React.useState(profileUnit);
    const [otherLoad,  setOtherLoad]  = React.useState('');
    const [elapsedWork, setElapsedWork] = React.useState(null); // for timed exercises
    const elapsedWorkRef = React.useRef(null); // sync ref so handleTimerAdvance reads current value

    // ── Timer ───────────────────────────────────────────────────────────────
    const [timerMode,  setTimerMode]  = React.useState('manual'); // 'auto' | 'manual'
    const [timerPhase, setTimerPhase] = React.useState('work');   // 'work' | 'rest' | 'side-rest'
    const [timerPaused, setTimerPaused] = React.useState(false);
    const [autoStartNext, setAutoStartNext] = React.useState(false);
    const timerActiveRef = React.useRef(false);
    const hasSavedSetsRef = React.useRef(false);

    // ── Video ───────────────────────────────────────────────────────────────
    const [showVideo, setShowVideo] = React.useState(false);

    // ── Finish ──────────────────────────────────────────────────────────────
    const [showFinishOverlay, setShowFinishOverlay] = React.useState(false);
    const [showSectionCompleteModal, setShowSectionCompleteModal] = React.useState(false);
    const [workoutDone, setWorkoutDone] = React.useState(false);

    // ── Back-navigation guard ────────────────────────────────────────────────
    React.useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (workoutDone) return;
            // Also allow leaving if no sets have been saved and the timer isn't running
            if (!timerActiveRef.current && !hasSavedSetsRef.current) return;
            e.preventDefault();
            if (timerActiveRef.current) setTimerPaused(true);
            Alert.alert(
                'Leave workout?',
                timerActiveRef.current
                    ? 'The timer is running. Are you sure you want to leave?'
                    : 'You\'re in the middle of a workout. Leave anyway?',
                [
                    {
                        text: 'Stay',
                        style: 'cancel',
                        onPress: () => { if (timerActiveRef.current) setTimerPaused(false); },
                    },
                    {
                        text: 'Leave',
                        style: 'destructive',
                        onPress: () => navigation.dispatch(e.data.action),
                    },
                ],
            );
        });
        return unsubscribe;
    }, [navigation, workoutDone]);

    // Reset timer active state and side when advancing to a new section
    React.useEffect(() => {
        timerActiveRef.current = false;
        setTimerPaused(false);
        setCurrentSide(1);
    }, [sectionIdx]);

    // ── Derived current state ───────────────────────────────────────────────
    const currentSection  = workoutData[sectionIdx];
    const currentExercise = currentSection?.data[exerciseIdx];
    const isCircuit       = currentSection?.circuit ?? false;
    const isTimed         = currentSection?.timed ?? false;
    const repRest         = currentSection?.repRest ?? 30;   // between exercises
    const setRest         = currentSection?.setRest ?? 60;   // between sets

    const totalSets   = currentExercise ? totalSetsForExercise(currentExercise) : 1;
    const requiredSets = currentExercise ? requiredSetsForExercise(currentExercise) : 1;
    const isOptionalSet = setNum > requiredSets;

    const demo = currentExercise ? (demos[currentExercise.id] ?? null) : null;
    const exerciseName = demo?.name ?? currentExercise?.name ?? '…';
    const hasVideo = !!demo?.streamId;

    // Pre-fetch last weight unit for current exercise
    React.useEffect(() => {
        if (!user?.email || !currentExercise?.id || !authFetch) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(
                    `${WORKER_URL}/history/exercise-summary?clientEmail=${encodeURIComponent(user.email)}&exerciseId=${encodeURIComponent(currentExercise.id)}`
                );
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;
                const lastUnit = data.lastSet?.weightUnit;
                if (!lastUnit) return;
                const resolved = resolveUnit(lastUnit);
                if (resolved) {
                    setWeightUnit(resolved);
                } else {
                    setWeightUnit('other');
                    setOtherLoad(lastUnit);
                }
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [currentExercise?.id]);

    // Pre-fill inputs from per-set config (or exercise-level fallback) when exercise/set changes
    React.useEffect(() => {
        if (!currentExercise) return;
        const cfg = currentExercise.setConfigs?.[setNum - 1] ?? null;
        const rw  = cfg?.weight   ?? currentExercise.recommendedWeight ?? null;
        const rr  = cfg?.rpe      ?? currentExercise.recommendedRpe    ?? null;
        const rc  = cfg?.countMin ?? currentExercise.countMin          ?? null;

        if (rw && /^[\d.]+$/.test(String(rw).trim())) setWeight(String(rw).trim());
        if (rr != null && /^[\d.]+$/.test(String(rr).trim())) setRpe(String(rr).trim());
        if (rc != null && (currentExercise.countType === 'Reps' || currentExercise.countType === 'Timed')) {
            setCount(String(rc));
        }
    }, [currentExercise?.id, setNum]);

    // Fetch demo metadata for exercises we haven't seen yet
    React.useEffect(() => {
        if (!currentExercise?.id || demos[currentExercise.id] !== undefined) return;
        let cancelled = false;
        (async () => {
            try {
                const res  = await fetch(`${WORKER_URL}/demos/${currentExercise.id}`);
                const data = res.ok ? await res.json() : { id: currentExercise.id, name: currentExercise.name, streamId: null };
                if (!cancelled) setDemos(prev => ({ ...prev, [currentExercise.id]: data }));
            } catch {
                if (!cancelled) setDemos(prev => ({ ...prev, [currentExercise.id]: { id: currentExercise.id, name: currentExercise.name, streamId: null } }));
            }
        })();
        return () => { cancelled = true; };
    }, [currentExercise?.id]);

    // Also prefetch next exercise's demo while user is on current
    React.useEffect(() => {
        const nextEx = peekNextExercise();
        if (!nextEx || demos[nextEx.id] !== undefined) return;
        let cancelled = false;
        (async () => {
            try {
                const res  = await fetch(`${WORKER_URL}/demos/${nextEx.id}`);
                const data = res.ok ? await res.json() : { id: nextEx.id, name: nextEx.name, streamId: null };
                if (!cancelled) setDemos(prev => ({ ...prev, [nextEx.id]: data }));
            } catch {
                if (!cancelled) setDemos(prev => ({ ...prev, [nextEx.id]: { id: nextEx.id, name: nextEx.name, streamId: null } }));
            }
        })();
        return () => { cancelled = true; };
    }, [sectionIdx, exerciseIdx, setNum]);

    // ── Workout position helpers ────────────────────────────────────────────

    /** Return the exercise object that will come after current, or null if section/workout ends. */
    function peekNextExercise() {
        if (!currentSection) return null;
        if (isCircuit) {
            const nextIdx = nextCircuitExerciseIdx(currentSection.data, setsCompleted, exerciseIdx);
            if (nextIdx === null) {
                // section done — first exercise of next section
                const nextSection = workoutData[sectionIdx + 1];
                return nextSection?.data[0] ?? null;
            }
            return currentSection.data[nextIdx];
        } else {
            // non-circuit: same exercise until sets exhausted, then next exercise
            if (setNum < totalSets) return currentExercise;
            const nextEx = currentSection.data[exerciseIdx + 1];
            if (nextEx) return nextEx;
            return workoutData[sectionIdx + 1]?.data[0] ?? null;
        }
    }

    function upNextName() {
        const next = peekNextExercise();
        if (!next) return null;
        return demos[next.id]?.name ?? next.name ?? null;
    }

    function upNextInfo() {
        const nextEx = peekNextExercise();
        if (!nextEx) return null;

        const isNextNewSection = nextEx === workoutData[sectionIdx + 1]?.data[0];
        if (sectionOnly && isNextNewSection) return null;

        const name         = demos[nextEx.id]?.name ?? nextEx.name ?? '…';
        const prescription = formatPrescription(nextEx);

        if (isNextNewSection) {
            const display = prescription ? `New Section - ${name}, ${prescription}` : `New Section - ${name}`;
            return { text: display, accessLabel: `Up next: New Section, ${name}${prescription ? `, ${prescription}` : ''}` };
        }

        const isSameExercise = nextEx === currentExercise;
        const nextSetNum     = isSameExercise ? setNum + 1 : (setsCompleted[nextEx.id] ?? 0) + 1;
        const display        = prescription ? `${name} Set ${nextSetNum}, ${prescription}` : `${name} Set ${nextSetNum}`;
        return { text: display, accessLabel: `Up next: ${display}` };
    }

    // ── Record a set to history ─────────────────────────────────────────────

    function recordSet({ skipped = false, actualCount = null } = {}) {
        if (!currentExercise) return;
        if (skipped && isOptionalSet) return; // don't record optional skips

        const isTrullyTimed = currentExercise.countType === 'Timed';
        const weightVal = weightUnit === 'other' ? otherLoad : weight;

        const record = {
            dateTime:      new Date().toISOString(),
            clientId:      user?.email,
            workoutId,
            exerciseId:    currentExercise.id,
            set:           setNum,
            weight:        (weightUnit !== 'other' && weight) ? parseFloat(weight) : null,
            weightUnit:    weightUnit === 'other' ? (otherLoad || null) : weightUnit,
            reps:          (!isTrullyTimed && count && !skipped) ? parseInt(count) : null,
            rpe:           (rpe && !skipped) ? parseFloat(rpe) : null,
            note:          note || null,
            countType:     currentExercise.countType ?? null,
            prescribed:    currentExercise.countMin != null ? parseFloat(currentExercise.countMin) : null,
            prescribedMax: currentExercise.countMax != null ? parseFloat(currentExercise.countMax) : null,
            unit:          isTrullyTimed ? 'seconds' : 'reps',
            skipped,
            ...(isTrullyTimed && (actualCount ?? count) ? { reps: parseInt(actualCount ?? count) } : {}),
        };

        enqueueRecord(record);
        hasSavedSetsRef.current = true;
        if (accessToken) syncQueue(accessToken);
    }

    // ── Clear set input fields ──────────────────────────────────────────────

    function resetSetInputs() {
        setWeight('');
        setCount('');
        setRpe('');
        setNote('');
        setElapsedWork(null);
        setShowVideo(false);
        // weightUnit intentionally preserved
    }

    // ── Advance cursor ──────────────────────────────────────────────────────

    // withRest=true: show a rest timer before the next set (default for handleSkip).
    // withRest=false: cursor has already come from a rest — don't add another one.
    function advanceCursor(newSetsCompleted, withRest = true) {
        if (!currentSection) return;

        if (isCircuit) {
            const nextIdx = nextCircuitExerciseIdx(currentSection.data, newSetsCompleted, exerciseIdx);
            if (nextIdx !== null) {
                const nextEx = currentSection.data[nextIdx];
                setExerciseIdx(nextIdx);
                setSetNum((newSetsCompleted[nextEx.id] ?? 0) + 1);
                if (isTimed && withRest) setTimerPhase('rest');
            } else {
                advanceToNextSection();
            }
        } else {
            if (setNum < totalSets) {
                setSetNum(setNum + 1);
                if (isTimed && withRest) setTimerPhase('rest');
            } else {
                const nextExIdx = exerciseIdx + 1;
                if (nextExIdx < currentSection.data.length) {
                    setExerciseIdx(nextExIdx);
                    setSetNum(1);
                    if (isTimed && withRest) setTimerPhase('rest');
                } else {
                    advanceToNextSection();
                }
            }
        }
    }

    function advanceToNextSection() {
        if (sectionOnly) {
            if (accessToken) syncQueue(accessToken);
            setShowSectionCompleteModal(true);
            return;
        }
        const nextSectionIdx = sectionIdx + 1;
        if (nextSectionIdx < workoutData.length) {
            setSectionIdx(nextSectionIdx);
            setExerciseIdx(0);
            setSetNum(1);
            setSetsCompleted({});
            setTimerPhase('work');
        } else {
            setShowFinishOverlay(true);
        }
    }

    // ── Handle Next ─────────────────────────────────────────────────────────

    function handleNext() {
        // During rest phase: advance cursor (set was already recorded)
        if (isTimed && timerPhase === 'rest') {
            const newCompleted = pendingAdvanceRef.current ?? setsCompleted;
            pendingAdvanceRef.current = null;
            setTimerPhase('work');
            setCurrentSide(1);
            resetSetInputs();
            advanceCursor(newCompleted, false);
            return;
        }

        // Two-sided timed: side 1 transitions to side-rest without recording yet
        if (isTimed && (currentExercise?.sides ?? 'single') === 'two' && currentSide === 1) {
            setTimerPhase('side-rest');
            return;
        }

        recordSet({ skipped: false, actualCount: elapsedWorkRef.current != null ? String(elapsedWorkRef.current) : null });

        const newCompleted = {
            ...setsCompleted,
            [currentExercise.id]: (setsCompleted[currentExercise.id] ?? 0) + 1,
        };
        setSetsCompleted(newCompleted);
        resetSetInputs();
        setCurrentSide(1);

        if (isTimed) {
            setTimerPhase('rest');
        }
        if (!isTimed) {
            advanceCursor(newCompleted);
        } else {
            pendingAdvanceRef.current = newCompleted;
        }
    }

    const pendingAdvanceRef = React.useRef(null);

    function recordTimedSet() {
        const elapsedVal = elapsedWorkRef.current;
        recordSet({ skipped: false, actualCount: elapsedVal != null ? String(elapsedVal) : null });
        const newCompleted = {
            ...setsCompleted,
            [currentExercise.id]: (setsCompleted[currentExercise.id] ?? 0) + 1,
        };
        setSetsCompleted(newCompleted);
        pendingAdvanceRef.current = newCompleted;
        return newCompleted;
    }

    function handleTimerAdvance() {
        const isTwoSided = (currentExercise?.sides ?? 'single') === 'two';

        if (timerPhase === 'work') {
            if (isTwoSided && currentSide === 1) {
                // Side 1 ends — rest between sides, record happens after side 2
                setTimerPhase('side-rest');
            } else {
                // Single-sided or side 2 — record the set then rest
                recordTimedSet();
                setTimerPhase('rest');
                if (timerMode === 'auto') setAutoStartNext(true);
            }
        } else if (timerPhase === 'side-rest') {
            // Rest between sides done — start side 2 immediately
            setCurrentSide(2);
            setTimerPhase('work');
            setAutoStartNext(true);
        } else {
            // Post-set rest done — advance cursor (rest already happened, withRest=false)
            const newCompleted = pendingAdvanceRef.current ?? setsCompleted;
            pendingAdvanceRef.current = null;
            setTimerPhase('work');
            setCurrentSide(1);
            resetSetInputs();
            advanceCursor(newCompleted, false);
            if (timerMode === 'auto') setAutoStartNext(true);
        }
    }

    // ── Handle Skip ─────────────────────────────────────────────────────────

    function handleSkip() {
        if (!currentExercise) return;

        // Record each remaining required set as skipped (optional sets skipped silently)
        const start = setNum;
        const end   = totalSets;
        for (let s = start; s <= end; s++) {
            const isOpt = s > requiredSets;
            if (!isOpt) {
                // Record with current note for first set; blank note for subsequent
                const noteVal = s === start ? note : null;
                const record = {
                    dateTime:   new Date().toISOString(),
                    clientId:   user?.email,
                    workoutId,
                    exerciseId: currentExercise.id,
                    set:        s,
                    weight:     null, weightUnit: weightUnit === 'other' ? (otherLoad || null) : weightUnit,
                    reps:       null, rpe: null,
                    note:       noteVal,
                    countType:  currentExercise.countType ?? null,
                    prescribed: currentExercise.countMin != null ? parseFloat(currentExercise.countMin) : null,
                    prescribedMax: currentExercise.countMax != null ? parseFloat(currentExercise.countMax) : null,
                    unit:       currentExercise.countType === 'Timed' ? 'seconds' : 'reps',
                    skipped:    true,
                };
                enqueueRecord(record);
            }
        }
        if (accessToken) syncQueue(accessToken);

        // Mark all sets of this exercise as done in setsCompleted
        const newCompleted = {
            ...setsCompleted,
            [currentExercise.id]: totalSets,
        };
        setSetsCompleted(newCompleted);
        resetSetInputs();
        advanceCursor(newCompleted);
    }

    // ── Finish confirm ──────────────────────────────────────────────────────

    async function handleFinishConfirm() {
        setShowFinishOverlay(false);
        setWorkoutDone(true);

        if (scheduledWorkoutId) {
            try {
                await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: scheduledWorkoutId, completedAt: new Date().toISOString() }),
                });
            } catch (e) {
                console.error('Could not mark workout complete:', e);
            }
        }

        if (accessToken) syncQueue(accessToken);
    }

    async function handleBackToSummary() {
        setShowSectionCompleteModal(false);
        const localHistory = await getLocalWorkoutHistory(workoutId);
        const clientEmail  = clientEmailParam ?? user?.email;
        navigation.navigate('Workout Preview', {
            id: workoutId,
            scheduledWorkoutId,
            scheduledDate,
            viewerIsAthlete: viewerIsAthlete ?? true,
            clientEmail,
            localHistory: Object.keys(localHistory).length > 0 ? localHistory : undefined,
        });
    }

    async function handleBackToPreview() {
        const localHistory = await getLocalWorkoutHistory(workoutId);
        const clientEmail  = clientEmailParam ?? user?.email;

        // Pop back past WorkoutActive to WorkoutPreview, replacing its params so
        // it opens in completed state with local history immediately available.
        navigation.navigate('Workout Preview', {
            id: workoutId,
            scheduledWorkoutId,
            scheduledDate,
            initialStatus: 'completed',
            viewerIsAthlete: viewerIsAthlete ?? true,
            clientEmail,
            localHistory: Object.keys(localHistory).length > 0 ? localHistory : undefined,
            calendarRefresh: true,
        });
    }

    // ── Completed state ─────────────────────────────────────────────────────

    if (workoutDone) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Feather name="award" size={64} color={theme.success} style={styles.doneIcon} />
                <Text style={styles.doneTitle}>Workout complete!</Text>
                <Text style={styles.doneSubtitle}>Your sets have been saved locally and will sync shortly.</Text>
                <Pressable style={styles.doneButton} onPress={handleBackToPreview}>
                    <Text style={styles.doneButtonText}>Back to preview</Text>
                </Pressable>
            </View>
        );
    }

    if (!currentExercise) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Text style={styles.headingText}>Loading workout…</Text>
            </View>
        );
    }

    // ── Header info ─────────────────────────────────────────────────────────

    const sectionLabel = `Section ${sectionIdx + 1}${isCircuit ? ' · Circuit' : ''}${isTimed ? ' · Timed' : ''}`;
    const totalExInSection = currentSection.data.length;
    const setLabel = `Set ${setNum} of ${totalSets}${isOptionalSet ? ' (optional)' : ''}`;
    // Per-set config overrides exercise-level recommendations
    const setConfig  = currentExercise?.setConfigs?.[setNum - 1] ?? null;
    const recWeight  = setConfig?.weight   ?? currentExercise?.recommendedWeight ?? null;
    const recRpe     = setConfig?.rpe      ?? currentExercise?.recommendedRpe    ?? null;
    const effCountMin = setConfig?.countMin ?? currentExercise?.countMin ?? null;

    const prescription = formatPrescription({ ...currentExercise, countMin: effCountMin });

    // ── Determine which rest time applies (between exercises vs between sets) ──
    const isNextSameExercise = !isCircuit && setNum < totalSets;
    const currentRestSeconds = isNextSameExercise ? setRest : repRest;

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={headerHeight}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                    <Text style={styles.exerciseLabel}>{exerciseIdx + 1} / {totalExInSection}</Text>
                </View>

                {/* ── Exercise title ── */}
                <Text style={styles.exerciseName}>{exerciseName}</Text>

                {/* ── Prescription pills ── */}
                <View style={styles.pillsRow}>
                    {prescription && (
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>{prescription}</Text>
                        </View>
                    )}
                    <View style={[styles.pill, isOptionalSet && styles.pillOptional]}>
                        <Text style={[styles.pillText, isOptionalSet && styles.pillTextOptional]}>{setLabel}</Text>
                    </View>
                </View>

                {/* ── Coach notes ── */}
                {currentExercise.coachNotes ? (
                    <View style={styles.coachNotes}>
                        <Feather name="message-square" size={12} color={theme.textSecondary} style={{ marginRight: 6 }} />
                        <Text style={styles.coachNotesText}>{currentExercise.coachNotes}</Text>
                    </View>
                ) : null}

                {/* ── Coach rec ── */}
                {(recWeight || recRpe) && (
                    <View style={styles.recBanner}>
                        <Feather name="info" size={12} color={theme.accentText} style={{ marginRight: 6 }} />
                        <Text style={styles.recText}>
                            Coach rec:{recWeight ? ` ${recWeight} ${weightUnit !== 'other' ? weightUnit : ''}` : ''}
                            {recRpe ? `  ·  RPE ${recRpe}` : ''}
                        </Text>
                    </View>
                )}

                {/* ── Video toggle ── */}
                {hasVideo && (
                    <Pressable
                        style={styles.videoToggle}
                        onPress={() => setShowVideo(v => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showVideo ? `Hide ${exerciseName} demo video` : `Show ${exerciseName} demo video`}
                        accessibilityState={{ expanded: showVideo }}
                    >
                        <Feather name="film" size={15} color={showVideo ? theme.accentText : theme.textSecondary} />
                        <Text style={[styles.videoToggleText, showVideo && { color: theme.accentText }]}>
                            {showVideo ? 'Hide demo' : 'Show demo'}
                        </Text>
                    </Pressable>
                )}
                {showVideo && hasVideo && (
                    <>
                        <ActiveDemoVideo streamId={demo.streamId} styles={styles} />
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

                {/* ── Timer mode row (always visible for timed sections) ── */}
                {isTimed && timerPhase !== 'side-rest' && (
                    <View style={styles.timerModeRow}>
                        {['manual', 'auto'].map(m => (
                            <Pressable
                                key={m}
                                style={[styles.modePill, timerMode === m && styles.modePillActive]}
                                onPress={() => setTimerMode(m)}
                            >
                                <Text style={[styles.modePillText, timerMode === m && styles.modePillTextActive]}>
                                    {m === 'manual' ? 'Manual advance' : 'Auto advance'}
                                </Text>
                            </Pressable>
                        ))}
                        {timerPhase === 'work' && (currentExercise?.sides ?? 'single') === 'two' && (
                            <View style={styles.sidePill}>
                                <Text style={styles.sidePillText}>Side {currentSide} of 2</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* ── Timer (timed sections only) ── */}
                {isTimed && timerPhase === 'work' && (
                    <>
                        <WorkTimer
                            phase="work"
                            workMin={currentExercise.countMin != null ? parseFloat(currentExercise.countMin) : null}
                            workMax={currentExercise.countMax != null ? parseFloat(currentExercise.countMax) : (currentExercise.countMin != null ? parseFloat(currentExercise.countMin) : 30)}
                            restSeconds={currentRestSeconds}
                            timerMode={timerMode}
                            upNextName={null}
                            onElapsedWork={(s) => { elapsedWorkRef.current = s; setElapsedWork(s); }}
                            onAdvance={handleTimerAdvance}
                            paused={timerPaused}
                            autoStart={autoStartNext}
                            onTimerStart={() => { timerActiveRef.current = true; setAutoStartNext(false); }}
                        />
                    </>
                )}

                {isTimed && timerPhase === 'side-rest' && (
                    <WorkTimer
                        phase="rest"
                        workMin={null}
                        workMax={null}
                        restSeconds={parseFloat(currentExercise?.restBetweenSides ?? 5)}
                        timerMode="auto"
                        upNextName={`${exerciseName} — Side 2`}
                        phaseLabel="REST (BETWEEN SIDES)"
                        onElapsedWork={null}
                        onAdvance={handleTimerAdvance}
                        paused={timerPaused}
                        autoStart={true}
                        onTimerStart={() => { timerActiveRef.current = true; }}
                    />
                )}

                {isTimed && timerPhase === 'rest' && (
                    <WorkTimer
                        phase="rest"
                        workMin={null}
                        workMax={null}
                        restSeconds={currentRestSeconds}
                        timerMode={timerMode}
                        upNextName={upNextName()}
                        onElapsedWork={null}
                        onAdvance={handleTimerAdvance}
                        paused={timerPaused}
                        autoStart={autoStartNext}
                        onTimerStart={() => { timerActiveRef.current = true; setAutoStartNext(false); }}
                    />
                )}

                {/* ── Set inputs (shown during work phase or non-timed) ── */}
                {(!isTimed || timerPhase === 'work') && timerPhase !== 'side-rest' && (
                    <View style={styles.setInputsCard}>
                        {/* Weight unit selector */}
                        <View style={styles.unitRow}>
                            {['lbs', 'kg', 'other'].map(u => (
                                <Pressable
                                    key={u}
                                    style={[styles.unitPill, weightUnit === u && styles.unitPillActive]}
                                    onPress={() => setWeightUnit(u)}
                                >
                                    <Text style={[styles.unitPillText, weightUnit === u && styles.unitPillTextActive]}>{u}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={styles.inputRow}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{weightUnit === 'other' ? 'Load' : `Wt (${weightUnit})`}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={weightUnit === 'other' ? otherLoad : weight}
                                    onChangeText={weightUnit === 'other' ? setOtherLoad : setWeight}
                                    placeholder="—"
                                    placeholderTextColor={theme.textSecondary}
                                    keyboardType={weightUnit === 'other' ? 'default' : 'decimal-pad'}
                                    returnKeyType="next"
                                />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>
                                    {currentExercise.countType === 'Timed' ? 'Sec done' : currentExercise.countType === 'AMRAP' ? 'Reps (AMRAP)' : 'Reps done'}
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    value={count}
                                    onChangeText={setCount}
                                    placeholder="—"
                                    placeholderTextColor={theme.textSecondary}
                                    keyboardType="number-pad"
                                    returnKeyType="next"
                                />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>RPE</Text>
                                <TextInput
                                    style={styles.input}
                                    value={rpe}
                                    onChangeText={setRpe}
                                    placeholder="—"
                                    placeholderTextColor={theme.textSecondary}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                />
                            </View>
                        </View>

                        <TextInput
                            style={styles.noteInput}
                            value={note}
                            onChangeText={setNote}
                            placeholder="Note (optional)"
                            placeholderTextColor={theme.textSecondary}
                            multiline
                        />
                    </View>
                )}

                {/* ── Up Next ── */}
                {timerPhase !== 'side-rest' && (() => {
                    const info = upNextInfo();
                    if (!info) return null;
                    return (
                        <View
                            style={styles.upNextBanner}
                            accessible={true}
                            accessibilityRole="text"
                            accessibilityLabel={info.accessLabel}
                            testID="up-next-banner"
                        >
                            <Text style={styles.upNextBannerLabel}>UP NEXT</Text>
                            <Text style={styles.upNextBannerText} numberOfLines={1}>{info.text}</Text>
                        </View>
                    );
                })()}

                {/* ── Actions ── */}
                {timerPhase !== 'side-rest' && (
                    <View style={styles.actionsRow}>
                        {(!isTimed || timerPhase === 'work') && (
                            <Pressable style={styles.skipButton} onPress={handleSkip}>
                                <Text style={styles.skipButtonText}>Skip exercise</Text>
                            </Pressable>
                        )}
                        <Pressable style={styles.nextButton} onPress={handleNext}>
                            <Text style={styles.nextButtonText}>
                                {setNum === totalSets && exerciseIdx === currentSection.data.length - 1 && (sectionOnly || sectionIdx === workoutData.length - 1)
                                    ? (sectionOnly ? 'Finish section' : 'Finish workout')
                                    : 'Next'}
                            </Text>
                            <Feather name="arrow-right" size={18} color="#000" />
                        </Pressable>
                    </View>
                )}

                {/* Note stays open during rest for timed sections */}
                {isTimed && timerPhase === 'rest' && (
                    <View style={styles.setInputsCard}>
                        <TextInput
                            style={styles.noteInput}
                            value={note}
                            onChangeText={setNote}
                            placeholder="Add a note for this set…"
                            placeholderTextColor={theme.textSecondary}
                            multiline
                        />
                    </View>
                )}
            </ScrollView>

            <FinishOverlay
                visible={showFinishOverlay}
                onDismiss={() => setShowFinishOverlay(false)}
                onConfirm={handleFinishConfirm}
            />

            <SectionCompleteModal
                visible={showSectionCompleteModal}
                onBackToSummary={handleBackToSummary}
            />
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container:    { flex: 1, backgroundColor: theme.background },
        scrollContent: { padding: 20, paddingBottom: 60 },
        centerContent: { justifyContent: 'center', alignItems: 'center' },

        // ── Header ──
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
        sectionLabel: { fontSize: 12, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
        exerciseLabel: { fontSize: 12, color: theme.textTertiary },

        exerciseName: { fontSize: 26, fontWeight: '700', color: theme.textPrimary, marginBottom: 10 },

        pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
        pill: { backgroundColor: theme.surfaceElevated, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
        pillText: { fontSize: 13, color: theme.textSecondary },
        pillOptional: { borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: 'transparent' },
        pillTextOptional: { fontStyle: 'italic', color: theme.textTertiary },

        // ── Coach notes / rec ──
        coachNotes: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.accentSubtle, borderLeftWidth: 2, borderLeftColor: theme.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4, marginBottom: 10 },
        coachNotesText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18, fontStyle: 'italic' },
        recBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 0.5, borderColor: theme.accentText, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
        recText: { fontSize: 13, color: theme.accentText, fontStyle: 'italic' },

        // ── Video ──
        videoToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
        videoToggleText: { fontSize: 13, color: theme.textSecondary },
        videoContainer: { justifyContent: 'center', backgroundColor: theme.background, marginBottom: 12 },
        video: { alignSelf: 'center', width: '100%', height: 220, borderRadius: 8 },
        videoDescriptionContainer: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.surface, borderRadius: 6, marginBottom: 12 },
        videoDescriptionText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },

        // ── Timer ──
        timerModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
        modePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceElevated },
        modePillActive: { borderColor: theme.accentText, backgroundColor: theme.accentSubtle },
        modePillText: { fontSize: 12, color: theme.textSecondary },
        modePillTextActive: { color: theme.accentText, fontWeight: '600' },
        timerContainer: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 28, marginBottom: 16, borderWidth: 1, borderColor: theme.surfaceBorder },
        timerPhaseLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
        timerDisplay: { fontSize: 64, fontWeight: '200', color: theme.textPrimary, fontVariant: ['tabular-nums'] },
        timerBanner: { marginTop: 12, backgroundColor: theme.accentSubtle, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
        timerBannerMax: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.success },
        timerBannerText: { fontSize: 13, color: theme.accentText, textAlign: 'center' },
        timerStartButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, backgroundColor: theme.success, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
        timerStartText: { fontSize: 16, fontWeight: '700', color: '#000' },
        timerAdvanceButton: { marginTop: 12, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
        timerAdvanceText: { fontSize: 14, color: theme.textSecondary },
        upNextContainer: { marginTop: 16, alignItems: 'center' },
        upNextLabel: { fontSize: 10, color: theme.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
        upNextName: { fontSize: 16, color: theme.textPrimary, fontWeight: '500' },

        // ── Set inputs ──
        setInputsCard: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: theme.surfaceBorder },
        unitRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
        unitPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceElevated },
        unitPillActive: { borderColor: theme.accentText, backgroundColor: theme.accentSubtle },
        unitPillText: { fontSize: 11, color: theme.textSecondary, textTransform: 'lowercase' },
        unitPillTextActive: { color: theme.accentText, fontWeight: '600' },
        inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
        inputGroup: { flex: 1, alignItems: 'center' },
        inputLabel: { fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, textAlign: 'center' },
        input: { width: '100%', height: 44, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, backgroundColor: theme.surfaceElevated, color: theme.textPrimary, textAlign: 'center', fontSize: 16 },
        noteInput: { borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, backgroundColor: theme.surfaceElevated, color: theme.textPrimary, padding: 10, fontSize: 14, minHeight: 44 },

        // ── Up Next banner ──
        upNextBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surfaceElevated, borderRadius: 8, marginBottom: 10, borderWidth: 0.5, borderColor: theme.surfaceBorder },
        upNextBannerLabel: { fontSize: 10, fontWeight: '700', color: theme.textTertiary, letterSpacing: 1, textTransform: 'uppercase' },
        upNextBannerText:  { fontSize: 13, color: theme.textSecondary, flex: 1 },

        // ── Actions ──
        actionsRow: { flexDirection: 'row', gap: 12 },
        skipButton: { flex: 1, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
        skipButtonText: { fontSize: 15, color: theme.textSecondary },
        nextButton: { flex: 2, flexDirection: 'row', gap: 8, backgroundColor: theme.success, borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
        nextButtonText: { fontSize: 16, fontWeight: '700', color: '#000' },

        // ── Done ──
        headingText: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
        doneIcon: { marginBottom: 16 },
        doneTitle: { fontSize: 24, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
        doneSubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginHorizontal: 24, marginBottom: 32 },
        doneButton: { backgroundColor: theme.surfaceElevated, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, borderWidth: 1, borderColor: theme.surfaceBorder },
        doneButtonText: { fontSize: 15, color: theme.textPrimary },

        // ── Finish overlay ──
        overlayBackdrop: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 32 },
        overlayCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 28, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: theme.success },
        overlayIcon: { marginBottom: 12 },
        overlayMessage: { fontSize: 22, fontWeight: 'bold', color: theme.textPrimary, textAlign: 'center', marginBottom: 8 },
        overlaySubtext: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 28 },
        overlayActions: { flexDirection: 'row', gap: 12, width: '100%' },
        overlayButtonPrimary: { flex: 1, backgroundColor: theme.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
        overlayButtonPrimaryText: { color: '#000', fontWeight: '700', fontSize: 15 },
        overlayButtonSecondary: { flex: 1, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
        overlayButtonSecondaryText: { color: theme.textSecondary, fontSize: 15 },

        // ── Section complete ──
        sectionCompleteCard: { borderColor: theme.success },
        sectionCompleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.success, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, width: '100%' },
        sectionCompleteButtonText: { fontSize: 15, fontWeight: '700', color: '#000' },

        // ── Side indicator ──
        sidePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.success, backgroundColor: 'rgba(123,181,51,0.1)' },
        sidePillText: { fontSize: 12, color: theme.success, fontWeight: '600' },
    });
}
