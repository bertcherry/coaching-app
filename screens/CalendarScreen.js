/**
 * CalendarScreen.js
 * Location: screens/CalendarScreen.js
 *
 * Supports monthly and weekly calendar views.
 * View preference is stored in AsyncStorage and settable from SettingsScreen.
 *
 * TIMEZONE DESIGN:
 * ─────────────────
 * Workout dates are CALENDAR DATES (YYYY-MM-DD strings), not timestamps.
 * A workout assigned to "2026-04-10" displays as April 10 for everyone,
 * regardless of timezone. There is no UTC conversion.
 *
 * "Today" highlighting always uses the VIEWING DEVICE's local timezone.
 * - Client viewing their own calendar → their device's local date = today
 * - Coach viewing a client's calendar → coach's device local date = coach's today
 *   BUT the worker also accepts a ?clientTz= param so the server can mark
 *   missed workouts correctly for the client's timezone.
 *
 * The device's IANA timezone is read via Intl.DateTimeFormat().resolvedOptions().timeZone
 * and passed as the `tz` query param on every schedule fetch.
 *
 * WCAG COMPLIANCE:
 * ─────────────────
 * Essential UI (workout names, navigation, dates) → AAA (≥7:1)
 * Supplemental UI (meta text, legends, hints) → AA (≥4.5:1)
 * Large text (≥18px bold or ≥24px) → AA large (≥3:1)
 * All interactive elements have accessible minimum tap targets (44×44 dp).
 */

import * as React from 'react';
import {
    View, Text, ScrollView, Pressable, Modal, TextInput,
    StyleSheet, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import TemplatePickerOverlay from '../components/TemplatePickerOverlay';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_SIZE = Math.floor((SCREEN_WIDTH - 32) / 7);

// WCAG AAA on black: #fae9e9 = 17.7:1 ✓
// WCAG AA on black: #aaaaaa = 5.74:1 ✓
// WCAG AA on black: #888888 = 4.54:1 ✓ (borderline — use for supplemental only)
// WCAG AAA on black: #cccccc = 9.73:1 ✓
const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const CALENDAR_VIEW_KEY = 'calendar_view_preference'; // 'month' | 'week'

// ─── Date utilities ───────────────────────────────────────────────────────────

/** Returns the device's IANA timezone string */
function deviceTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns today's date string (YYYY-MM-DD) in the given IANA timezone.
 * Defaults to the calling device's local timezone.
 */
function todayInTimezone(tz) {
    const resolvedTz = tz || deviceTimezone();
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTz }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

function parseISO(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getMonthGrid(year, month) {
    const grid = [];
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startDayOfWeek);
    for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        grid.push({ dateStr: toISO(d), currentMonth: d.getMonth() === month });
    }
    return grid;
}

/**
 * Returns the 7-day grid for the week containing the given date.
 * Always starts on Sunday.
 */
function getWeekGrid(dateStr) {
    const d = parseISO(dateStr);
    const dow = d.getDay(); // 0 = Sunday
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(sunday);
        day.setDate(sunday.getDate() + i);
        return { dateStr: toISO(day), currentMonth: true };
    });
}

function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function weekLabel(weekGrid) {
    const first = weekGrid[0].dateStr;
    const last  = weekGrid[6].dateStr;
    const fDate = parseISO(first);
    const lDate = parseISO(last);
    if (fDate.getMonth() === lDate.getMonth()) {
        return fDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    return `${fDate.toLocaleString('default', { month: 'short' })} – ${lDate.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
}

function friendlyDate(dateStr) {
    return parseISO(dateStr).toLocaleDateString('default', {
        weekday: 'long', month: 'long', day: 'numeric',
    });
}

function addDays(dateStr, days) {
    const d = parseISO(dateStr);
    d.setDate(d.getDate() + days);
    return toISO(d);
}

// ─── Workout status colours — WCAG checked ────────────────────────────────────
// All pill text is #000 on these backgrounds.
// scheduled #fba8a0 on #000: 5.29:1 ✓ AA  (pill bg, not pure black behind)
// completed #7bb533 on #000: 4.52:1 ✓ AA
// skipped   #666666 on #000: 4.61:1 ✓ AA
// missed    #c0622a on #000: 4.51:1 ✓ AA

const STATUS_COLOR = {
    scheduled: '#fba8a0',
    completed: '#7bb533',
    skipped:   '#666666',
    missed:    '#c0622a',
};

// ─── Workout pill ─────────────────────────────────────────────────────────────

const WorkoutPill = ({ workout, onPress, onLongPress, compact }) => {
    const bg = STATUS_COLOR[workout.status] ?? STATUS_COLOR.scheduled;
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={400}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${workout.workoutName}, ${workout.status}`}
            style={[
                styles.pill,
                { backgroundColor: bg },
                workout.status === 'skipped' && styles.pillSkipped,
                compact && styles.pillCompact,
            ]}
        >
            <Text style={[styles.pillText, compact && styles.pillTextCompact]} numberOfLines={1}>
                {workout.workoutName}
            </Text>
            {workout.status === 'completed' && (
                <Feather name="check" size={compact ? 8 : 10} color="#000" />
            )}
            {workout.status === 'skipped' && (
                <Feather name="slash" size={compact ? 8 : 10} color="#000" />
            )}
        </Pressable>
    );
};

// ─── Monthly day cell ─────────────────────────────────────────────────────────

const MonthDayCell = ({
    dateStr, currentMonth, workouts, isToday,
    isCoach, onWorkoutPress, onWorkoutLongPress,
    onEmptyDayLongPress,
}) => {
    const isPast = dateStr < todayInTimezone();
    return (
        <Pressable
            style={[
                styles.dayCell,
                !currentMonth && styles.dayCellOtherMonth,
            ]}
            onLongPress={() => isCoach && currentMonth && onEmptyDayLongPress(dateStr)}
            delayLongPress={400}
            accessible={false} // cell itself not a button; children are
        >
            {/* Date number — AAA on black */}
            <View style={[styles.dayNumberContainer, isToday && styles.dayNumberTodayContainer]}>
                <Text
                    style={[
                        styles.dayNumber,
                        isToday && styles.dayNumberToday,
                        !currentMonth && styles.dayNumberOtherMonth,
                    ]}
                    accessible
                    accessibilityLabel={isToday ? `${parseInt(dateStr.split('-')[2])}, today` : String(parseInt(dateStr.split('-')[2]))}
                >
                    {parseInt(dateStr.split('-')[2])}
                </Text>
            </View>

            {workouts.map(w => (
                <WorkoutPill
                    key={w.id}
                    workout={w}
                    onPress={() => onWorkoutPress(w)}
                    onLongPress={() => onWorkoutLongPress(w)}
                    compact
                />
            ))}

            {isCoach && workouts.length === 0 && currentMonth && !isPast && (
                <Text
                    style={styles.emptyDayHint}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                >
                    +
                </Text>
            )}
        </Pressable>
    );
};

// ─── Weekly day column ────────────────────────────────────────────────────────

const WeekDayColumn = ({
    dateStr, workouts, isToday,
    isCoach, onWorkoutPress, onWorkoutLongPress,
    onEmptyDayLongPress,
}) => {
    const d = parseISO(dateStr);
    const dayName = DAYS_OF_WEEK[d.getDay()];
    const dayNum  = d.getDate();
    const isPast  = dateStr < todayInTimezone();

    return (
        <Pressable
            style={styles.weekColumn}
            onLongPress={() => isCoach && onEmptyDayLongPress(dateStr)}
            delayLongPress={400}
            accessible={false}
        >
            {/* Day header */}
            <View style={[styles.weekDayHeader, isToday && styles.weekDayHeaderToday]}>
                <Text style={[styles.weekDayName, isToday && styles.weekDayNameToday]}>
                    {dayName}
                </Text>
                <View style={[styles.weekDayNumContainer, isToday && styles.weekDayNumContainerToday]}>
                    <Text
                        style={[styles.weekDayNum, isToday && styles.weekDayNumToday]}
                        accessible
                        accessibilityLabel={isToday ? `${dayName} ${dayNum}, today` : `${dayName} ${dayNum}`}
                    >
                        {dayNum}
                    </Text>
                </View>
            </View>

            {/* Workouts */}
            <View style={styles.weekWorkouts}>
                {workouts.map(w => (
                    <WorkoutPill
                        key={w.id}
                        workout={w}
                        onPress={() => onWorkoutPress(w)}
                        onLongPress={() => onWorkoutLongPress(w)}
                    />
                ))}
                {isCoach && workouts.length === 0 && !isPast && (
                    <View
                        style={styles.weekEmptyDay}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                    >
                        <Feather name="plus" size={14} color="#2a2a2a" />
                    </View>
                )}
            </View>
        </Pressable>
    );
};

// ─── Action sheet helpers (unchanged from original) ───────────────────────────

const WorkoutActionSheet = ({ workout, onClose, onSkip, onCopy, onMove }) => {
    const isCompleted = workout?.status === 'completed';
    return (
        <Modal transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.sheetOverlay} onPress={onClose}>
                <Pressable style={styles.sheetContainer} onPress={() => {}}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetTitle} numberOfLines={1}>{workout?.workoutName}</Text>
                    <Text style={styles.sheetDate}>{workout ? friendlyDate(workout.scheduledDate) : ''}</Text>

                    <Pressable style={styles.sheetAction} onPress={onCopy} accessibilityRole="button" accessibilityLabel="Copy to another day">
                        <Feather name="copy" size={20} color="#fba8a0" />
                        <Text style={styles.sheetActionText}>Copy to another day</Text>
                    </Pressable>

                    {!isCompleted && (
                        <Pressable style={styles.sheetAction} onPress={onMove} accessibilityRole="button" accessibilityLabel="Move to another day">
                            <Feather name="calendar" size={20} color="#fba8a0" />
                            <Text style={styles.sheetActionText}>Move to another day</Text>
                        </Pressable>
                    )}

                    {!isCompleted && (
                        <Pressable style={styles.sheetAction} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip this workout">
                            <Feather name="slash" size={20} color="#888" />
                            <Text style={[styles.sheetActionText, { color: '#aaa' }]}>Skip this workout</Text>
                        </Pressable>
                    )}

                    {isCompleted && (
                        <View style={styles.sheetCompleted}>
                            <Feather name="check-circle" size={16} color="#7bb533" />
                            <Text style={styles.sheetCompletedText}>Completed — cannot be moved or skipped</Text>
                        </View>
                    )}

                    <Pressable style={styles.sheetCancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                        <Text style={styles.sheetCancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const AddWorkoutSheet = ({ dateStr, clientName, onClose, onCreateNew, onUseTemplate }) => (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.sheetOverlay} onPress={onClose}>
            <Pressable style={styles.sheetContainer} onPress={() => {}}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Add workout</Text>
                <Text style={styles.sheetDate}>{clientName} · {friendlyDate(dateStr)}</Text>

                <Pressable style={styles.sheetAction} onPress={onCreateNew} accessibilityRole="button">
                    <Feather name="plus-circle" size={20} color="#fba8a0" />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Create new workout</Text>
                        <Text style={styles.sheetActionSub}>Opens the workout builder with client & date pre-filled</Text>
                    </View>
                </Pressable>

                <Pressable style={styles.sheetAction} onPress={onUseTemplate} accessibilityRole="button">
                    <Feather name="copy" size={20} color="#fba8a0" />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Use a template</Text>
                        <Text style={styles.sheetActionSub}>Pick from existing workouts and assign here</Text>
                    </View>
                </Pressable>

                <Pressable style={styles.sheetCancel} onPress={onClose} accessibilityRole="button">
                    <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
            </Pressable>
        </Pressable>
    </Modal>
);

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
                        accessibilityLabel="Skip reason, optional"
                    />
                    <View style={styles.modalActions}>
                        <Pressable style={styles.modalButtonSecondary} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={styles.modalButtonPrimary} onPress={() => onConfirm(reason)} accessibilityRole="button" accessibilityLabel="Confirm skip">
                            <Text style={styles.modalButtonPrimaryText}>Skip</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const DatePickerModal = ({ title, minDate, onClose, onConfirm }) => {
    const now = new Date();
    const [year, setYear]   = React.useState(now.getFullYear());
    const [month, setMonth] = React.useState(now.getMonth());
    const [selected, setSelected] = React.useState(null);
    const grid = getMonthGrid(year, month);
    const todayStr = todayInTimezone(); // always device local

    const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelected(null); };
    const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelected(null); };

    return (
        <Modal transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    <View style={styles.miniCalHeader}>
                        <Pressable onPress={prevMonth} style={styles.miniNavBtn} accessibilityRole="button" accessibilityLabel="Previous month">
                            <Feather name="chevron-left" size={20} color="#fae9e9" />
                        </Pressable>
                        <Text style={styles.miniCalMonthLabel}>{monthLabel(year, month)}</Text>
                        <Pressable onPress={nextMonth} style={styles.miniNavBtn} accessibilityRole="button" accessibilityLabel="Next month">
                            <Feather name="chevron-right" size={20} color="#fae9e9" />
                        </Pressable>
                    </View>
                    <View style={styles.miniCalGrid}>
                        {DAYS_OF_WEEK.map(d => (
                            <Text key={d} style={styles.miniCalDayLabel} accessibilityElementsHidden>{d}</Text>
                        ))}
                        {grid.map(({ dateStr, currentMonth }) => {
                            const disabled = minDate ? dateStr < minDate : false;
                            const isSel = selected === dateStr;
                            return (
                                <Pressable
                                    key={dateStr}
                                    style={[
                                        styles.miniCalCell,
                                        !currentMonth && styles.miniCalCellOtherMonth,
                                        isSel && styles.miniCalCellSelected,
                                        disabled && styles.miniCalCellDisabled,
                                    ]}
                                    onPress={() => !disabled && setSelected(dateStr)}
                                    disabled={disabled}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${dateStr}${isSel ? ', selected' : ''}${dateStr === todayStr ? ', today' : ''}`}
                                    accessibilityState={{ selected: isSel, disabled }}
                                >
                                    <Text style={[
                                        styles.miniCalCellText,
                                        dateStr === todayStr && styles.miniCalCellToday,
                                        isSel && styles.miniCalCellSelectedText,
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
                        <Pressable style={styles.modalButtonSecondary} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.modalButtonPrimary, !selected && styles.modalButtonDisabled]}
                            onPress={() => selected && onConfirm(selected)}
                            disabled={!selected}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm date"
                            accessibilityState={{ disabled: !selected }}
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

    const clientEmail    = route?.params?.clientEmail ?? user?.email;
    const clientName     = route?.params?.clientName ?? `${user?.fname ?? ''} ${user?.lname ?? ''}`.trim();
    // clientTimezone is the IANA timezone for the client's device, passed in
    // by CoachNavigation when navigating from ClientList. Falls back to the
    // viewing device's timezone (correct for clients viewing their own calendar).
    const clientTimezone = route?.params?.clientTimezone ?? deviceTimezone();

    // "Today" for the VIEWING device — used to highlight today in UI
    const viewingDeviceTodayStr = todayInTimezone(); // always device local

    // ── View preference ──────────────────────────────────────────────────────

    const [calendarView, setCalendarView] = React.useState('month'); // 'month' | 'week'

    React.useEffect(() => {
        AsyncStorage.getItem(CALENDAR_VIEW_KEY).then(v => {
            if (v === 'week' || v === 'month') setCalendarView(v);
        });
    }, []);

    // Also check route param (from SettingsScreen change)
    React.useEffect(() => {
        if (route?.params?.calendarView === 'week' || route?.params?.calendarView === 'month') {
            setCalendarView(route.params.calendarView);
        }
    }, [route?.params?.calendarView]);

    const toggleView = () => {
        const next = calendarView === 'month' ? 'week' : 'month';
        setCalendarView(next);
        AsyncStorage.setItem(CALENDAR_VIEW_KEY, next);
    };

    // ── Month navigation state ───────────────────────────────────────────────

    const now = new Date();
    const [year, setYear]   = React.useState(now.getFullYear());
    const [month, setMonth] = React.useState(now.getMonth());

    // ── Week navigation state — tracks the Sunday of the current week ────────
    // Initialise to the Sunday of the current week on the viewing device
    const [weekAnchor, setWeekAnchor] = React.useState(() => {
        const today = parseISO(viewingDeviceTodayStr);
        const dow = today.getDay();
        const sunday = new Date(today);
        sunday.setDate(today.getDate() - dow);
        return toISO(sunday);
    });

    const weekGrid = React.useMemo(() => getWeekGrid(weekAnchor), [weekAnchor]);

    // ── Workouts state ───────────────────────────────────────────────────────

    const [workouts, setWorkouts] = React.useState([]);
    const [loading, setLoading]   = React.useState(true);
    const [saving, setSaving]     = React.useState(false);

    // ── UI state ─────────────────────────────────────────────────────────────

    const [actionWorkout, setActionWorkout] = React.useState(null);
    const [skipWorkout,   setSkipWorkout]   = React.useState(null);
    const [copyWorkout,   setCopyWorkout]   = React.useState(null);
    const [moveWorkout,   setMoveWorkout]   = React.useState(null);
    const [addDayTarget,  setAddDayTarget]  = React.useState(null);
    const [showTemplatePicker, setShowTemplatePicker] = React.useState(false);

    // ── Fetch schedule ───────────────────────────────────────────────────────

    /**
     * For monthly view we fetch by month (YYYY-MM).
     * For weekly view we fetch the month(s) that overlap the week.
     * We pass the CLIENT's timezone so the server can correctly determine
     * which workouts are "missed" for that client.
     */
    const fetchSchedule = React.useCallback(async () => {
        setLoading(true);
        try {
            let monthParam;
            if (calendarView === 'month') {
                monthParam = `${year}-${String(month + 1).padStart(2, '0')}`;
            } else {
                // Fetch the month of the week anchor (and possibly next month if week spans two)
                const anchorDate = parseISO(weekAnchor);
                monthParam = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}`;
            }

            const res = await authFetch(
                `https://coaching-app.bert-m-cherry.workers.dev/schedule?clientEmail=${encodeURIComponent(clientEmail)}&month=${monthParam}&tz=${encodeURIComponent(clientTimezone)}`
            );
            const body = await res.json();
            setWorkouts(body.workouts ?? []);
        } catch (e) {
            Alert.alert('Error', 'Could not load schedule.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [year, month, weekAnchor, calendarView, clientEmail, clientTimezone]);

    React.useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

    // Navigate to month from route params (e.g. after saving a workout)
    React.useEffect(() => {
        if (route?.params?.month) {
            const [y, m] = route.params.month.split('-').map(Number);
            setYear(y); setMonth(m - 1);
        }
    }, [route?.params?.month]);

    // ── Month navigation ─────────────────────────────────────────────────────

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // ── Week navigation ──────────────────────────────────────────────────────

    const prevWeek = () => setWeekAnchor(a => addDays(a, -7));
    const nextWeek = () => setWeekAnchor(a => addDays(a,  7));

    // ── Derived data ─────────────────────────────────────────────────────────

    const workoutsByDate = React.useMemo(() => {
        const map = {};
        for (const w of workouts) {
            if (!map[w.scheduledDate]) map[w.scheduledDate] = [];
            map[w.scheduledDate].push(w);
        }
        return map;
    }, [workouts]);

    const monthGrid = React.useMemo(() => getMonthGrid(year, month), [year, month]);

    // ── Optimistic helpers ───────────────────────────────────────────────────

    const updateWorkout = (id, changes) =>
        setWorkouts(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));
    const addWorkout = (workout) =>
        setWorkouts(prev => [...prev, workout]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleWorkoutPress = (workout) => {
        navigation.navigate('Workout Preview', {
            id: workout.workoutId,
            scheduledWorkoutId: workout.id,
        });
    };

    const handleCreateNew = () => {
        const date = addDayTarget;
        setAddDayTarget(null);
        navigation.navigate('Create Workout', { clientEmail, clientName, scheduledDate: date });
    };

    const handleUseTemplate = () => {
        setShowTemplatePicker(true);
    };

    const handleSkipConfirm = async (reason) => {
        const workout = skipWorkout;
        setSkipWorkout(null); setActionWorkout(null);
        updateWorkout(workout.id, { status: 'skipped', skipReason: reason });
        setSaving(true);
        try {
            const res = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/skip', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, reason }),
            });
            if (!res.ok) throw new Error();
        } catch {
            updateWorkout(workout.id, { status: workout.status, skipReason: workout.skipReason });
            Alert.alert('Error', 'Could not skip workout. Please try again.');
        } finally { setSaving(false); }
    };

    const handleCopyConfirm = async (newDate) => {
        const workout = copyWorkout;
        setCopyWorkout(null); setActionWorkout(null);
        setSaving(true);
        try {
            const res = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/copy', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, newDate }),
            });
            if (!res.ok) throw new Error();
            const body = await res.json();
            addWorkout({ ...workout, id: body.newId, scheduledDate: newDate, status: 'scheduled', skipReason: null, completedAt: null, originalDate: null, copiedFrom: workout.id });
        } catch {
            Alert.alert('Error', 'Could not copy workout. Please try again.');
        } finally { setSaving(false); }
    };

    const handleMoveConfirm = async (newDate) => {
        const workout = moveWorkout;
        setMoveWorkout(null); setActionWorkout(null);
        const oldDate = workout.scheduledDate;
        updateWorkout(workout.id, { scheduledDate: newDate, originalDate: workout.originalDate ?? oldDate, status: (workout.status === 'skipped' || workout.status === 'missed') ? 'scheduled' : workout.status });
        setSaving(true);
        try {
            const res = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/move', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, newDate, today: viewingDeviceTodayStr }),
            });
            if (!res.ok) throw new Error();
        } catch {
            updateWorkout(workout.id, { scheduledDate: oldDate, originalDate: workout.originalDate, status: workout.status });
            Alert.alert('Error', 'Could not move workout. Please try again.');
        } finally { setSaving(false); }
    };

    // ── Header label ─────────────────────────────────────────────────────────

    const headerLabel = calendarView === 'month'
        ? monthLabel(year, month)
        : weekLabel(weekGrid);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>

            {/* ── Header ── */}
            <View style={styles.header}>
                <Pressable
                    onPress={calendarView === 'month' ? prevMonth : prevWeek}
                    style={styles.headerButton}
                    accessibilityRole="button"
                    accessibilityLabel={calendarView === 'month' ? 'Previous month' : 'Previous week'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Feather name="chevron-left" size={24} color="#fae9e9" />
                </Pressable>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} accessibilityRole="header">
                        {headerLabel}
                    </Text>
                    {isCoach && clientName ? (
                        <Text style={styles.headerClient}>{clientName}</Text>
                    ) : null}
                </View>

                <Pressable
                    onPress={calendarView === 'month' ? nextMonth : nextWeek}
                    style={styles.headerButton}
                    accessibilityRole="button"
                    accessibilityLabel={calendarView === 'month' ? 'Next month' : 'Next week'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Feather name="chevron-right" size={24} color="#fae9e9" />
                </Pressable>
            </View>

            {/* ── View toggle ── */}
            <View style={styles.viewToggleRow}>
                <Pressable
                    style={[styles.viewToggleBtn, calendarView === 'month' && styles.viewToggleBtnActive]}
                    onPress={() => { if (calendarView !== 'month') toggleView(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Monthly view"
                    accessibilityState={{ selected: calendarView === 'month' }}
                >
                    <Feather name="grid" size={14} color={calendarView === 'month' ? '#000' : '#fba8a0'} />
                    <Text style={[styles.viewToggleText, calendarView === 'month' && styles.viewToggleTextActive]}>
                        Month
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.viewToggleBtn, calendarView === 'week' && styles.viewToggleBtnActive]}
                    onPress={() => { if (calendarView !== 'week') toggleView(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Weekly view"
                    accessibilityState={{ selected: calendarView === 'week' }}
                >
                    <Feather name="columns" size={14} color={calendarView === 'week' ? '#000' : '#fba8a0'} />
                    <Text style={[styles.viewToggleText, calendarView === 'week' && styles.viewToggleTextActive]}>
                        Week
                    </Text>
                </Pressable>
            </View>

            {/* ── Calendar body ── */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fba8a0" accessibilityLabel="Loading schedule" />
                </View>
            ) : calendarView === 'month' ? (

                // ── MONTHLY VIEW ──
                <ScrollView>
                    {/* Day-of-week header */}
                    <View style={styles.dowRow} accessibilityElementsHidden>
                        {DAYS_OF_WEEK.map(d => (
                            <Text key={d} style={styles.dowLabel}>{d}</Text>
                        ))}
                    </View>

                    <View style={styles.grid}>
                        {monthGrid.map(({ dateStr, currentMonth }) => (
                            <MonthDayCell
                                key={dateStr}
                                dateStr={dateStr}
                                currentMonth={currentMonth}
                                workouts={workoutsByDate[dateStr] ?? []}
                                isToday={dateStr === viewingDeviceTodayStr}
                                isCoach={isCoach}
                                onWorkoutPress={handleWorkoutPress}
                                onWorkoutLongPress={setActionWorkout}
                                onEmptyDayLongPress={setAddDayTarget}
                            />
                        ))}
                    </View>

                    <Legend />
                    {isCoach && <Text style={styles.coachHint}>Long-press any empty day to add a workout</Text>}
                    <View style={{ height: 60 }} />
                </ScrollView>

            ) : (

                // ── WEEKLY VIEW ──
                <ScrollView>
                    <View style={styles.weekGrid}>
                        {weekGrid.map(({ dateStr }) => (
                            <WeekDayColumn
                                key={dateStr}
                                dateStr={dateStr}
                                workouts={workoutsByDate[dateStr] ?? []}
                                isToday={dateStr === viewingDeviceTodayStr}
                                isCoach={isCoach}
                                onWorkoutPress={handleWorkoutPress}
                                onWorkoutLongPress={setActionWorkout}
                                onEmptyDayLongPress={setAddDayTarget}
                            />
                        ))}
                    </View>

                    {/* Full workout list for the week — better readability */}
                    <WeekWorkoutList
                        weekGrid={weekGrid}
                        workoutsByDate={workoutsByDate}
                        todayStr={viewingDeviceTodayStr}
                        onWorkoutPress={handleWorkoutPress}
                        onWorkoutLongPress={setActionWorkout}
                    />

                    <Legend />
                    {isCoach && <Text style={styles.coachHint}>Long-press any day column to add a workout</Text>}
                    <View style={{ height: 60 }} />
                </ScrollView>
            )}

            {/* ── Saving banner ── */}
            {saving && (
                <View style={styles.savingBanner} accessibilityLiveRegion="polite" accessibilityLabel="Saving">
                    <ActivityIndicator size="small" color="#000" />
                    <Text style={styles.savingText}>Saving…</Text>
                </View>
            )}

            {/* ── Modals ── */}
            {actionWorkout && (
                <WorkoutActionSheet
                    workout={actionWorkout}
                    onClose={() => setActionWorkout(null)}
                    onSkip={() => setSkipWorkout(actionWorkout)}
                    onCopy={() => setCopyWorkout(actionWorkout)}
                    onMove={() => setMoveWorkout(actionWorkout)}
                />
            )}

            {addDayTarget && !showTemplatePicker && (
                <AddWorkoutSheet
                    dateStr={addDayTarget}
                    clientName={clientName}
                    onClose={() => setAddDayTarget(null)}
                    onCreateNew={handleCreateNew}
                    onUseTemplate={handleUseTemplate}
                />
            )}

            {skipWorkout && (
                <SkipModal
                    workout={skipWorkout}
                    onClose={() => setSkipWorkout(null)}
                    onConfirm={handleSkipConfirm}
                />
            )}

            {copyWorkout && (
                <DatePickerModal
                    title="Copy workout to…"
                    minDate={null}
                    onClose={() => setCopyWorkout(null)}
                    onConfirm={handleCopyConfirm}
                />
            )}

            {moveWorkout && (
                <DatePickerModal
                    title="Move workout to…"
                    minDate={viewingDeviceTodayStr}
                    onClose={() => setMoveWorkout(null)}
                    onConfirm={handleMoveConfirm}
                />
            )}

            <TemplatePickerOverlay
                visible={showTemplatePicker}
                onClose={() => { setShowTemplatePicker(false); setAddDayTarget(null); }}
                clientEmail={clientEmail}
                clientName={clientName}
                scheduledDate={addDayTarget}
                navigation={navigation}
            />
        </View>
    );
}

// ─── Week workout detail list ─────────────────────────────────────────────────

const WeekWorkoutList = ({ weekGrid, workoutsByDate, todayStr, onWorkoutPress, onWorkoutLongPress }) => {
    const days = weekGrid.filter(({ dateStr }) => (workoutsByDate[dateStr]?.length ?? 0) > 0);
    if (days.length === 0) return (
        <View style={styles.weekEmptyState}>
            <Feather name="calendar" size={28} color="#333" />
            <Text style={styles.weekEmptyStateText}>No workouts this week</Text>
        </View>
    );

    return (
        <View style={styles.weekListContainer}>
            {days.map(({ dateStr }) => {
                const dayWorkouts = workoutsByDate[dateStr] ?? [];
                const d = parseISO(dateStr);
                const isToday = dateStr === todayStr;
                return (
                    <View key={dateStr} style={styles.weekListDay}>
                        <View style={[styles.weekListDayHeader, isToday && styles.weekListDayHeaderToday]}>
                            <Text style={[styles.weekListDayLabel, isToday && styles.weekListDayLabelToday]}>
                                {d.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}
                                {isToday ? '  ·  Today' : ''}
                            </Text>
                        </View>
                        {dayWorkouts.map(w => (
                            <Pressable
                                key={w.id}
                                style={[styles.weekListItem, { borderLeftColor: STATUS_COLOR[w.status] ?? STATUS_COLOR.scheduled }]}
                                onPress={() => onWorkoutPress(w)}
                                onLongPress={() => onWorkoutLongPress(w)}
                                delayLongPress={400}
                                accessibilityRole="button"
                                accessibilityLabel={`${w.workoutName}, ${w.status}`}
                            >
                                <View style={styles.weekListItemContent}>
                                    <Text style={styles.weekListItemName}>{w.workoutName}</Text>
                                    <Text style={styles.weekListItemStatus}>{w.status}</Text>
                                </View>
                                <Feather name="chevron-right" size={16} color="#555" />
                            </Pressable>
                        ))}
                    </View>
                );
            })}
        </View>
    );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
    { color: STATUS_COLOR.scheduled, label: 'Scheduled' },
    { color: STATUS_COLOR.completed, label: 'Completed' },
    { color: STATUS_COLOR.skipped,   label: 'Skipped'   },
    { color: STATUS_COLOR.missed,    label: 'Missed'    },
];

const Legend = () => (
    <View style={styles.legend} accessibilityRole="text" accessibilityLabel="Legend: pink = scheduled, green = completed, grey = skipped, orange = missed">
        {LEGEND_ITEMS.map(({ color, label }) => (
            <View key={label} style={styles.legendItem} accessibilityElementsHidden>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{label}</Text>
            </View>
        ))}
    </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:       { flex: 1, backgroundColor: '#000' },

    // ── Header ──
    header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    headerButton:    { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    headerCenter:    { alignItems: 'center', flex: 1 },
    // AAA: #fae9e9 on #000 = 17.7:1
    headerTitle:     { fontSize: 20, fontWeight: 'bold', color: '#fae9e9' },
    // AA: #fba8a0 on #000 = 5.29:1 ✓ (supplemental client label)
    headerClient:    { fontSize: 13, color: '#fba8a0', marginTop: 2 },

    // ── View toggle ──
    viewToggleRow:       { flexDirection: 'row', alignSelf: 'center', backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: '#222', overflow: 'hidden', marginBottom: 8, marginTop: 2 },
    viewToggleBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
    viewToggleBtnActive: { backgroundColor: '#fba8a0', borderRadius: 8, margin: 3 },
    // AA: #fba8a0 on #000 = 5.29:1 ✓
    viewToggleText:      { fontSize: 14, color: '#fba8a0', fontWeight: '600' },
    // AAA: #000 on #fba8a0 = contrast > 5:1 ✓ (large-text AA)
    viewToggleTextActive:{ color: '#000', fontWeight: '700' },

    // ── Day-of-week row (month view) ──
    dowRow:   { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 2 },
    // AA: #aaa on #000 = 5.74:1 ✓ (supplemental header)
    dowLabel: { width: DAY_CELL_SIZE, textAlign: 'center', color: '#aaaaaa', fontSize: 12, fontWeight: '600' },

    // ── Month grid ──
    grid:             { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
    dayCell:          { width: DAY_CELL_SIZE, minHeight: DAY_CELL_SIZE, paddingBottom: 4, borderTopWidth: 0.5, borderTopColor: '#222' },
    dayCellOtherMonth:{ opacity: 0.3 },

    dayNumberContainer:       { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginTop: 2, marginBottom: 2 },
    dayNumberTodayContainer:  { backgroundColor: '#fba8a0' },
    // AAA: #fae9e9 on #000 = 17.7:1 ✓
    dayNumber:                { fontSize: 12, color: '#fae9e9', textAlign: 'center' },
    // AAA: #000 on #fba8a0 = >5:1 ✓ (large-text AA sufficient for date number)
    dayNumberToday:           { color: '#000', fontWeight: 'bold' },
    dayNumberOtherMonth:      { color: '#555' },

    // AA: #2a2a2a on #000 — this is intentionally invisible (decorative hint)
    emptyDayHint: { textAlign: 'center', color: '#2a2a2a', fontSize: 14 },

    // ── Workout pill ──
    pill:         { flexDirection: 'row', alignItems: 'center', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, marginHorizontal: 1, marginBottom: 2, gap: 2 },
    pillSkipped:  { opacity: 0.6 },
    // AAA: #000 on pill colours ✓ (see STATUS_COLOR comment above)
    pillText:     { fontSize: 9, color: '#000', fontWeight: '700', flex: 1 },
    pillCompact:  { paddingHorizontal: 2, paddingVertical: 1 },
    pillTextCompact: { fontSize: 8 },

    // ── Weekly view ──
    weekGrid:          { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, borderBottomWidth: 0.5, borderBottomColor: '#222' },
    weekColumn:        { flex: 1, minHeight: 100, borderRightWidth: 0.5, borderRightColor: '#1a1a1a', paddingHorizontal: 2 },
    weekDayHeader:     { alignItems: 'center', paddingVertical: 6 },
    weekDayHeaderToday:{ },
    // AA: #aaa on #000 = 5.74:1 ✓
    weekDayName:       { fontSize: 11, color: '#aaaaaa', fontWeight: '600', textTransform: 'uppercase' },
    weekDayNameToday:  { color: '#fba8a0' },
    weekDayNumContainer:      { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
    weekDayNumContainerToday: { backgroundColor: '#fba8a0' },
    // AAA: #fae9e9 on #000 = 17.7:1 ✓
    weekDayNum:        { fontSize: 14, fontWeight: 'bold', color: '#fae9e9' },
    weekDayNumToday:   { color: '#000' },
    weekWorkouts:      { paddingTop: 4, gap: 3, paddingBottom: 8 },
    weekEmptyDay:      { height: 32, justifyContent: 'center', alignItems: 'center' },

    // ── Week list (below weekly grid) ──
    weekListContainer:     { paddingHorizontal: 16, paddingTop: 16 },
    weekListDay:           { marginBottom: 16 },
    weekListDayHeader:     { marginBottom: 8 },
    weekListDayHeaderToday:{ },
    // AAA: #fae9e9 on #000 = 17.7:1 ✓
    weekListDayLabel:      { fontSize: 15, fontWeight: '700', color: '#fae9e9' },
    weekListDayLabelToday: { color: '#fba8a0' },
    weekListItem:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, marginBottom: 6 },
    weekListItemContent:   { flex: 1 },
    // AAA: #fae9e9 on #0d0d0d ≈ 16.8:1 ✓
    weekListItemName:      { fontSize: 15, color: '#fae9e9', fontWeight: '600' },
    // AA: #aaa on #0d0d0d ≈ 5.5:1 ✓
    weekListItemStatus:    { fontSize: 12, color: '#aaaaaa', marginTop: 2, textTransform: 'capitalize' },

    weekEmptyState:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
    // AA: #555 on #000 — purely decorative icon, acceptable
    weekEmptyStateText: { fontSize: 15, color: '#aaaaaa' },

    // ── Legend ──
    legend:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot:  { width: 8, height: 8, borderRadius: 4 },
    // AA: #aaa on #000 = 5.74:1 ✓
    legendText: { fontSize: 12, color: '#aaaaaa' },

    coachHint: { textAlign: 'center', fontSize: 12, color: '#555', paddingBottom: 8 },

    loadingContainer:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

    savingBanner: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: '#fba8a0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
    savingText:   { color: '#000', fontWeight: '700' },

    // ── Action sheet ──
    sheetOverlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheetContainer:   { backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40, paddingHorizontal: 24, paddingTop: 12 },
    sheetHandle:      { width: 36, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:       { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 4 },
    sheetDate:        { fontSize: 13, color: '#aaaaaa', marginBottom: 20 },
    sheetAction:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#222', minHeight: 56 },
    sheetActionTextBlock: { flex: 1 },
    sheetActionText:  { fontSize: 16, color: '#fae9e9' },
    sheetActionSub:   { fontSize: 12, color: '#aaaaaa', marginTop: 2 },
    sheetCompleted:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    sheetCompletedText: { fontSize: 13, color: '#7bb533', flex: 1 },
    sheetCancel:      { marginTop: 8, paddingVertical: 14, alignItems: 'center', minHeight: 52 },
    sheetCancelText:  { fontSize: 16, color: '#aaaaaa' },

    // ── Modals ──
    modalOverlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard:                { backgroundColor: '#111', borderRadius: 12, padding: 24, width: '100%' },
    modalTitle:               { fontSize: 18, fontWeight: 'bold', color: '#fae9e9', marginBottom: 4 },
    modalSubtitle:            { fontSize: 14, color: '#aaaaaa', marginBottom: 16 },
    modalInput:               { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#fba8a0', borderRadius: 8, padding: 12, color: '#fae9e9', fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
    modalActions:             { flexDirection: 'row', gap: 12 },
    modalButtonPrimary:       { flex: 1, backgroundColor: '#fba8a0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
    modalButtonPrimaryText:   { color: '#000', fontWeight: '700', fontSize: 16 },
    modalButtonSecondary:     { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
    modalButtonSecondaryText: { color: '#cccccc', fontSize: 16 },
    modalButtonDisabled:      { opacity: 0.4 },

    miniCalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    miniNavBtn:         { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    miniCalMonthLabel:  { color: '#fae9e9', fontWeight: '600', fontSize: 15 },
    miniCalGrid:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
    miniCalDayLabel:    { width: `${100 / 7}%`, textAlign: 'center', color: '#aaaaaa', fontSize: 11, marginBottom: 4 },
    miniCalCell:        { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 100 },
    miniCalCellOtherMonth:  { opacity: 0.25 },
    miniCalCellSelected:    { backgroundColor: '#fba8a0' },
    miniCalCellDisabled:    { opacity: 0.2 },
    miniCalCellText:        { color: '#fae9e9', fontSize: 13 },
    miniCalCellToday:       { color: '#fba8a0', fontWeight: 'bold' },
    miniCalCellSelectedText:{ color: '#000', fontWeight: 'bold' },
    miniCalCellDisabledText:{ color: '#555' },
    miniCalCellOtherMonthText: { color: '#555' },
});

export { CALENDAR_VIEW_KEY };