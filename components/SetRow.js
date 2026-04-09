/**
 * SetRow.js — updated with optional set badge, coach rec as helper text,
 * client-side validation (no weight ranges, RPE must be number).
 */
import * as React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { enqueueRecord } from '../utils/WorkoutSync';

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
    const isTimed = countType === 'Timed';
    const isAMRAP = countType === 'AMRAP';
    const isReps  = countType === 'Reps';

    const defaultCount = isTimed
        ? (countMin != null ? String(countMin) : '')
        : isReps ? (countMin != null ? String(countMin) : '') : '';

    const [weight, setWeight] = React.useState('');
    const [count,  setCount]  = React.useState(defaultCount);
    const [rpe,    setRpe]    = React.useState('');
    const [note,   setNote]   = React.useState('');
    const [saved,  setSaved]  = React.useState(false);

    // Validation errors for client entries
    const [weightError, setWeightError] = React.useState(null);
    const [rpeError,    setRpeError]    = React.useState(null);

    const validateWeight = (val) => {
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
        if (!weight && !count && !rpe && !note) return;

        const record = {
            dateTime:      new Date().toISOString(),
            clientId,
            workoutId,
            exerciseId,
            set:           setNumber,
            weight:        weight ? parseFloat(weight) : null,
            weightUnit:    unitDefault ?? 'lbs',
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
                    <Feather name="info" size={11} color="#fba8a0" style={{ marginRight: 5 }} />
                    <Text style={styles.recText}>
                        Coach rec:{recommendedWeight ? ` ${recommendedWeight} ${unitDefault ?? 'lbs'}` : ''}{recommendedRpe ? `  ·  RPE ${recommendedRpe}` : ''}
                    </Text>
                </View>
            )}

            <View style={styles.setInputs}>
                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>Wt ({unitDefault ?? 'lbs'})</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved, weightError && styles.setInputError]}
                        value={weight}
                        onChangeText={(v) => { setWeight(v); if (weightError) validateWeight(v); }}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                        returnKeyType="next"
                    />
                    {weightError && <Text style={styles.inputError}>{weightError}</Text>}
                </View>

                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>{countLabel}</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved, isTimed && !saved && count === defaultCount && count !== '' && styles.setInputPrefilled]}
                        value={count}
                        onChangeText={setCount}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#666"
                        keyboardType="number-pad"
                        returnKeyType="next"
                    />
                </View>

                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>RPE</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved, rpeError && styles.setInputError]}
                        value={rpe}
                        onChangeText={(v) => { setRpe(v); if (rpeError) validateRpe(v); }}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                        returnKeyType="done"
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
                placeholderTextColor="#666"
                multiline
            />

            {saved && (
                <View style={styles.savedBadge}>
                    <Feather name="check" size={10} color="#7bb533" />
                    <Text style={styles.savedBadgeText}>Saved locally</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    setRow:         { borderTopWidth: 0.5, borderTopColor: '#222', paddingTop: 8, paddingBottom: 4, marginBottom: 4 },
    setRowOptional: { borderTopColor: '#1a1a1a', opacity: 0.8 },
    setHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    setLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    setLabel:       { fontSize: 12, color: '#fba8a0', fontWeight: '700' },
    setLabelOptional: { color: '#777' },
    optionalBadge:  { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    optionalBadgeText: { fontSize: 10, color: '#777', fontStyle: 'italic' },
    prescriptionLabel: { fontSize: 11, color: '#888', fontStyle: 'italic' },

    recRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    recText:   { fontSize: 11, color: '#fba8a0', fontStyle: 'italic' },

    setInputs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    setInputGroup: { flex: 1, alignItems: 'center' },
    setInputLabel: { fontSize: 10, color: '#bbb', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
    setInput:      { width: '100%', height: 38, borderWidth: 1, borderColor: '#333', borderRadius: 6, backgroundColor: '#1a1a1a', color: '#fae9e9', textAlign: 'center', fontSize: 15 },
    setInputSaved: { borderColor: '#7bb533' },
    setInputPrefilled: { borderColor: '#fba8a0', borderStyle: 'dashed' },
    setInputError: { borderColor: '#fba8a0' },
    inputError:    { fontSize: 10, color: '#fba8a0', marginTop: 2, textAlign: 'center' },

    setNoteInput: { borderWidth: 1, borderColor: '#333', borderRadius: 6, backgroundColor: '#1a1a1a', color: '#fae9e9', padding: 8, fontSize: 13, minHeight: 34 },
    savedBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
    savedBadgeText: { fontSize: 10, color: '#7bb533' },
});