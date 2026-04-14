/**
 * SetRow.js — updated with optional set badge, coach rec as helper text,
 * client-side validation (no weight ranges, RPE must be number),
 * and per-exercise weight unit selector (lbs / kg / other free-text).
 */
import * as React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { enqueueRecord } from '../utils/WorkoutSync';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

/** Normalise 'imperial'/'metric' from the JWT to 'lbs'/'kg'. */
function resolveUnit(raw) {
    if (raw === 'imperial') return 'lbs';
    if (raw === 'metric')   return 'kg';
    if (raw === 'lbs' || raw === 'kg') return raw;
    return null; // anything else is treated as a custom "other" string
}

export default function SetRow({
    setNumber,
    isOptional,
    exerciseId,
    workoutId,
    clientId,
    unitDefault,
    countType,
    countMin,
    countMax,
    timeCapSeconds,
    recommendedWeight,  // string, may be a range like "135–155" — used as placeholder/hint only
    recommendedRpe,     // number — used as placeholder/hint only
    onSave,
}) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const { authFetch } = useAuth();

    const isTimed = countType === 'Timed';
    const isAMRAP = countType === 'AMRAP';
    const isReps  = countType === 'Reps';

    const profileUnit = resolveUnit(unitDefault) ?? 'lbs';

    const defaultCount = (isTimed || isReps) && countMin != null ? String(countMin) : '';

    // Pre-fill weight from coach recommendation if it's a single number (not a range)
    const defaultWeight = React.useMemo(() => {
        if (!recommendedWeight) return '';
        const trimmed = String(recommendedWeight).trim();
        // Only pre-fill if it's a plain number (not a range like "135-155")
        if (/^[\d.]+$/.test(trimmed)) return trimmed;
        return '';
    }, [recommendedWeight]);

    // Pre-fill RPE from coach recommendation
    const defaultRpe = recommendedRpe != null ? String(recommendedRpe) : '';

    const [weight,     setWeight]     = React.useState(defaultWeight);
    const [count,      setCount]      = React.useState(defaultCount);
    const [rpe,        setRpe]        = React.useState(defaultRpe);
    const [note,       setNote]       = React.useState('');
    const [saved,      setSaved]      = React.useState(false);
    const [weightUnit, setWeightUnit] = React.useState(profileUnit); // 'lbs' | 'kg' | 'other'
    const [otherLoad,  setOtherLoad]  = React.useState(''); // free text when unit === 'other'

    // Validation errors for client entries
    const [weightError, setWeightError] = React.useState(null);
    const [rpeError,    setRpeError]    = React.useState(null);

    // Fetch the last-used weight unit for this exercise so we can default to it
    React.useEffect(() => {
        if (!clientId || !exerciseId || !authFetch) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(
                    `${WORKER_URL}/history/exercise-summary?clientEmail=${encodeURIComponent(clientId)}&exerciseId=${encodeURIComponent(exerciseId)}`
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
                    // e.g. "red band" — restore as 'other' with the text pre-filled
                    setWeightUnit('other');
                    setOtherLoad(lastUnit);
                }
            } catch {
                // non-fatal — profile default stands
            }
        })();
        return () => { cancelled = true; };
    }, [clientId, exerciseId]);

    const validateWeight = (val) => {
        if (weightUnit === 'other') { setWeightError(null); return true; }
        if (!val) { setWeightError(null); return true; }
        // Reject anything with a dash/range in it
        if (/–|-/.test(val)) { setWeightError('Enter a single number, not a range'); return false; }
        if (isNaN(parseFloat(val))) { setWeightError('Weight must be a number'); return false; }
        setWeightError(null);
        return true;
    };

    const validateRpe = (val) => {
        if (!val) { setRpeError(null); return true; }
        const n = parseFloat(val);
        if (isNaN(n)) { setRpeError('RPE must be a number (e.g. 7 or 7.5)'); return false; }
        if (n < 1 || n > 10) { setRpeError('RPE must be between 1 and 10'); return false; }
        setRpeError(null);
        return true;
    };

    const handleBlurSave = () => {
        const wOk = validateWeight(weight);
        const rOk = validateRpe(rpe);
        if (!wOk || !rOk) return;

        const weightVal = weightUnit === 'other' ? otherLoad : weight;
        if (!weightVal && !count && !rpe && !note) return;

        const record = {
            dateTime:      new Date().toISOString(),
            clientId,
            workoutId,
            exerciseId,
            set:           setNumber,
            weight:        (weightUnit !== 'other' && weight) ? parseFloat(weight) : null,
            weightUnit:    weightUnit === 'other' ? (otherLoad || null) : weightUnit,
            reps:          (!isTimed && count) ? parseInt(count) : null,
            rpe:           rpe ? parseFloat(rpe) : null,
            note:          note || null,
            countType:     countType ?? null,
            prescribed:    countMin ?? null,
            prescribedMax: countMax ?? null,
            unit:          isTimed ? 'seconds' : 'reps',
            ...(isTimed && count ? { reps: parseInt(count) } : {}),
        };

        enqueueRecord(record);
        onSave?.(record);
        setSaved(true);
    };

    const countLabel       = isTimed ? 'Sec done' : isAMRAP ? 'Reps (AMRAP)' : 'Reps done';
    const prescriptionLabel = (() => {
        if (!countType) return null;
        if (isReps)  return countMax ? `${countMin}–${countMax} reps` : countMin ? `${countMin} reps` : null;
        if (isTimed) return countMax ? `${countMin}–${countMax} sec`  : countMin ? `${countMin} sec`  : null;
        if (isAMRAP) return timeCapSeconds ? `AMRAP · ${Math.round(timeCapSeconds / 60)} min cap` : 'AMRAP · no time cap';
        return null;
    })();

    return (
        <View style={[styles.setRow, isOptional && styles.setRowOptional]}>
            <View style={styles.setHeader}>
                <View style={styles.setLabelRow}>
                    <Text style={[styles.setLabel, isOptional && styles.setLabelOptional]}>
                        Set {setNumber}
                    </Text>
                    {isOptional && (
                        <View style={styles.optionalBadge}>
                            <Text style={styles.optionalBadgeText}>optional</Text>
                        </View>
                    )}
                </View>
                {prescriptionLabel && (
                    <Text style={styles.prescriptionLabel}>{prescriptionLabel}</Text>
                )}
            </View>

            {/* Recommendations as helper text */}
            {(recommendedWeight || recommendedRpe) && !saved && (
                <View style={styles.recRow}>
                    <Feather name="info" size={11} color={theme.accent} style={{ marginRight: 5 }} />
                    <Text style={styles.recText}>
                        Coach rec:{recommendedWeight ? ` ${recommendedWeight}${weightUnit !== 'other' ? ` ${weightUnit}` : ''}` : ''}{recommendedRpe ? `  ·  RPE ${recommendedRpe}` : ''}
                    </Text>
                </View>
            )}

            {/* Weight unit selector */}
            {!saved && (
                <View style={styles.unitRow}>
                    {['lbs', 'kg', 'other'].map(u => (
                        <Pressable
                            key={u}
                            style={[styles.unitPill, weightUnit === u && styles.unitPillActive]}
                            onPress={() => setWeightUnit(u)}
                        >
                            <Text style={[styles.unitPillText, weightUnit === u && styles.unitPillTextActive]}>
                                {u}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}

            <View style={styles.setInputs}>
                {/* Weight / Load column */}
                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>
                        {weightUnit === 'other' ? 'Load' : `Wt (${weightUnit})`}
                    </Text>
                    <TextInput
                        style={[
                            styles.setInput,
                            saved && styles.setInputSaved,
                            weightError && styles.setInputError,
                            weightUnit === 'other' && styles.setInputOther,
                            !saved && weightUnit !== 'other' && weight !== '' && weight === defaultWeight && styles.setInputPrefilled,
                        ]}
                        value={weightUnit === 'other' ? otherLoad : weight}
                        onChangeText={weightUnit === 'other'
                            ? setOtherLoad
                            : (v) => { setWeight(v); if (weightError) validateWeight(v); }
                        }
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType={weightUnit === 'other' ? 'default' : 'decimal-pad'}
                        returnKeyType="next"
                        editable={!saved}
                        autoCapitalize="none"
                    />
                    {weightError && <Text style={styles.inputError}>{weightError}</Text>}
                </View>

                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>{countLabel}</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved, !saved && count !== '' && count === defaultCount && styles.setInputPrefilled]}
                        value={count}
                        onChangeText={setCount}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="number-pad"
                        returnKeyType="next"
                        editable={!saved}
                    />
                </View>

                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>RPE</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved, rpeError && styles.setInputError, !saved && rpe !== '' && rpe === defaultRpe && styles.setInputPrefilled]}
                        value={rpe}
                        onChangeText={(v) => { setRpe(v); if (rpeError) validateRpe(v); }}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        editable={!saved}
                    />
                    {rpeError && <Text style={styles.inputError}>{rpeError}</Text>}
                </View>
            </View>

            <TextInput
                style={[styles.setNoteInput, saved && styles.setInputSaved]}
                value={note}
                onChangeText={setNote}
                onBlur={handleBlurSave}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textSecondary}
                multiline
                editable={!saved}
            />

            {saved && (
                <View style={styles.savedBadge}>
                    <Feather name="check" size={10} color={theme.success} />
                    <Text style={styles.savedBadgeText}>Saved locally</Text>
                </View>
            )}
        </View>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        setRow:         { borderTopWidth: 0.5, borderTopColor: theme.surfaceBorder, paddingTop: 8, paddingBottom: 4, marginBottom: 4 },
        setRowOptional: { borderTopColor: theme.surfaceElevated, opacity: 0.8 },
        setHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
        setLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
        setLabel:       { fontSize: 12, color: theme.accent, fontWeight: '700' },
        setLabelOptional: { color: theme.textTertiary },
        optionalBadge:  { backgroundColor: theme.surfaceElevated, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
        optionalBadgeText: { fontSize: 10, color: theme.textTertiary, fontStyle: 'italic' },
        prescriptionLabel: { fontSize: 11, color: theme.textSecondary, fontStyle: 'italic' },

        recRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
        recText:   { fontSize: 11, color: theme.accent, fontStyle: 'italic' },

        unitRow:          { flexDirection: 'row', gap: 5, marginBottom: 6 },
        unitPill:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceElevated },
        unitPillActive:   { borderColor: theme.accent, backgroundColor: theme.accentSubtle },
        unitPillText:     { fontSize: 10, color: theme.textSecondary, textTransform: 'lowercase', letterSpacing: 0.3 },
        unitPillTextActive: { color: theme.accent, fontWeight: '600' },

        setInputs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
        setInputGroup: { flex: 1, alignItems: 'center' },
        setInputLabel: { fontSize: 10, color: theme.textSecondary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
        setInput:      { width: '100%', height: 38, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 6, backgroundColor: theme.surfaceElevated, color: theme.textPrimary, textAlign: 'center', fontSize: 15 },
        setInputOther: { fontSize: 12 },
        setInputSaved: { borderColor: theme.success },
        setInputPrefilled: { borderColor: theme.accent, borderStyle: 'dashed' },
        setInputError: { borderColor: theme.accent },
        inputError:    { fontSize: 10, color: theme.accent, marginTop: 2, textAlign: 'center' },

        setNoteInput: { borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 6, backgroundColor: theme.surfaceElevated, color: theme.textPrimary, padding: 8, fontSize: 13, minHeight: 34 },
        savedBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
        savedBadgeText: { fontSize: 10, color: theme.success },
    });
}
