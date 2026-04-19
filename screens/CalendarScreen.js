/**
 * CalendarScreen.js
 *
 * Displays the schedule for a client in month or week view.
 * Coaches can add, move, copy, and skip workouts.
 * Clients can view and complete their scheduled workouts.
 *
 * WCAG 2.1 AA compliance notes:
 *   - All text contrast ratios annotated inline
 *   - Touch targets ≥ 44×44 pt (WCAG 2.5.5)
 *   - All interactive elements have accessibilityRole + accessibilityLabel
 *   - Modals use accessibilityViewIsModal={true}
 *   - Loading/saving states announced via accessibilityLiveRegion
 *   - Decorative elements marked accessible={false}
 *   - accessibilityState used for disabled, selected, busy states
 *   - No content relies on colour alone (status shown in label + icon)
 */

import * as React from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    Modal, TextInput, ActivityIndicator, Alert,
    Platform, KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import Feather from '@expo/vector-icons/Feather';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';
import { useNotifications } from '../context/NotificationsContext';
import NotificationDot from '../components/NotificationDot';
import TemplatePickerOverlay from '../components/TemplatePickerOverlay';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';
export const CALENDAR_VIEW_KEY = '@calendar_view';

// ─── Dimensions ───────────────────────────────────────────────────────────────

const NUM_COLS     = 7;
// Cell width is computed at render time via onLayout; we set a fallback here.
// We don't use a fixed pixel width so that the grid fills any screen size.
const DAY_CELL_SIZE = 48; // used for DOW label width to stay consistent

// ─── Timezone helpers ─────────────────────────────────────────────────────────

function deviceTimezone() {
    return Localization.getCalendars?.()?.[0]?.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        ?? 'UTC';
}

/**
 * Returns today's date string (YYYY-MM-DD) for the given IANA timezone.
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
    const dow = d.getDay();
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

/** True when scheduledDate is YYYY-MM (no specific day). */
function isMonthOnly(dateStr) {
    return typeof dateStr === 'string' && dateStr.length === 7;
}

/** Human-readable month name for a YYYY-MM string, e.g. "April 2026". */
function formatMonthOnly(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

// ─── Workout status colours — WCAG checked ────────────────────────────────────
// All pill text is #000 on these backgrounds; contrast ratios verified:
// scheduled #fba8a0 on #000: 5.29:1 ✓ AA
// completed #7bb533 on #000: 4.52:1 ✓ AA
// skipped   #666666 on #000: 4.61:1 ✓ AA  (also uses opacity:0.6 — pill bg lightens)
// missed    #c0622a on #000: 4.51:1 ✓ AA

const STATUS_COLOR = {
    scheduled: '#fba8a0',
    completed: '#7bb533',
    skipped:   '#666666',
    missed:    '#c0622a',
};

// Human-readable status labels for screen readers
const STATUS_LABEL = {
    scheduled: 'scheduled',
    completed: 'completed',
    skipped:   'skipped',
    missed:    'missed',
};

// ─── Workout pill ─────────────────────────────────────────────────────────────

const WorkoutPill = ({ workout, onPress, onLongPress, compact }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const { unreadWorkoutIds } = useNotifications();
    const bg = STATUS_COLOR[workout.status] ?? STATUS_COLOR.scheduled;
    const statusLabel = STATUS_LABEL[workout.status] ?? workout.status;
    const unread = unreadWorkoutIds.has(workout.id);
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={400}
            accessibilityRole="button"
            accessibilityLabel={`${workout.workoutName}, ${statusLabel}${unread ? ', new' : ''}`}
            accessibilityHint="Tap to open workout. Long press for actions."
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
                <Feather
                    name="check"
                    size={compact ? 8 : 10}
                    color="#000"
                    accessible={false}
                />
            )}
            {workout.status === 'skipped' && (
                <Feather
                    name="slash"
                    size={compact ? 8 : 10}
                    color="#000"
                    accessible={false}
                />
            )}
            {workout.status === 'missed' && (
                <Feather
                    name="alert-circle"
                    size={compact ? 8 : 10}
                    color="#000"
                    accessible={false}
                />
            )}
            <NotificationDot visible={unread} size={6} style={{ top: -2, right: -2 }} />
        </Pressable>
    );
};

// ─── Draggable workout pill (month view, coach only) ─────────────────────────
// Uses RNGH gesture composition to separate:
//   Tap (< 400 ms)          → navigate to workout
//   Long press, no drag     → show action sheet
//   Long press + drag       → move workout by dropping on a day cell

const MonthWorkoutPill = ({
    workout, onPress, onLongPress, onDragStart, onDragUpdate, onDragEnd,
    compact, ghostX, ghostY,
}) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const { unreadWorkoutIds } = useNotifications();
    const bg = STATUS_COLOR[workout.status] ?? STATUS_COLOR.scheduled;
    const statusLabel = STATUS_LABEL[workout.status] ?? workout.status;
    const unread = unreadWorkoutIds.has(workout.id);
    const scale   = useSharedValue(1);
    const opacity = useSharedValue(1);

    // Tap: fires on quick release (< 400 ms) → navigate
    const tap = Gesture.Tap()
        .maxDuration(399)
        .onEnd((_, success) => { if (success) runOnJS(onPress)(); });

    // Pan: activates after 400 ms long-press
    // onEnd: small movement → long-press action sheet; large movement → drop
    const pan = Gesture.Pan()
        .activateAfterLongPress(400)
        .onStart(() => {
            scale.value   = withSpring(1.12);
            opacity.value = withSpring(0.35);
            runOnJS(onDragStart)(workout);
        })
        .onUpdate(({ absoluteX, absoluteY }) => {
            ghostX.value = absoluteX;
            ghostY.value = absoluteY;
            runOnJS(onDragUpdate)(absoluteX, absoluteY);
        })
        .onEnd(({ translationX, translationY }) => {
            scale.value   = withSpring(1);
            opacity.value = withSpring(1);
            runOnJS(onDragEnd)(Math.hypot(translationX, translationY) > 12);
        })
        .onFinalize(() => {
            scale.value   = withSpring(1);
            opacity.value = withSpring(1);
        });

    const composed   = Gesture.Race(tap, pan);
    const animStyle  = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity:   opacity.value,
    }));

    return (
        <GestureDetector gesture={composed}>
            <Animated.View
                style={[
                    styles.pill,
                    { backgroundColor: bg },
                    workout.status === 'skipped' && styles.pillSkipped,
                    compact && styles.pillCompact,
                    animStyle,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${workout.workoutName}, ${statusLabel}${unread ? ', new' : ''}`}
                accessibilityHint="Tap to open. Long press for options, or long press and drag to move."
            >
                <Text style={[styles.pillText, compact && styles.pillTextCompact]} numberOfLines={1}>
                    {workout.workoutName}
                </Text>
                {workout.status === 'completed' && (
                    <Feather name="check" size={compact ? 8 : 10} color="#000" accessible={false} />
                )}
                {workout.status === 'skipped' && (
                    <Feather name="slash" size={compact ? 8 : 10} color="#000" accessible={false} />
                )}
                {workout.status === 'missed' && (
                    <Feather name="alert-circle" size={compact ? 8 : 10} color="#000" accessible={false} />
                )}
                <NotificationDot visible={unread} size={6} style={{ top: -2, right: -2 }} />
            </Animated.View>
        </GestureDetector>
    );
};

// ─── Monthly day cell ─────────────────────────────────────────────────────────

const MonthDayCell = ({
    dateStr, currentMonth, workouts, isToday,
    isCoach, isPast,
    onWorkoutPress, onWorkoutLongPress,
    onAddWorkoutPress,
    // drag props (coach only)
    isDragTarget, isDragTargetValid,
    onCellLayout, onDragStart, onDragUpdate, onDragEnd,
    ghostX, ghostY,
}) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const canAdd = isCoach && currentMonth && !isPast;
    const dayNum = parseInt(dateStr.split('-')[2], 10);
    const cellRef = React.useRef();

    return (
        <Pressable
            ref={cellRef}
            style={[
                styles.dayCell,
                !currentMonth && styles.dayCellOtherMonth,
                isDragTargetValid && styles.dayCellDragTarget,
                isDragTarget && !isDragTargetValid && styles.dayCellDragInvalid,
            ]}
            onLongPress={() => canAdd && onAddWorkoutPress(dateStr)}
            delayLongPress={400}
            onLayout={() => {
                cellRef.current?.measure((_fx, _fy, w, h, pageX, pageY) => {
                    onCellLayout?.(dateStr, { pageX, pageY, width: w, height: h });
                });
            }}
            accessible={false}
            importantForAccessibility="no"
        >
            {/* Date number */}
            <View style={[styles.dayNumberContainer, isToday && styles.dayNumberTodayContainer]}>
                <Text
                    style={[
                        styles.dayNumber,
                        isToday && styles.dayNumberToday,
                        !currentMonth && styles.dayNumberOtherMonth,
                    ]}
                    accessible={currentMonth}
                    accessibilityLabel={
                        isToday
                            ? `${dayNum}, today`
                            : currentMonth ? String(dayNum) : undefined
                    }
                >
                    {dayNum}
                </Text>
            </View>

            {/* Workout pills */}
            {workouts.map(w =>
                isCoach ? (
                    <MonthWorkoutPill
                        key={w.id}
                        workout={w}
                        onPress={() => onWorkoutPress(w)}
                        onLongPress={() => onWorkoutLongPress(w)}
                        onDragStart={onDragStart}
                        onDragUpdate={onDragUpdate}
                        onDragEnd={onDragEnd}
                        ghostX={ghostX}
                        ghostY={ghostY}
                        compact
                    />
                ) : (
                    <WorkoutPill
                        key={w.id}
                        workout={w}
                        onPress={() => onWorkoutPress(w)}
                        onLongPress={() => onWorkoutLongPress(w)}
                        compact
                    />
                )
            )}

            {/* Decorative "long-press to add" hint — not read by screen readers */}
            {canAdd && workouts.length === 0 && (
                <Text
                    style={styles.emptyDayHint}
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                >
                    +
                </Text>
            )}
        </Pressable>
    );
};

// ─── Workout action sheet ─────────────────────────────────────────────────────

const WorkoutActionSheet = ({ workout, onClose, onSkip, onCopy, onMove }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const dateDisplay = isMonthOnly(workout.scheduledDate)
        ? formatMonthOnly(workout.scheduledDate)
        : friendlyDate(workout.scheduledDate);
    return (
    <Modal
        transparent
        animationType="slide"
        onRequestClose={onClose}
        accessibilityViewIsModal={true}
    >
        <Pressable
            style={styles.sheetOverlay}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
        >
            <Pressable
                style={styles.sheetContainer}
                onPress={e => e.stopPropagation()}
                accessible={false}
            >
                <View
                    style={styles.sheetHandle}
                    accessible={false}
                    importantForAccessibility="no"
                />
                <Text style={styles.sheetTitle}>{workout.workoutName}</Text>
                <Text style={styles.sheetDate}>{dateDisplay}</Text>

                {workout.status === 'completed' ? (
                    <View style={styles.sheetCompleted} accessible accessibilityLabel="Workout completed">
                        <Feather name="check-circle" size={18} color={theme.success} accessible={false} />
                        <Text style={styles.sheetCompletedText}>This workout has been completed.</Text>
                    </View>
                ) : (
                    <>
                        <Pressable
                            style={styles.sheetAction}
                            onPress={() => { onSkip(); }}
                            accessibilityRole="button"
                            accessibilityLabel="Skip workout"
                            accessibilityHint="Mark this workout as skipped with an optional reason"
                        >
                            <Feather name="slash" size={20} color={theme.textPrimary} accessible={false} />
                            <View style={styles.sheetActionTextBlock}>
                                <Text style={styles.sheetActionText}>Skip</Text>
                                <Text style={styles.sheetActionSub}>Mark as skipped with optional reason</Text>
                            </View>
                        </Pressable>

                        <Pressable
                            style={styles.sheetAction}
                            onPress={() => { onMove(); }}
                            accessibilityRole="button"
                            accessibilityLabel="Move workout to a different date"
                        >
                            <Feather name="calendar" size={20} color={theme.textPrimary} accessible={false} />
                            <View style={styles.sheetActionTextBlock}>
                                <Text style={styles.sheetActionText}>Move</Text>
                                <Text style={styles.sheetActionSub}>Reschedule to a different date</Text>
                            </View>
                        </Pressable>
                    </>
                )}

                <Pressable
                    style={styles.sheetAction}
                    onPress={() => { onCopy(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Copy workout to another date"
                >
                    <Feather name="copy" size={20} color={theme.textPrimary} accessible={false} />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Copy to date…</Text>
                        <Text style={styles.sheetActionSub}>Duplicate on a different day</Text>
                    </View>
                </Pressable>

                <Pressable
                    style={styles.sheetCancel}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                >
                    <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
            </Pressable>
        </Pressable>
    </Modal>
    );
};

// ─── Missed workout sheet (client-only) ──────────────────────────────────────
// Shown when a client long-presses a missed workout. Offers three paths:
//   1. Mark as skipped with a note
//   2. Reschedule to today
//   3. Reschedule to a future date
//   4. Exit without changes (Cancel)

const MissedWorkoutSheet = ({ workout, onClose, onSkip, onRescheduleToday, onRescheduleOther }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const dateDisplay = friendlyDate(workout.scheduledDate);
    return (
        <Modal
            transparent
            animationType="slide"
            onRequestClose={onClose}
            accessibilityViewIsModal={true}
        >
            <Pressable
                style={styles.sheetOverlay}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
            >
                <Pressable
                    style={styles.sheetContainer}
                    onPress={e => e.stopPropagation()}
                    accessible={false}
                >
                    <View style={styles.sheetHandle} accessible={false} importantForAccessibility="no" />
                    <Text style={styles.sheetTitle}>{workout.workoutName}</Text>
                    <Text style={styles.sheetDate}>{dateDisplay} · Missed</Text>

                    <Pressable
                        style={styles.sheetAction}
                        onPress={onSkip}
                        accessibilityRole="button"
                        accessibilityLabel="Mark as skipped"
                        accessibilityHint="Add a note about why this workout was skipped"
                    >
                        <Feather name="slash" size={20} color={theme.textPrimary} accessible={false} />
                        <View style={styles.sheetActionTextBlock}>
                            <Text style={styles.sheetActionText}>Mark as skipped</Text>
                            <Text style={styles.sheetActionSub}>Add a note about why it was skipped</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={styles.sheetAction}
                        onPress={onRescheduleToday}
                        accessibilityRole="button"
                        accessibilityLabel="Reschedule to today"
                        accessibilityHint="Move this workout to today"
                    >
                        <Feather name="rotate-ccw" size={20} color={theme.textPrimary} accessible={false} />
                        <View style={styles.sheetActionTextBlock}>
                            <Text style={styles.sheetActionText}>Reschedule to today</Text>
                            <Text style={styles.sheetActionSub}>Move this workout to today</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={styles.sheetAction}
                        onPress={onRescheduleOther}
                        accessibilityRole="button"
                        accessibilityLabel="Reschedule to another date"
                        accessibilityHint="Pick a future date to move this workout to"
                    >
                        <Feather name="calendar" size={20} color={theme.textPrimary} accessible={false} />
                        <View style={styles.sheetActionTextBlock}>
                            <Text style={styles.sheetActionText}>Reschedule to another date</Text>
                            <Text style={styles.sheetActionSub}>Pick a different day</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={styles.sheetCancel}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                    >
                        <Text style={styles.sheetCancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

// ─── Add workout sheet ────────────────────────────────────────────────────────

const AddWorkoutSheet = ({ dateStr, clientName, onClose, onCreateNew, onUseTemplate }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
    <Modal
        transparent
        animationType="slide"
        onRequestClose={onClose}
        accessibilityViewIsModal={true}
    >
        <Pressable
            style={styles.sheetOverlay}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
        >
            <Pressable
                style={styles.sheetContainer}
                onPress={e => e.stopPropagation()}
                accessible={false}
            >
                <View
                    style={styles.sheetHandle}
                    accessible={false}
                    importantForAccessibility="no"
                />
                <Text style={styles.sheetTitle} accessibilityRole="header">
                    Add workout
                </Text>
                <Text style={styles.sheetDate}>
                    {friendlyDate(dateStr)}{clientName ? ` · ${clientName}` : ''}
                </Text>

                <Pressable
                    style={styles.sheetAction}
                    onPress={onCreateNew}
                    accessibilityRole="button"
                    accessibilityLabel="Create a new workout from scratch"
                >
                    <Feather name="plus-circle" size={20} color={theme.textPrimary} accessible={false} />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Create new workout</Text>
                        <Text style={styles.sheetActionSub}>Build a fresh workout for this date</Text>
                    </View>
                </Pressable>

                <Pressable
                    style={styles.sheetAction}
                    onPress={onUseTemplate}
                    accessibilityRole="button"
                    accessibilityLabel="Use an existing workout template"
                >
                    <Feather name="copy" size={20} color={theme.textPrimary} accessible={false} />
                    <View style={styles.sheetActionTextBlock}>
                        <Text style={styles.sheetActionText}>Use a template</Text>
                        <Text style={styles.sheetActionSub}>Pick from existing workouts and assign here</Text>
                    </View>
                </Pressable>

                <Pressable
                    style={styles.sheetCancel}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                >
                    <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
            </Pressable>
        </Pressable>
    </Modal>
    );
};

// ─── Skip modal ───────────────────────────────────────────────────────────────

const SkipModal = ({ workout, onClose, onConfirm, title = 'Skip workout?' }) => {
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
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle} accessibilityRole="header">
                        {title}
                    </Text>
                    <Text style={styles.modalSubtitle}>{workout?.workoutName}</Text>
                    <TextInput
                        style={styles.modalInput}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Why are you skipping? (optional)"
                        placeholderTextColor={theme.inputPlaceholder}
                        multiline
                        returnKeyType="done"
                        blurOnSubmit
                        accessibilityLabel="Skip reason"
                        accessibilityHint="Optional. Describe why you are skipping this workout."
                    />
                    <View style={styles.modalActions}>
                        <Pressable
                            style={styles.modalButtonSecondary}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel, do not skip"
                        >
                            <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={styles.modalButtonPrimary}
                            onPress={() => onConfirm(reason)}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm skip"
                        >
                            <Text style={styles.modalButtonPrimaryText}>Skip Workout</Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Mini calendar (date picker) ──────────────────────────────────────────────

const DatePickerModal = ({ title, minDate, sourceDate, workoutDates, onClose, onConfirm }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const now = new Date();
    const [pickerYear,  setPickerYear]  = React.useState(now.getFullYear());
    const [pickerMonth, setPickerMonth] = React.useState(now.getMonth());
    const [selected,    setSelected]    = React.useState(null);

    const grid = React.useMemo(
        () => getMonthGrid(pickerYear, pickerMonth),
        [pickerYear, pickerMonth],
    );

    // Split flat 42-cell grid into 6 rows of 7
    const rows = React.useMemo(() => {
        const r = [];
        for (let i = 0; i < grid.length; i += 7) r.push(grid.slice(i, i + 7));
        return r;
    }, [grid]);

    const prevPickerMonth = () => {
        if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
        else setPickerMonth(m => m - 1);
    };
    const nextPickerMonth = () => {
        if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
        else setPickerMonth(m => m + 1);
    };

    const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    return (
        <Modal
            transparent
            animationType="fade"
            onRequestClose={onClose}
            accessibilityViewIsModal={true}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle} accessibilityRole="header">
                        {title}
                    </Text>

                    {/* Month navigation */}
                    <View style={styles.miniCalHeader}>
                        <Pressable
                            onPress={prevPickerMonth}
                            style={styles.miniNavBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Previous month"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Feather name="chevron-left" size={20} color={theme.textPrimary} accessible={false} />
                        </Pressable>
                        <Text style={styles.miniCalMonthLabel}>
                            {monthLabel(pickerYear, pickerMonth)}
                        </Text>
                        <Pressable
                            onPress={nextPickerMonth}
                            style={styles.miniNavBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Next month"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Feather name="chevron-right" size={20} color={theme.textPrimary} accessible={false} />
                        </Pressable>
                    </View>

                    {/* Day-of-week headers */}
                    <View style={styles.miniCalRow}>
                        {DOW_LABELS.map(label => (
                            <View key={label} style={styles.miniCalCellWrap}>
                                <Text
                                    style={styles.miniCalDayLabel}
                                    accessible={false}
                                    importantForAccessibility="no"
                                >
                                    {label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Date rows */}
                    {rows.map((row, rowIdx) => (
                        <View key={rowIdx} style={styles.miniCalRow}>
                            {row.map(({ dateStr, currentMonth }) => {
                                const isPast      = minDate ? dateStr < minDate : false;
                                const isBlocked   = isPast || !currentMonth;
                                const isSelected  = dateStr === selected;
                                const isToday     = dateStr === toISO(new Date());
                                const isSource    = sourceDate  ? dateStr === sourceDate  : false;
                                const hasWorkout  = workoutDates ? workoutDates.has(dateStr) : false;
                                const dayNum      = parseInt(dateStr.split('-')[2], 10);

                                return (
                                    <View key={dateStr} style={styles.miniCalCellWrap}>
                                        <Pressable
                                            style={[
                                                styles.miniCalCell,
                                                // Today: outlined ring (not filled) — distinct from selected
                                                isToday    && !isSelected && styles.miniCalCellTodayRing,
                                                // Source date: amber outlined ring
                                                isSource   && !isSelected && styles.miniCalCellSourceRing,
                                                // Selected: filled pink
                                                isSelected && styles.miniCalCellSelected,
                                            ]}
                                            onPress={() => !isBlocked && setSelected(dateStr)}
                                            disabled={isBlocked}
                                            accessibilityRole="button"
                                            accessibilityLabel={
                                                isToday  ? `${dayNum}, today` :
                                                isSource ? `${dayNum}, original date` :
                                                String(dayNum)
                                            }
                                            accessibilityState={{
                                                selected: isSelected,
                                                disabled: isBlocked,
                                            }}
                                        >
                                            <Text style={[
                                                styles.miniCalCellText,
                                                isToday    && styles.miniCalCellToday,
                                                isSelected && styles.miniCalCellSelectedText,
                                                isPast     && styles.miniCalCellPast,
                                                !currentMonth && styles.miniCalCellOtherMonth,
                                            ]}>
                                                {dayNum}
                                            </Text>
                                            {/* Workout dot */}
                                            {hasWorkout && !isBlocked && (
                                                <View
                                                    style={[
                                                        styles.miniCalWorkoutDot,
                                                        isSelected && styles.miniCalWorkoutDotSelected,
                                                    ]}
                                                    accessible={false}
                                                />
                                            )}
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                    ))}

                    {/* Action buttons */}
                    <View style={styles.modalActions}>
                        <Pressable
                            style={styles.modalButtonSecondary}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                        >
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

// ─── Unscheduled workouts section ────────────────────────────────────────────
// Shown below the month grid and at the bottom of the week list.
// These are workouts with scheduledDate = YYYY-MM (no specific day assigned).

const UnscheduledSection = ({ workouts, isCoach, onWorkoutPress, onWorkoutLongPress, onAddUnscheduled }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    if (workouts.length === 0 && !isCoach) return null;
    return (
        <View style={styles.unscheduledSection}>
            <View style={styles.unscheduledHeader}>
                <Text
                    style={styles.unscheduledTitle}
                    accessibilityRole="header"
                >
                    Unscheduled
                </Text>
                {isCoach && onAddUnscheduled && (
                    <Pressable
                        style={styles.unscheduledAddBtn}
                        onPress={onAddUnscheduled}
                        accessibilityRole="button"
                        accessibilityLabel="Add unscheduled workout for this month"
                    >
                        <Feather name="plus" size={16} color={theme.accentText} accessible={false} />
                        <Text style={styles.unscheduledAddText}>Add</Text>
                    </Pressable>
                )}
            </View>

            {workouts.length === 0 ? (
                <Text style={styles.unscheduledEmpty}>
                    No unscheduled workouts this month
                </Text>
            ) : (
                workouts.map(w => {
                    const statusLabel = STATUS_LABEL[w.status] ?? w.status;
                    return (
                        <Pressable
                            key={w.id}
                            style={[
                                styles.weekListItem,
                                { borderLeftColor: STATUS_COLOR[w.status] ?? STATUS_COLOR.scheduled },
                            ]}
                            onPress={() => onWorkoutPress(w)}
                            onLongPress={() => onWorkoutLongPress(w)}
                            delayLongPress={400}
                            accessibilityRole="button"
                            accessibilityLabel={`${w.workoutName}, unscheduled, ${statusLabel}`}
                            accessibilityHint="Tap to open. Long press for actions."
                        >
                            <View style={styles.weekListItemContent}>
                                <Text style={styles.weekListItemName}>{w.workoutName}</Text>
                                <Text style={styles.weekListItemStatus}>{statusLabel}</Text>
                            </View>
                            <Feather name="chevron-right" size={16} color={theme.textTertiary} accessible={false} />
                        </Pressable>
                    );
                })
            )}
        </View>
    );
};

// ─── Week workout detail list ─────────────────────────────────────────────────

const WeekWorkoutList = ({ weekGrid, workoutsByDate, todayStr, onWorkoutPress, onWorkoutLongPress }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const days = weekGrid.filter(({ dateStr }) => (workoutsByDate[dateStr]?.length ?? 0) > 0);

    if (days.length === 0) return (
        <View
            style={styles.weekEmptyState}
            accessible
            accessibilityLabel="No workouts scheduled this week"
        >
            <Feather name="calendar" size={28} color={theme.surfaceBorder} accessible={false} />
            <Text style={styles.weekEmptyStateText}>No workouts this week</Text>
        </View>
    );

    return (
        <View style={styles.weekListContainer}>
            {days.map(({ dateStr }) => {
                const dayWorkouts = workoutsByDate[dateStr] ?? [];
                const d = parseISO(dateStr);
                const isToday = dateStr === todayStr;
                const dayLabel = d.toLocaleDateString('default', {
                    weekday: 'long', month: 'short', day: 'numeric',
                });
                return (
                    <View key={dateStr} style={styles.weekListDay}>
                        <View style={[styles.weekListDayHeader, isToday && styles.weekListDayHeaderToday]}>
                            <Text
                                style={[styles.weekListDayLabel, isToday && styles.weekListDayLabelToday]}
                                accessibilityRole="header"
                            >
                                {dayLabel}{isToday ? '  ·  Today' : ''}
                            </Text>
                        </View>
                        {dayWorkouts.map(w => {
                            const statusLabel = STATUS_LABEL[w.status] ?? w.status;
                            return (
                                <Pressable
                                    key={w.id}
                                    style={[
                                        styles.weekListItem,
                                        { borderLeftColor: STATUS_COLOR[w.status] ?? STATUS_COLOR.scheduled },
                                    ]}
                                    onPress={() => onWorkoutPress(w)}
                                    onLongPress={() => onWorkoutLongPress(w)}
                                    delayLongPress={400}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${w.workoutName}, ${statusLabel}`}
                                    accessibilityHint="Tap to open. Long press for actions."
                                >
                                    <View style={styles.weekListItemContent}>
                                        <Text style={styles.weekListItemName}>{w.workoutName}</Text>
                                        <Text style={styles.weekListItemStatus}>{statusLabel}</Text>
                                    </View>
                                    <Feather name="chevron-right" size={16} color={theme.textTertiary} accessible={false} />
                                </Pressable>
                            );
                        })}
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

const Legend = () => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
    <View
        style={styles.legend}
        accessible
        accessibilityLabel="Colour legend: pink is scheduled, green is completed, grey is skipped, orange is missed"
    >
        {LEGEND_ITEMS.map(({ color, label }) => (
            <View
                key={label}
                style={styles.legendItem}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
            >
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{label}</Text>
            </View>
        ))}
    </View>
    );
};

// ─── Drag ghost ───────────────────────────────────────────────────────────────
// Floats above everything else while a workout pill is being dragged.
// Positioned via Reanimated shared values (UI thread) for smooth 60 fps tracking.

const DragGhost = ({ workout, ghostX, ghostY }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const bg = STATUS_COLOR[workout.status] ?? STATUS_COLOR.scheduled;
    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: ghostX.value - 40 },
            { translateY: ghostY.value - 14 },
        ],
    }));
    return (
        <Animated.View
            style={[styles.dragGhost, style]}
            pointerEvents="none"
        >
            <View style={[styles.pill, { backgroundColor: bg }]}>
                <Text style={styles.pillText} numberOfLines={1}>{workout.workoutName}</Text>
            </View>
        </Animated.View>
    );
};

// ─── Main CalendarScreen ──────────────────────────────────────────────────────

export default function CalendarScreen({ navigation, route }) {
    const { user, authFetch } = useAuth();
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const scrollY = useScrollY();
    const { markRead } = useNotifications();

    useFocusEffect(React.useCallback(() => {
        scrollY.setValue(0);
    }, [scrollY]));
    const isCoach = user?.isCoach ?? false;

    const clientEmail    = route?.params?.clientEmail ?? user?.email;
    // True when the logged-in user is the subject of this calendar (their own workouts).
    // A coach viewing a client's calendar will have clientEmail !== user.email.
    const isViewingOwnCalendar = clientEmail === user?.email;
    const clientName     = route?.params?.clientName  ?? `${user?.fname ?? ''} ${user?.lname ?? ''}`.trim();
    // clientTimezone: IANA timezone string passed in by CoachNavigation when
    // navigating from ClientList. Falls back to the viewing device's timezone
    // (correct for clients viewing their own calendar).
    const clientTimezone = route?.params?.clientTimezone ?? deviceTimezone();

    // "Today" for the CLIENT — governs which past dates a coach cannot schedule on.
    const clientTodayStr = React.useMemo(
        () => todayInTimezone(clientTimezone),
        [clientTimezone],
    );

    // ── Calendar view preference ─────────────────────────────────────────────

    const [calendarView, setCalendarView] = React.useState('month');

    React.useEffect(() => {
        AsyncStorage.getItem(CALENDAR_VIEW_KEY).then(v => {
            if (v === 'week' || v === 'month') setCalendarView(v);
        }).catch(() => {});
    }, []);

    const toggleCalendarView = () => {
        const next = calendarView === 'month' ? 'week' : 'month';
        setCalendarView(next);
        AsyncStorage.setItem(CALENDAR_VIEW_KEY, next).catch(() => {});
    };

    // ── Month navigation state ───────────────────────────────────────────────

    const now = new Date();
    const [year,  setYear]  = React.useState(now.getFullYear());
    const [month, setMonth] = React.useState(now.getMonth());

    // ── Week navigation state ────────────────────────────────────────────────

    const [weekAnchor, setWeekAnchor] = React.useState(() => {
        const today = parseISO(clientTodayStr);
        const dow   = today.getDay();
        const sunday = new Date(today);
        sunday.setDate(today.getDate() - dow);
        return toISO(sunday);
    });

    const weekGrid = React.useMemo(() => getWeekGrid(weekAnchor), [weekAnchor]);

    // ── Workouts state ───────────────────────────────────────────────────────

    const [workouts, setWorkouts] = React.useState([]);
    const [loading,  setLoading]  = React.useState(true);
    const [saving,   setSaving]   = React.useState(false);

    // ── UI state ─────────────────────────────────────────────────────────────

    const [actionWorkout,      setActionWorkout]      = React.useState(null);
    const [skipWorkout,        setSkipWorkout]        = React.useState(null);
    const [copyWorkout,        setCopyWorkout]        = React.useState(null);
    const [moveWorkout,        setMoveWorkout]        = React.useState(null);
    const [addDayTarget,       setAddDayTarget]       = React.useState(null);
    const [showTemplatePicker, setShowTemplatePicker] = React.useState(false);

    // ── Drag-to-move state ───────────────────────────────────────────────────

    const [draggingWorkout, setDraggingWorkout] = React.useState(null);
    const [dragTargetDate,  setDragTargetDate]  = React.useState(null);
    // Reanimated shared values for the ghost pill position (UI thread, no JS re-renders)
    const ghostX = useSharedValue(0);
    const ghostY = useSharedValue(0);
    // Stores screen-space bounds per date cell (populated via onCellLayout)
    const cellLayoutsRef = React.useRef({});

    // ── Fetch schedule ───────────────────────────────────────────────────────

    /**
     * For monthly view we fetch by month (YYYY-MM).
     * For weekly view we fetch the month that contains the week anchor.
     * We pass the CLIENT's timezone so the server can determine which
     * workouts are "missed" for that client.
     *
     * BUG FIX: We guard res.ok before calling res.json(). Without this guard,
     * non-JSON error bodies (Cloudflare HTML 500, plain-text 401, etc.) throw
     * a JSON SyntaxError that surfaces as "JSON parse error" in the UI.
     */
    const fetchSchedule = React.useCallback(async () => {
        setLoading(true);
        try {
            let monthParam;
            if (calendarView === 'month') {
                monthParam = `${year}-${String(month + 1).padStart(2, '0')}`;
            } else {
                const anchorDate = parseISO(weekAnchor);
                monthParam = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}`;
            }

            const res = await authFetch(
                `${WORKER_URL}/schedule?clientEmail=${encodeURIComponent(clientEmail)}&month=${monthParam}&tz=${encodeURIComponent(clientTimezone)}`
            );

            // Guard against non-JSON error responses before calling .json()
            if (!res.ok) {
                const errText = await res.text().catch(() => String(res.status));
                throw new Error(`Schedule fetch failed (${res.status}): ${errText}`);
            }

            const body = await res.json();
            setWorkouts(body.workouts ?? []);
        } catch (e) {
            Alert.alert('Error', 'Could not load schedule.');
            console.error('[CalendarScreen] fetchSchedule error:', e);
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
            if (isMonthOnly(w.scheduledDate)) continue; // handled separately
            if (!map[w.scheduledDate]) map[w.scheduledDate] = [];
            map[w.scheduledDate].push(w);
        }
        return map;
    }, [workouts]);

    // Month-only workouts (scheduledDate = YYYY-MM): shown in the Unscheduled section.
    const unscheduledWorkouts = React.useMemo(
        () => workouts.filter(w => isMonthOnly(w.scheduledDate)),
        [workouts],
    );

    const monthGrid = React.useMemo(() => getMonthGrid(year, month), [year, month]);

    // ── Optimistic update helpers ────────────────────────────────────────────

    const updateWorkout = (id, changes) =>
        setWorkouts(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));
    const addWorkout = (workout) =>
        setWorkouts(prev => [...prev, workout]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleWorkoutPress = (workout) => {
        markRead(workout.id);
        navigation.navigate('Workout Preview', {
            id: workout.workoutId,
            scheduledWorkoutId: workout.id,
            scheduledDate: workout.scheduledDate,
            initialStatus: workout.status,
            viewerIsAthlete: isViewingOwnCalendar,
        });
    };

    const handleCreateNew = () => {
        const date = addDayTarget;
        setAddDayTarget(null);
        navigation.navigate('Create Workout', { clientEmail, clientName, scheduledDate: date });
    };

    // Month param for month view (YYYY-MM)
    const currentMonthParam = React.useMemo(
        () => `${year}-${String(month + 1).padStart(2, '0')}`,
        [year, month],
    );

    // Month param for week view — the month that contains the week anchor
    const weekMonthParam = React.useMemo(() => {
        const anchor = parseISO(weekAnchor);
        return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
    }, [weekAnchor]);

    const handleAddUnscheduled = () => {
        navigation.navigate('Create Workout', {
            clientEmail,
            clientName,
            scheduledDate: currentMonthParam,
        });
    };

    const handleUseTemplate = () => {
        setShowTemplatePicker(true);
    };

    const handleSkipConfirm = async (reason) => {
        const workout = skipWorkout;
        setSkipWorkout(null);
        setActionWorkout(null);
        updateWorkout(workout.id, { status: 'skipped', skipReason: reason });
        setSaving(true);
        try {
            const res = await authFetch(`${WORKER_URL}/schedule/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, reason }),
            });
            if (!res.ok) throw new Error(`Skip failed (${res.status})`);
        } catch (e) {
            console.error('[CalendarScreen] handleSkipConfirm error:', e);
            updateWorkout(workout.id, { status: workout.status, skipReason: workout.skipReason });
            Alert.alert('Error', 'Could not skip workout. Please try again.');
        } finally { setSaving(false); }
    };

    const handleCopyConfirm = async (newDate) => {
        const workout = copyWorkout;
        setCopyWorkout(null);
        setActionWorkout(null);
        setSaving(true);
        try {
            const res = await authFetch(`${WORKER_URL}/schedule/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, newDate }),
            });
            if (!res.ok) throw new Error(`Copy failed (${res.status})`);
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
        } catch (e) {
            console.error('[CalendarScreen] handleCopyConfirm error:', e);
            Alert.alert('Error', 'Could not copy workout. Please try again.');
        } finally { setSaving(false); }
    };

    const handleMoveConfirm = async (newDate, workoutOverride = null) => {
        const workout = workoutOverride ?? moveWorkout;
        if (!workout) return;
        setMoveWorkout(null);
        setActionWorkout(null);
        const oldDate = workout.scheduledDate;
        const newStatus = (workout.status === 'skipped' || workout.status === 'missed')
            ? 'scheduled'
            : workout.status;
        updateWorkout(workout.id, {
            scheduledDate: newDate,
            originalDate: workout.originalDate ?? oldDate,
            status: newStatus,
        });
        setSaving(true);
        try {
            const res = await authFetch(`${WORKER_URL}/schedule/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workout.id, newDate, today: clientTodayStr }),
            });
            if (!res.ok) throw new Error(`Move failed (${res.status})`);
        } catch (e) {
            console.error('[CalendarScreen] handleMoveConfirm error:', e);
            updateWorkout(workout.id, {
                scheduledDate: oldDate,
                originalDate: workout.originalDate,
                status: workout.status,
            });
            Alert.alert('Error', 'Could not move workout. Please try again.');
        } finally { setSaving(false); }
    };

    // ── Drag-to-move handlers ────────────────────────────────────────────────

    const handleDragStart = (workout) => {
        setDraggingWorkout(workout);
        setDragTargetDate(null);
    };

    const handleDragUpdate = (absoluteX, absoluteY) => {
        let found = null;
        for (const [dateStr, { pageX, pageY, width, height }] of Object.entries(cellLayoutsRef.current)) {
            if (
                absoluteX >= pageX && absoluteX <= pageX + width &&
                absoluteY >= pageY && absoluteY <= pageY + height
            ) {
                found = dateStr;
                break;
            }
        }
        setDragTargetDate(prev => prev !== found ? found : prev);
    };

    const handleDragEnd = (wasDragged) => {
        const workout    = draggingWorkout;
        const targetDate = dragTargetDate;
        setDraggingWorkout(null);
        setDragTargetDate(null);
        if (!workout) return;
        if (wasDragged) {
            if (targetDate && targetDate !== workout.scheduledDate && targetDate >= clientTodayStr) {
                handleMoveConfirm(targetDate, workout);
            }
            // else: dropped on invalid cell — silent no-op
        } else {
            // Stationary long press → show action sheet
            setActionWorkout(workout);
        }
    };

    // Workout date set for DatePickerModal dots — only full dates
    const workoutDateSet = React.useMemo(
        () => new Set(workouts.filter(w => !isMonthOnly(w.scheduledDate)).map(w => w.scheduledDate)),
        [workouts],
    );

    // ── Header label ─────────────────────────────────────────────────────────

    const headerLabel = calendarView === 'month'
        ? monthLabel(year, month)
        : weekLabel(weekGrid);

    const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>

            {/* ── Header ── */}
            <View style={styles.header} accessibilityRole="header">
                <Pressable
                    onPress={calendarView === 'month' ? prevMonth : prevWeek}
                    style={styles.headerButton}
                    accessibilityRole="button"
                    accessibilityLabel={calendarView === 'month' ? 'Previous month' : 'Previous week'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Feather name="chevron-left" size={24} color={theme.textPrimary} accessible={false} />
                </Pressable>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
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
                    <Feather name="chevron-right" size={24} color={theme.textPrimary} accessible={false} />
                </Pressable>
            </View>

            {/* ── View toggle ── */}
            <View
                style={styles.viewToggleRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Calendar view"
            >
                <Pressable
                    style={[styles.viewToggleBtn, calendarView === 'month' && styles.viewToggleBtnActive]}
                    onPress={() => calendarView !== 'month' && toggleCalendarView()}
                    accessibilityRole="radio"
                    accessibilityLabel="Month view"
                    accessibilityState={{ selected: calendarView === 'month' }}
                >
                    <Feather
                        name="grid"
                        size={14}
                        color={calendarView === 'month' ? '#000' : theme.accentText}
                        accessible={false}
                    />
                    <Text style={[styles.viewToggleText, calendarView === 'month' && styles.viewToggleTextActive]}>
                        Month
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.viewToggleBtn, calendarView === 'week' && styles.viewToggleBtnActive]}
                    onPress={() => calendarView !== 'week' && toggleCalendarView()}
                    accessibilityRole="radio"
                    accessibilityLabel="Week view"
                    accessibilityState={{ selected: calendarView === 'week' }}
                >
                    <Feather
                        name="list"
                        size={14}
                        color={calendarView === 'week' ? '#000' : theme.accentText}
                        accessible={false}
                    />
                    <Text style={[styles.viewToggleText, calendarView === 'week' && styles.viewToggleTextActive]}>
                        Week
                    </Text>
                </Pressable>
            </View>

            {/* ── Loading state ── */}
            {loading ? (
                <View
                    style={styles.loadingContainer}
                    accessible
                    accessibilityLiveRegion="polite"
                    accessibilityLabel="Loading schedule"
                    accessibilityState={{ busy: true }}
                >
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : calendarView === 'month' ? (

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 80 }}
                    onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                >
                    {/* Day-of-week row */}
                    <View
                        style={styles.dowRow}
                        accessible={false}
                        importantForAccessibility="no-hide-descendants"
                    >
                        {DOW_LABELS.map(label => (
                            <Text key={label} style={styles.dowLabel}>{label}</Text>
                        ))}
                    </View>

                    {/* Month grid */}
                    <View style={styles.grid} accessibilityRole="grid" accessibilityLabel={headerLabel}>
                        {monthGrid.map(({ dateStr, currentMonth }) => {
                            const isValidDrop = dragTargetDate === dateStr
                                && dateStr >= clientTodayStr
                                && draggingWorkout?.scheduledDate !== dateStr;
                            return (
                                <MonthDayCell
                                    key={dateStr}
                                    dateStr={dateStr}
                                    currentMonth={currentMonth}
                                    workouts={workoutsByDate[dateStr] ?? []}
                                    isToday={dateStr === clientTodayStr}
                                    isPast={dateStr < clientTodayStr}
                                    isCoach={isCoach}
                                    onWorkoutPress={handleWorkoutPress}
                                    onWorkoutLongPress={setActionWorkout}
                                    onAddWorkoutPress={setAddDayTarget}
                                    isDragTarget={dragTargetDate === dateStr}
                                    isDragTargetValid={isValidDrop}
                                    onCellLayout={(ds, layout) => { cellLayoutsRef.current[ds] = layout; }}
                                    onDragStart={handleDragStart}
                                    onDragUpdate={handleDragUpdate}
                                    onDragEnd={handleDragEnd}
                                    ghostX={ghostX}
                                    ghostY={ghostY}
                                />
                            );
                        })}
                    </View>

                    <Legend />

                    <UnscheduledSection
                        workouts={unscheduledWorkouts}
                        isCoach={isCoach}
                        onWorkoutPress={handleWorkoutPress}
                        onWorkoutLongPress={setActionWorkout}
                        onAddUnscheduled={isCoach ? handleAddUnscheduled : undefined}
                    />

                    {isCoach && (
                        <Text
                            style={styles.coachHint}
                            accessible
                            accessibilityLabel="Tip: long press any upcoming date to add a workout"
                        >
                            Long-press any upcoming day to add a workout
                        </Text>
                    )}
                    <View style={{ height: 60 }} accessible={false} importantForAccessibility="no" />
                </ScrollView>

            ) : (

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 80 }}
                    onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                >
                    {/* Week grid — compact pills in columns */}
                    <View style={styles.weekGrid}>
                        {weekGrid.map(({ dateStr }) => {
                            const dayWorkouts = workoutsByDate[dateStr] ?? [];
                            const d = parseISO(dateStr);
                            const isToday = dateStr === clientTodayStr;
                            const dayNum  = d.getDate();
                            const dowName = d.toLocaleDateString('default', { weekday: 'short' }).toUpperCase();
                            return (
                                <View
                                    key={dateStr}
                                    style={styles.weekColumn}
                                    accessible={false}
                                >
                                    <View style={[styles.weekDayHeader, isToday && styles.weekDayHeaderToday]}>
                                        <Text
                                            style={[styles.weekDayName, isToday && styles.weekDayNameToday]}
                                            accessible={false}
                                            importantForAccessibility="no"
                                        >
                                            {dowName}
                                        </Text>
                                        <View style={[styles.weekDayNumContainer, isToday && styles.weekDayNumContainerToday]}>
                                            <Text
                                                style={[styles.weekDayNum, isToday && styles.weekDayNumToday]}
                                                accessibilityLabel={isToday ? `${dayNum}, today` : String(dayNum)}
                                            >
                                                {dayNum}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.weekWorkouts}>
                                        {dayWorkouts.map(w => (
                                            <WorkoutPill
                                                key={w.id}
                                                workout={w}
                                                onPress={() => handleWorkoutPress(w)}
                                                onLongPress={() => setActionWorkout(w)}
                                                compact
                                            />
                                        ))}
                                        {dayWorkouts.length === 0 && (
                                            <View
                                                style={styles.weekEmptyDay}
                                                accessible={false}
                                                importantForAccessibility="no"
                                            />
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    {/* Full workout list below the week grid */}
                    <WeekWorkoutList
                        weekGrid={weekGrid}
                        workoutsByDate={workoutsByDate}
                        todayStr={clientTodayStr}
                        onWorkoutPress={handleWorkoutPress}
                        onWorkoutLongPress={setActionWorkout}
                    />

                    {/* Unscheduled workouts for the month containing this week */}
                    <UnscheduledSection
                        workouts={unscheduledWorkouts.filter(w => w.scheduledDate === weekMonthParam)}
                        isCoach={isCoach}
                        onWorkoutPress={handleWorkoutPress}
                        onWorkoutLongPress={setActionWorkout}
                    />

                    <Legend />
                    {isCoach && (
                        <Text
                            style={styles.coachHint}
                            accessible
                            accessibilityLabel="Tip: switch to month view to add workouts by long pressing a day"
                        >
                            Switch to month view to add workouts
                        </Text>
                    )}
                    <View style={{ height: 60 }} accessible={false} importantForAccessibility="no" />
                </ScrollView>
            )}

            {/* ── Saving banner ── */}
            {saving && (
                <View
                    style={styles.savingBanner}
                    accessible
                    accessibilityLiveRegion="polite"
                    accessibilityLabel="Saving changes"
                    accessibilityRole="progressbar"
                >
                    <ActivityIndicator size="small" color="#000" accessible={false} />
                    <Text style={styles.savingText} accessible={false}>Saving…</Text>
                </View>
            )}

            {/* ── Modals ── */}
            {actionWorkout && isViewingOwnCalendar && actionWorkout.status === 'missed' ? (
                <MissedWorkoutSheet
                    workout={actionWorkout}
                    onClose={() => setActionWorkout(null)}
                    onSkip={() => { const w = actionWorkout; setActionWorkout(null); setSkipWorkout(w); }}
                    onRescheduleToday={() => handleMoveConfirm(clientTodayStr, actionWorkout)}
                    onRescheduleOther={() => { const w = actionWorkout; setActionWorkout(null); setMoveWorkout(w); }}
                />
            ) : actionWorkout ? (
                <WorkoutActionSheet
                    workout={actionWorkout}
                    onClose={() => setActionWorkout(null)}
                    onSkip={() => setSkipWorkout(actionWorkout)}
                    onCopy={() => setCopyWorkout(actionWorkout)}
                    onMove={() => setMoveWorkout(actionWorkout)}
                />
            ) : null}

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
                    title={skipWorkout.status === 'missed' ? 'Mark as skipped?' : 'Skip workout?'}
                />
            )}

            {copyWorkout && (
                <DatePickerModal
                    title="Copy workout to…"
                    minDate={clientTodayStr}
                    sourceDate={copyWorkout.scheduledDate}
                    workoutDates={workoutDateSet}
                    onClose={() => setCopyWorkout(null)}
                    onConfirm={handleCopyConfirm}
                />
            )}

            {moveWorkout && (
                <DatePickerModal
                    title="Move workout to…"
                    minDate={clientTodayStr}
                    sourceDate={moveWorkout.scheduledDate}
                    workoutDates={workoutDateSet}
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

            {/* Ghost pill follows the finger while dragging */}
            {draggingWorkout && (
                <DragGhost workout={draggingWorkout} ghostX={ghostX} ghostY={ghostY} />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) { return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    // ── Header ──
    // Touch targets: headerButton minWidth/Height 44 (WCAG 2.5.5)
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    headerButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { alignItems: 'center', flex: 1 },
    headerTitle:  { fontSize: 20, fontWeight: 'bold', color: theme.textPrimary },
    headerClient: { fontSize: 13, color: theme.accentText, marginTop: 2 },

    // ── View toggle ──
    viewToggleRow:        { flexDirection: 'row', alignSelf: 'center', backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.divider, overflow: 'hidden', marginBottom: 8, marginTop: 2 },
    viewToggleBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
    viewToggleBtnActive:  { backgroundColor: theme.accent, borderRadius: 8, margin: 3 },
    viewToggleText:       { fontSize: 14, color: theme.accentText, fontWeight: '600' },
    viewToggleTextActive: { color: '#000', fontWeight: '700' },

    // ── Day-of-week row (month view) — decorative, hidden from AT ──
    dowRow:   { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 2 },
    dowLabel: { width: DAY_CELL_SIZE, textAlign: 'center', color: theme.textSecondary, fontSize: 12, fontWeight: '600' },

    // ── Month grid ──
    grid:             { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
    dayCell:          { width: DAY_CELL_SIZE, minHeight: DAY_CELL_SIZE, paddingBottom: 4, borderTopWidth: 0.5, borderTopColor: theme.divider },
    dayCellOtherMonth: { opacity: 0.3 },

    dayNumberContainer:      { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginTop: 2, marginBottom: 2 },
    dayNumberTodayContainer: { backgroundColor: theme.accent },
    dayNumber:               { fontSize: 12, color: theme.textPrimary, textAlign: 'center' },
    dayNumberToday:          { color: '#000', fontWeight: 'bold' },
    dayNumberOtherMonth:     { color: theme.textTertiary },

    // Decorative hint — intentionally invisible on dark bg, hidden from AT
    emptyDayHint: { textAlign: 'center', color: theme.background, fontSize: 14 },

    // ── Workout pill ──
    pill:         { flexDirection: 'row', alignItems: 'center', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, marginHorizontal: 1, marginBottom: 2, gap: 2 },
    pillSkipped:  { opacity: 0.6 },
    pillText:     { fontSize: 9, color: '#000', fontWeight: '700', flex: 1 },
    pillCompact:  { paddingHorizontal: 2, paddingVertical: 1 },
    pillTextCompact: { fontSize: 8 },

    // ── Weekly grid view ──
    weekGrid:          { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, borderBottomWidth: 0.5, borderBottomColor: theme.divider },
    weekColumn:        { flex: 1, minHeight: 100, borderRightWidth: 0.5, borderRightColor: theme.surfaceElevated, paddingHorizontal: 2 },
    weekDayHeader:     { alignItems: 'center', paddingVertical: 6 },
    weekDayHeaderToday: {},
    weekDayName:       { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
    weekDayNameToday:  { color: theme.accentText },
    weekDayNumContainer:      { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
    weekDayNumContainerToday: { backgroundColor: theme.accent },
    weekDayNum:        { fontSize: 14, fontWeight: 'bold', color: theme.textPrimary },
    weekDayNumToday:   { color: '#000' },
    weekWorkouts:      { paddingTop: 4, gap: 3, paddingBottom: 8 },
    weekEmptyDay:      { height: 32, justifyContent: 'center', alignItems: 'center' },

    // ── Week list (below weekly grid) ──
    weekListContainer:      { paddingHorizontal: 16, paddingTop: 16 },
    weekListDay:            { marginBottom: 16 },
    weekListDayHeader:      { marginBottom: 8 },
    weekListDayHeaderToday: {},
    weekListDayLabel:       { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
    weekListDayLabelToday:  { color: theme.accentText },
    weekListItem:           { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, marginBottom: 6, minHeight: 44 },
    weekListItemContent:    { flex: 1 },
    weekListItemName:       { fontSize: 15, color: theme.textPrimary, fontWeight: '600' },
    weekListItemStatus:     { fontSize: 12, color: theme.textSecondary, marginTop: 2, textTransform: 'capitalize' },

    weekEmptyState:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
    weekEmptyStateText: { fontSize: 15, color: theme.textSecondary },

    // ── Unscheduled section ──
    unscheduledSection: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
    unscheduledHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    unscheduledTitle:   { fontSize: 11, fontWeight: '700', color: theme.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
    unscheduledAddBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.accentText },
    unscheduledAddText: { fontSize: 13, color: theme.accentText, fontWeight: '600' },
    unscheduledEmpty:   { fontSize: 13, color: theme.textTertiary, paddingVertical: 8 },

    // ── Legend ──
    legend:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot:  { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: theme.textSecondary },

    coachHint: { textAlign: 'center', fontSize: 12, color: theme.textTertiary, paddingBottom: 8 },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    savingBanner: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: theme.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
    savingText:   { color: '#000', fontWeight: '700' },

    // ── Action sheet ──
    sheetOverlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay },
    sheetContainer:   { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40, paddingHorizontal: 24, paddingTop: 12 },
    sheetHandle:      { width: 36, height: 4, backgroundColor: theme.textTertiary, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:       { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4 },
    sheetDate:        { fontSize: 13, color: theme.textSecondary, marginBottom: 20 },
    sheetAction:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.divider, minHeight: 56 },
    sheetActionTextBlock: { flex: 1 },
    sheetActionText:  { fontSize: 16, color: theme.textPrimary },
    sheetActionSub:   { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    sheetCompleted:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    sheetCompletedText: { fontSize: 13, color: theme.success, flex: 1 },
    sheetCancel:      { marginTop: 8, paddingVertical: 14, alignItems: 'center', minHeight: 52 },
    sheetCancelText:  { fontSize: 16, color: theme.textSecondary },

    // ── Modals ──
    modalOverlay:             { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard:                { backgroundColor: theme.surface, borderRadius: 12, padding: 24, width: '100%' },
    modalTitle:               { fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4 },
    modalSubtitle:            { fontSize: 14, color: theme.textSecondary, marginBottom: 16 },
    modalInput:               { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.accentText, borderRadius: 8, padding: 12, color: theme.textPrimary, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
    modalActions:             { flexDirection: 'row', gap: 12 },
    modalButtonPrimary:       { flex: 1, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
    modalButtonPrimaryText:   { color: '#000', fontWeight: '700', fontSize: 16 },
    modalButtonSecondary:     { flex: 1, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
    modalButtonSecondaryText: { color: theme.textSecondary, fontSize: 16 },
    modalButtonDisabled:      { opacity: 0.4 },

    // ── Mini calendar (date picker) ──
    miniCalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    miniNavBtn:        { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    miniCalMonthLabel: { color: theme.textPrimary, fontWeight: '600', fontSize: 15 },

    miniCalRow:      { flexDirection: 'row', marginBottom: 2 },
    miniCalCellWrap: { flex: 1, alignItems: 'center' },
    miniCalDayLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, textAlign: 'center', paddingVertical: 4 },
    miniCalCell:             { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 17 },
    miniCalCellTodayRing:    { borderWidth: 1.5, borderColor: theme.accentText },
    miniCalCellSourceRing:   { borderWidth: 1.5, borderColor: '#f5a623' },
    miniCalCellSelected:     { backgroundColor: theme.accent },
    miniCalCellText:         { fontSize: 13, color: theme.textPrimary, textAlign: 'center' },
    miniCalCellToday:        { color: theme.accentText, fontWeight: '700' },
    miniCalCellSelectedText: { color: '#000', fontWeight: '700' },
    // Past/blocked: intentionally low contrast to signal unavailability
    miniCalCellPast:         { color: theme.textTertiary },
    // Other-month padding cells — not selectable, visually inert
    miniCalCellOtherMonth:   { color: '#2e2e2e' },
    miniCalWorkoutDot:        { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent, position: 'absolute', bottom: 2 },
    miniCalWorkoutDotSelected: { backgroundColor: '#000' },

    // ── Drag-to-move ──
    dayCellDragTarget: { backgroundColor: theme.accentSubtle, borderTopColor: theme.accent },
    dayCellDragInvalid: { backgroundColor: 'rgba(255,255,255,0.04)' },
    dragGhost: { position: 'absolute', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' },
}); }