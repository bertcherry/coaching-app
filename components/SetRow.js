/**
 * SetRow.js
 * Location: components/SetRow.js
 *
 * Drop-in replacement for the inline SetRow in WorkoutPreview.js.
 * Extract this into its own file and import it there.
 *
 * Handles all three countType cases:
 *   Reps  — auto-populates countMin, client can override, records actual reps done
 *   Timed — auto-populates countMin (prescribed seconds), client can override
 *   AMRAP — reps field is blank (client records how many they got)
 *
 * History record shape (matches updated history table):
 *   id, dateTime, clientId, workoutId, exerciseId, set,
 *   weight, weightUnit, reps, rpe, note,
 *   countType, prescribed, prescribedMax, unit
 */

import * as React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { enqueueRecord } from '../utils/WorkoutSync';

export default function SetRow({
    setNumber,
    exerciseId,
    workoutId,
    clientId,
    unitDefault,
    countType,      // 'Reps' | 'Timed' | 'AMRAP'
    countMin,       // prescribed value (or range min) — used to auto-populate
    countMax,       // range max, null if single value
    timeCapSeconds, // AMRAP cap, null if none
    onSave,
}) {
    const isTimed = countType === 'Timed';
    const isAMRAP = countType === 'AMRAP';
    const isReps  = countType === 'Reps';

    // Auto-populate the count field with the prescribed value
    const defaultCount = isTimed
        ? (countMin != null ? String(countMin) : '')
        : isReps
            ? (countMin != null ? String(countMin) : '')
            : ''; // AMRAP starts blank — client records what they got

    const [weight, setWeight]   = React.useState('');
    const [count, setCount]     = React.useState(defaultCount);
    const [rpe, setRpe]         = React.useState('');
    const [note, setNote]       = React.useState('');
    const [saved, setSaved]     = React.useState(false);

    const handleBlurSave = () => {
        if (!weight && !count && !rpe && !note) return;

        const record = {
            dateTime:       new Date().toISOString(),
            clientId,
            workoutId,
            exerciseId,
            set:            setNumber,
            weight:         weight ? parseFloat(weight) : null,
            weightUnit:     unitDefault ?? 'lbs',
            // reps column stores what they actually did
            reps:           (!isTimed && count) ? parseInt(count) : null,
            rpe:            rpe ? parseFloat(rpe) : null,
            note:           note || null,
            // prescription context for ML layer later
            countType:      countType ?? null,
            prescribed:     countMin ?? null,
            prescribedMax:  countMax ?? null,
            unit:           isTimed ? 'seconds' : 'reps',
            // for timed exercises, store actual seconds in reps column too
            // (reusing reps as "count done" regardless of unit)
            ...(isTimed && count ? { reps: parseInt(count) } : {}),
        };

        enqueueRecord(record);
        onSave?.(record);
        setSaved(true);
    };

    // Label for the count field varies by type
    const countLabel = isTimed ? 'Sec done' : isAMRAP ? 'Reps (AMRAP)' : 'Reps done';

    // Show prescribed info above the row as context
    const prescriptionLabel = (() => {
        if (!countType) return null;
        if (isReps) {
            if (countMax) return `Prescribed: ${countMin}–${countMax} reps`;
            if (countMin) return `Prescribed: ${countMin} reps`;
        }
        if (isTimed) {
            if (countMax) return `Prescribed: ${countMin}–${countMax} sec`;
            if (countMin) return `Prescribed: ${countMin} sec`;
        }
        if (isAMRAP) {
            return timeCapSeconds
                ? `AMRAP · ${Math.round(timeCapSeconds / 60)} min cap`
                : 'AMRAP · no time cap';
        }
        return null;
    })();

    return (
        <View style={styles.setRow}>
            <View style={styles.setHeader}>
                <Text style={styles.setLabel}>Set {setNumber}</Text>
                {prescriptionLabel && (
                    <Text style={styles.prescriptionLabel}>{prescriptionLabel}</Text>
                )}
            </View>

            <View style={styles.setInputs}>
                {/* Weight — always shown */}
                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>
                        Wt ({unitDefault ?? 'lbs'})
                    </Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved]}
                        value={weight}
                        onChangeText={setWeight}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#555"
                        keyboardType="decimal-pad"
                        returnKeyType="next"
                    />
                </View>

                {/* Count (reps or seconds) — label and default vary by type */}
                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>{countLabel}</Text>
                    <TextInput
                        style={[
                            styles.setInput,
                            saved && styles.setInputSaved,
                            // Timed with auto-fill: highlight that it's pre-filled
                            isTimed && !saved && count === defaultCount && count !== ''
                                ? styles.setInputPrefilled
                                : null,
                        ]}
                        value={count}
                        onChangeText={setCount}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#555"
                        keyboardType="number-pad"
                        returnKeyType="next"
                    />
                </View>

                {/* RPE — always shown */}
                <View style={styles.setInputGroup}>
                    <Text style={styles.setInputLabel}>RPE</Text>
                    <TextInput
                        style={[styles.setInput, saved && styles.setInputSaved]}
                        value={rpe}
                        onChangeText={setRpe}
                        onBlur={handleBlurSave}
                        placeholder="—"
                        placeholderTextColor="#555"
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                    />
                </View>
            </View>

            {/* Note */}
            <TextInput
                style={[styles.setNoteInput, saved && styles.setInputSaved]}
                value={note}
                onChangeText={setNote}
                onBlur={handleBlurSave}
                placeholder="Note (optional)"
                placeholderTextColor="#555"
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
    setRow: {
        borderTopWidth: 0.5,
        borderTopColor: '#222',
        paddingTop: 8,
        paddingBottom: 4,
        marginBottom: 4,
    },
    setHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    setLabel: {
        fontSize: 12,
        color: '#fba8a0',
        fontWeight: '700',
    },
    prescriptionLabel: {
        fontSize: 11,
        color: '#555',
        fontStyle: 'italic',
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
        textAlign: 'center',
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
    setInputPrefilled: {
        borderColor: '#fba8a0',
        borderStyle: 'dashed',
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
});