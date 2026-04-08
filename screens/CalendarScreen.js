/**
 * CalendarScreen.js
 * Location: screens/CalendarScreen.js
 */

import * as React from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    Modal,
    TextInput,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import TemplatePickerOverlay from '../components/TemplatePickerOverlay';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_SIZE = Math.floor((SCREEN_WIDTH - 32) / 7);
const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function todayInTimezone(tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

function parseISO(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function isBefore(dateStr, referenceStr) {
    return dateStr < referenceStr;
}

function getMonthGrid(year, month) {
    const grid = [];

    // First day of the month (local time)
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Start date = Sunday of the first visible week
    const startDate = new Date(year, month, 1 - startDayOfWeek);

    // Always render 6 weeks (6 × 7 = 42 cells) → standard calendar layout
    for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);

        grid.push({
            dateStr: toISO(d),
            currentMonth: d.getMonth() === month,
        });
    }

    return grid;
}

function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function friendlyDate(dateStr) {
    return parseISO(dateStr).toLocaleDateString('default', {
        weekday: 'long', month: 'long', day: 'numeric',
    });
}

// ─── Workout pill ─────────────────────────────────────────────────────────────

const WorkoutPill = ({ workout, onPress, onLongPress }) => {
    const statusColor = {
        scheduled:  '#fba8a0',
        completed:  '#7bb533',
        skipped:    '#555',
        missed:     '#8B4513',
    }[workout.status] ?? '#fba8a0';

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={400}
            style={[
                styles.pill,
                { backgroundColor: statusColor },
                workout.status === 'skipped' && styles.pillSkipped,
            ]}
        >
            <Text style={styles.pillText} numberOfLines={1}>
                {workout.workoutName}
            </Text>
            {workout.status === 'completed' && (
                <Feather name="check" size={10} color="#fff" />
            )}
            {workout.status === 'skipped' && (
                <Feather name="slash" size={10} color="#aaa" />
            )}
        </Pressable>
    );
};

// ─── Day cell ─────────────────────────────────────────────────────────────────

const DayCell = ({
    dateStr,
    currentMonth,
    workouts,
    isToday,
    isCoach,
    onWorkoutPress,
    onWorkoutLongPress,
    onEmptyDayLongPress,
    dragTargetDate,
    clientTimezone
}) => {
    const isTarget = dragTargetDate === dateStr;
    const isPast = isBefore(dateStr, todayInTimezone(clientTimezone));

    return (
        <Pressable
            style={[
                styles.dayCell,
                !currentMonth && styles.dayCellOtherMonth,
                isTarget && styles.dayCellDropTarget,
            ]}
            onLongPress={() => isCoach && currentMonth && onEmptyDayLongPress(dateStr)}
            delayLongPress={400}
        >
            <Text style={[
                styles.dayNumber,
                isToday && styles.dayNumberToday,
                !currentMonth && styles.dayNumberOtherMonth,
            ]}>
                {parseInt(dateStr.split('-')[2])}
            </Text>
            {workouts.map(w => (
                <WorkoutPill
                    key={w.id}
                    workout={w}
                    onPress={() => onWorkoutPress(w)}
                    onLongPress={() => onWorkoutLongPress(w)}
                />
            ))}
            {/* Faint + hint on empty future days for coaches */}
            {isCoach && workouts.length === 0 && currentMonth && !isPast && (
                <Text style={styles.emptyDayHint}>+</Text>
            )}
        </Pressable>
    );
};

// ─── Workout long-press action sheet ─────────────────────────────────────────

const WorkoutActionSheet = ({ workout, onClose, onSkip, onCopy, onMove }) => {
    const isCompleted = workout?.status === 'completed';
    const canMove = !isCompleted;

    return (
        <Modal transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.sheetOverlay} onPress={onClose}>
                <Pressable style={styles.sheetContainer} onPress={() => {}}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                        {workout?.workoutName}
                    </Text>
                    <Text style={styles.sheetDate}>
                        {workout ? friendlyDate(workout.scheduledDate) : ''}
                    </Text>

                    <Pressable style={styles.sheetAction} onPress={onCopy}>
                        <Feather name="copy" size={20} color="#fba8a0" />
                        <Text style={styles.sheetActionText}>Copy to another day</Text>
                    </Pressable>

                    {canMove && (
                        <Pressable style={styles.sheetAction} onPress={onMove}>
                            <Feather name="calendar" size={20} color="#fba8a0" />
                            <Text style={styles.sheetActionText}>Move to another day</Text>
                        </Pressable>
                    )}

                    {!isCompleted && (
                        <Pressable style={styles.sheetAction} onPress={onSkip}>
                            <Feather name="slash" size={20} color="#888" />
                            <Text style={[styles.sheetActionText, { color: '#888' }]}>
                                Skip this workout
                            </Text>
                        </Pressable>
                    )}

                    {isCompleted && (
                        <View style={styles.sheetCompleted}>
                            <Feather name="check-circle" size={16} color="#7bb533" />
                            <Text style={styles.sheetCompletedText}>
                                Workout completed — cannot be moved or skipped
                            </Text>
                        </View>
                    )}

                    <Pressable style={styles.sheetCancel} onPress={onClose}>
                        <Text style={styles.sheetCancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

// ─── Coach empty-day action sheet ─────────────────────────────────────────────

const AddWorkoutSheet = ({ dateStr, clientName, onClose, onCreateNew, onUseTemplate }) => (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.sheetOverlay} onPress={onClose}>
            <Pressable style={styles.sheetContainer} onPress={() => {}}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Add workout</Text>
                <Text style={styles.sheetDate}>
                    {clientName} · {friendlyDate(dateStr)}
                </Text>

                <Pressable style={styles.sheetAction} onPress={onCreateNew}>
                    <Feather name="plus-circle" size={20} color="#fba8a0" />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Create new workout</Text>
                        <Text style={styles.sheetActionSub}>
                            Opens the workout builder with client & date pre-filled
                        </Text>
                    </View>
                </Pressable>

                <Pressable style={styles.sheetAction} onPress={onUseTemplate}>
                    <Feather name="copy" size={20} color="#fba8a0" />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Use a template</Text>
                        <Text style={styles.sheetActionSub}>
                            Pick from your existing workouts and assign it here
                        </Text>
                    </View>
                </Pressable>

                <Pressable style={styles.sheetCancel} onPress={onClose}>
                    <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
            </Pressable>
        </Pressable>
    </Modal>
);

// ─── Skip modal ───────────────────────────────────────────────────────────────

const SkipModal = ({ workout, onClose, onConfirm }) => {
    const [reason, setReason] = React.useState('');
    return (
        <Modal transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Skip workout?</Text>
                    <Text style={styles.modalSubtitle}>{workout?.workoutName}</Text>
                    <TextInput
                        style={styles.modalInput}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Why are you skipping? (optional)"
                        placeholderTextColor="#888"
                        multiline
                        autoFocus
                    />
                    <View style={styles.modalActions}>
                        <Pressable style={styles.modalButtonSecondary} onPress={onClose}>
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={styles.modalButtonPrimary}
                            onPress={() => onConfirm(reason)}
                        >
                            <Text style={styles.modalButtonPrimaryText}>Skip</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Date picker modal (copy / move destination) ──────────────────────────────

const DatePickerModal = ({ title, minDate, clientTimezone, onClose, onConfirm }) => {
    const now = new Date();
    const [year, setYear] = React.useState(now.getFullYear());
    const [month, setMonth] = React.useState(now.getMonth());
    const [selected, setSelected] = React.useState(null);
    const grid = getMonthGrid(year, month);
    const todayStr = todayInTimezone(clientTimezone);

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
        setSelected(null);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
        setSelected(null);
    };

    return (
        <Modal transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    <View style={styles.miniCalHeader}>
                        <Pressable onPress={prevMonth}>
                            <Feather name="chevron-left" size={20} color="#fae9e9" />
                        </Pressable>
                        <Text style={styles.miniCalMonthLabel}>{monthLabel(year, month)}</Text>
                        <Pressable onPress={nextMonth}>
                            <Feather name="chevron-right" size={20} color="#fae9e9" />
                        </Pressable>
                    </View>
                    <View style={styles.miniCalGrid}>
                        {DAYS_OF_WEEK.map(d => (
                            <Text key={d} style={styles.miniCalDayLabel}>{d}</Text>
                        ))}
                        {grid.map(({ dateStr, currentMonth }) => {
                            const disabled = minDate ? isBefore(dateStr, minDate) : false;
                            const isSelected = selected === dateStr;
                            return (
                                <Pressable
                                    key={dateStr}
                                    style={[
                                        styles.miniCalCell,
                                        !currentMonth && styles.miniCalCellOtherMonth,
                                        isSelected && styles.miniCalCellSelected,
                                        disabled && styles.miniCalCellDisabled,
                                    ]}
                                    onPress={() => !disabled && setSelected(dateStr)}
                                    disabled={disabled}
                                >
                                    <Text style={[
                                        styles.miniCalCellText,
                                        dateStr === todayStr && styles.miniCalCellToday,
                                        isSelected && styles.miniCalCellSelectedText,
                                        disabled && styles.miniCalCellDisabledText,
                                        !currentMonth && styles.miniCalCellOtherMonthText,
                                    ]}>
                                        {parseInt(dateStr.split('-')[2])}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <View style={styles.modalActions}>
                        <Pressable style={styles.modalButtonSecondary} onPress={onClose}>
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.modalButtonPrimary, !selected && styles.modalButtonDisabled]}
                            onPress={() => selected && onConfirm(selected)}
                            disabled={!selected}
                        >
                            <Text style={styles.modalButtonPrimaryText}>Confirm</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Main CalendarScreen ──────────────────────────────────────────────────────

export default function CalendarScreen({ navigation, route }) {
    const { user, authFetch } = useAuth();
    const isCoach = user?.isCoach ?? false;

    // When a coach opens this from a client view, these params come in via route
    const clientEmail = route?.params?.clientEmail ?? user?.email;
    const clientName  = route?.params?.clientName ?? `${user?.fname ?? ''} ${user?.lname ?? ''}`.trim();

    // ── CLIENT TIMEZONE ──
    const clientTimezone = route?.params?.clientTimezone ?? 'UTC';
    const now = new Date();
    const [year, setYear]       = React.useState(now.getFullYear());
    const [month, setMonth]     = React.useState(now.getMonth());
    const [workouts, setWorkouts] = React.useState([]);
    const [loading, setLoading]   = React.useState(true);
    const [saving, setSaving]     = React.useState(false);

    // Workout action state
    const [actionWorkout, setActionWorkout] = React.useState(null);
    const [skipWorkout,   setSkipWorkout]   = React.useState(null);
    const [copyWorkout,   setCopyWorkout]   = React.useState(null);
    const [moveWorkout,   setMoveWorkout]   = React.useState(null);

    // Coach add-workout state
    // addDayTarget holds the dateStr that was long-pressed so we can pass it
    // through to the AddWorkoutSheet and then on to CreateWorkout / TemplatePicker
    const [addDayTarget,       setAddDayTarget]       = React.useState(null);
    const [showTemplatePicker, setShowTemplatePicker] = React.useState(false);

    const todayStr = todayInTimezone(clientTimezone);
    const grid = getMonthGrid(year, month);

    // ── Fetch ───────────────────────────────────────────────────────────────

    const fetchSchedule = React.useCallback(async () => {
        setLoading(true);
        try {
            const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
            const res = await authFetch(
                `https://coaching-app.bert-m-cherry.workers.dev/schedule?clientEmail=${encodeURIComponent(clientEmail)}&month=${monthStr}&tz=${encodeURIComponent(clientTimezone)}`
            );
            const body = await res.json();
            setWorkouts(body.workouts ?? []);
        } catch (e) {
            Alert.alert('Error', 'Could not load schedule.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [year, month, clientEmail]);

    React.useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

    // Navigate to the month passed in via route params (e.g. from CreateWorkout save)
    React.useEffect(() => {
        if (route?.params?.month) {
            const [y, m] = route.params.month.split('-').map(Number);
            setYear(y);
            setMonth(m - 1);
        }
    }, [route?.params?.month]);

    // ── Month navigation ────────────────────────────────────────────────────

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // ── Workout map ─────────────────────────────────────────────────────────

    const workoutsByDate = React.useMemo(() => {
        const map = {};
        for (const w of workouts) {
            if (!map[w.scheduledDate]) map[w.scheduledDate] = [];
            map[w.scheduledDate].push(w);
        }
        return map;
    }, [workouts]);

    // ── Optimistic helpers ──────────────────────────────────────────────────

    const updateWorkout = (id, changes) =>
        setWorkouts(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));

    const addWorkout = (workout) =>
        setWorkouts(prev => [...prev, workout]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleWorkoutPress = (workout) => {
        navigation.navigate('Workout Preview', {
            id: workout.workoutId,
            scheduledWorkoutId: workout.id,
        });
    };

    const handleWorkoutLongPress = (workout) => setActionWorkout(workout);

    const handleEmptyDayLongPress = (dateStr) => setAddDayTarget(dateStr);

    const handleCreateNew = () => {
        const date = addDayTarget;
        setAddDayTarget(null);
        navigation.navigate('Create Workout', {
            clientEmail,
            clientName,
            scheduledDate: date,
        });
    };

    const handleUseTemplate = () => {
        // Keep addDayTarget alive so TemplatePickerOverlay can pass it along
        setAddDayTarget(prev => prev); // no-op to keep value
        setShowTemplatePicker(true);
    };

    const handleSkipConfirm = async (reason) => {
        const workout = skipWorkout;
        setSkipWorkout(null);
        setActionWorkout(null);
        updateWorkout(workout.id, { status: 'skipped', skipReason: reason });
        setSaving(true);
        try {
            const res = await authFetch(
                'https://coaching-app.bert-m-cherry.workers.dev/schedule/skip',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: workout.id, reason }),
                }
            );
            if (!res.ok) throw new Error();
        } catch {
            updateWorkout(workout.id, { status: workout.status, skipReason: workout.skipReason });
            Alert.alert('Error', 'Could not skip workout. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleCopyConfirm = async (newDate) => {
        const workout = copyWorkout;
        setCopyWorkout(null);
        setActionWorkout(null);
        setSaving(true);
        try {
            const res = await authFetch(
                'https://coaching-app.bert-m-cherry.workers.dev/schedule/copy',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: workout.id, newDate }),
                }
            );
            if (!res.ok) throw new Error();
            const body = await res.json();
            addWorkout({
                ...workout,
                id: body.newId,
                scheduledDate: newDate,
                status: 'scheduled',
                skipReason: null,
                completedAt: null,
                originalDate: null,
                copiedFrom: workout.id,
            });
        } catch {
            Alert.alert('Error', 'Could not copy workout. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleMoveConfirm = async (newDate) => {
        const workout = moveWorkout;
        setMoveWorkout(null);
        setActionWorkout(null);
        const oldDate = workout.scheduledDate;
        updateWorkout(workout.id, {
            scheduledDate: newDate,
            originalDate: workout.originalDate ?? oldDate,
            status: (workout.status === 'skipped' || workout.status === 'missed')
                ? 'scheduled' : workout.status,
        });
        setSaving(true);
        try {
            const res = await authFetch(
                'https://coaching-app.bert-m-cherry.workers.dev/schedule/move',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: workout.id, newDate, today: todayInTimezone(clientTimezone) }),
                }
            );
            if (!res.ok) throw new Error();
        } catch {
            updateWorkout(workout.id, {
                scheduledDate: oldDate,
                originalDate: workout.originalDate,
                status: workout.status,
            });
            Alert.alert('Error', 'Could not move workout. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={prevMonth} style={styles.headerButton}>
                    <Feather name="chevron-left" size={24} color="#fae9e9" />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{monthLabel(year, month)}</Text>
                    {isCoach && clientName && (
                        <Text style={styles.headerClient}>{clientName}</Text>
                    )}
                </View>
                <Pressable onPress={nextMonth} style={styles.headerButton}>
                    <Feather name="chevron-right" size={24} color="#fae9e9" />
                </Pressable>
            </View>

            {/* Day labels */}
            <View style={styles.dowRow}>
                {DAYS_OF_WEEK.map(d => (
                    <Text key={d} style={styles.dowLabel}>{d}</Text>
                ))}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fba8a0" />
                </View>
            ) : (
                <ScrollView>
                    <View style={styles.grid}>
                        {grid.map(({ dateStr, currentMonth }) => (
                            <DayCell
                                key={dateStr}
                                dateStr={dateStr}
                                currentMonth={currentMonth}
                                workouts={workoutsByDate[dateStr] ?? []}
                                isToday={dateStr === todayStr}
                                isCoach={isCoach}
                                onWorkoutPress={handleWorkoutPress}
                                onWorkoutLongPress={handleWorkoutLongPress}
                                onEmptyDayLongPress={handleEmptyDayLongPress}
                                dragTargetDate={null}
                                clientTimezone={clientTimezone}
                            />
                        ))}
                    </View>

                    {/* Legend */}
                    <View style={styles.legend}>
                        {[
                            { color: '#fba8a0', label: 'Scheduled' },
                            { color: '#7bb533', label: 'Completed' },
                            { color: '#555',    label: 'Skipped'   },
                            { color: '#8B4513', label: 'Missed'    },
                        ].map(({ color, label }) => (
                            <View key={label} style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: color }]} />
                                <Text style={styles.legendText}>{label}</Text>
                            </View>
                        ))}
                    </View>

                    {isCoach && (
                        <Text style={styles.coachHint}>
                            Long-press any empty day to add a workout
                        </Text>
                    )}
                </ScrollView>
            )}

            {saving && (
                <View style={styles.savingBanner}>
                    <ActivityIndicator size="small" color="#000" />
                    <Text style={styles.savingText}>Saving...</Text>
                </View>
            )}

            {/* Existing workout long-press sheet */}
            {actionWorkout && (
                <WorkoutActionSheet
                    workout={actionWorkout}
                    onClose={() => setActionWorkout(null)}
                    onSkip={() => setSkipWorkout(actionWorkout)}
                    onCopy={() => setCopyWorkout(actionWorkout)}
                    onMove={() => setMoveWorkout(actionWorkout)}
                />
            )}

            {/* Coach empty-day sheet */}
            {addDayTarget && !showTemplatePicker && (
                <AddWorkoutSheet
                    dateStr={addDayTarget}
                    clientName={clientName}
                    onClose={() => setAddDayTarget(null)}
                    onCreateNew={handleCreateNew}
                    onUseTemplate={handleUseTemplate}
                />
            )}

            {/* Skip */}
            {skipWorkout && (
                <SkipModal
                    workout={skipWorkout}
                    onClose={() => setSkipWorkout(null)}
                    onConfirm={handleSkipConfirm}
                />
            )}

            {/* Copy date picker */}
            {copyWorkout && (
                <DatePickerModal
                    title="Copy workout to..."
                    minDate={null}
                    clientTimezone={clientTimezone}
                    onClose={() => setCopyWorkout(null)}
                    onConfirm={handleCopyConfirm}
                />
            )}

            {/* Move date picker */}
            {moveWorkout && (
                <DatePickerModal
                    title="Move workout to..."
                    minDate={todayStr}
                    onClose={() => setMoveWorkout(null)}
                    onConfirm={handleMoveConfirm}
                />
            )}

            {/* Template picker — note: rendered always so it can animate in/out */}
            <TemplatePickerOverlay
                visible={showTemplatePicker}
                onClose={() => {
                    setShowTemplatePicker(false);
                    setAddDayTarget(null);
                }}
                clientEmail={clientEmail}
                clientName={clientName}
                scheduledDate={addDayTarget}
                navigation={navigation}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:       { flex: 1, backgroundColor: 'black' },
    header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    headerButton:    { padding: 8 },
    headerCenter:    { alignItems: 'center' },
    headerTitle:     { fontSize: 20, fontWeight: 'bold', color: '#fae9e9' },
    headerClient:    { fontSize: 13, color: '#fba8a0', marginTop: 2 },
    dowRow:          { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
    dowLabel:        { width: DAY_CELL_SIZE, textAlign: 'center', color: '#888', fontSize: 12, fontWeight: '600' },
    grid:            { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
    dayCell:         { width: DAY_CELL_SIZE, minHeight: DAY_CELL_SIZE, paddingBottom: 4, borderTopWidth: 0.5, borderTopColor: '#333' },
    dayCellOtherMonth:  { opacity: 0.35 },
    dayCellDropTarget:  { backgroundColor: '#1a1a1a', borderRadius: 4 },
    dayNumber:          { fontSize: 12, color: '#fae9e9', padding: 3, textAlign: 'center' },
    dayNumberToday:     { color: '#fba8a0', fontWeight: 'bold' },
    dayNumberOtherMonth:{ color: '#555' },
    emptyDayHint:       { textAlign: 'center', color: '#2a2a2a', fontSize: 14 },
    pill:            { flexDirection: 'row', alignItems: 'center', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, marginHorizontal: 1, marginBottom: 2, gap: 2 },
    pillSkipped:     { opacity: 0.5 },
    pillText:        { fontSize: 9, color: '#000', fontWeight: '600', flex: 1 },
    loadingContainer:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
    legend:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    legendItem:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot:       { width: 8, height: 8, borderRadius: 4 },
    legendText:      { fontSize: 11, color: '#888' },
    coachHint:       { textAlign: 'center', fontSize: 11, color: '#333', paddingBottom: 16 },
    savingBanner:    { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: '#fba8a0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
    savingText:      { color: '#000', fontWeight: '600' },

    sheetOverlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheetContainer:     { backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40, paddingHorizontal: 24, paddingTop: 12 },
    sheetHandle:        { width: 36, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:         { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 4 },
    sheetDate:          { fontSize: 13, color: '#888', marginBottom: 20 },
    sheetAction:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#222' },
    sheetActionTextBlock: { flex: 1 },
    sheetActionText:    { fontSize: 16, color: '#fae9e9' },
    sheetActionSub:     { fontSize: 12, color: '#555', marginTop: 2 },
    sheetCompleted:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    sheetCompletedText: { fontSize: 13, color: '#7bb533', flex: 1 },
    sheetCancel:        { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
    sheetCancelText:    { fontSize: 16, color: '#888' },

    modalOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard:              { backgroundColor: '#111', borderRadius: 12, padding: 24, width: '100%' },
    modalTitle:             { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 4 },
    modalSubtitle:          { fontSize: 14, color: '#888', marginBottom: 16 },
    modalInput:             { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#fba8a0', borderRadius: 8, padding: 12, color: '#fae9e9', fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
    modalActions:           { flexDirection: 'row', gap: 12 },
    modalButtonPrimary:     { flex: 1, backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonPrimaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
    modalButtonSecondary:   { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalButtonSecondaryText:{ color: '#888', fontSize: 16 },
    modalButtonDisabled:    { opacity: 0.4 },

    miniCalHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    miniCalMonthLabel:      { color: '#fae9e9', fontWeight: '600', fontSize: 15 },
    miniCalGrid:            { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
    miniCalDayLabel:        { width: `${100 / 7}%`, textAlign: 'center', color: '#555', fontSize: 11, marginBottom: 4 },
    miniCalCell:            { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 100 },
    miniCalCellOtherMonth:  { opacity: 0.25 },
    miniCalCellSelected:    { backgroundColor: '#fba8a0' },
    miniCalCellDisabled:    { opacity: 0.2 },
    miniCalCellText:        { color: '#fae9e9', fontSize: 13 },
    miniCalCellToday:       { color: '#fba8a0', fontWeight: 'bold' },
    miniCalCellSelectedText:{ color: '#000', fontWeight: 'bold' },
    miniCalCellDisabledText:{ color: '#444' },
    miniCalCellOtherMonthText:{ color: '#555' },
});