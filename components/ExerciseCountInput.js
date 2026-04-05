/**
 * ExerciseCountInput.js
 * Location: components/ExerciseCountInput.js
 *
 * Replaces the old single "count" + countType picker in CreateWorkout.
 *
 * Data shape produced (stored in workout JSON):
 *   countType:       'Reps' | 'Timed' | 'AMRAP'
 *   countMin:        number | null   — prescribed reps/seconds (or range min)
 *   countMax:        number | null   — range max, null if single value
 *   timeCapSeconds:  number | null   — AMRAP only, null if no cap
 *
 * Examples:
 *   8 reps exactly:       { countType:'Reps',  countMin:8,  countMax:null, timeCapSeconds:null }
 *   8-12 reps:            { countType:'Reps',  countMin:8,  countMax:12,   timeCapSeconds:null }
 *   30s exactly:          { countType:'Timed', countMin:30, countMax:null, timeCapSeconds:null }
 *   30-45s:               { countType:'Timed', countMin:30, countMax:45,   timeCapSeconds:null }
 *   AMRAP no cap:         { countType:'AMRAP', countMin:null,countMax:null,timeCapSeconds:null }
 *   AMRAP 10min cap:      { countType:'AMRAP', countMin:null,countMax:null,timeCapSeconds:600  }
 */

import * as React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { ErrorMessage } from 'formik';
import Feather from '@expo/vector-icons/Feather';

export default function ExerciseCountInput({
    exercise,       // current exercise values from Formik
    fieldBase,      // e.g. 'data.0.data.1'
    handleChange,
    handleBlur,
    setFieldValue,
}) {
    const f = fieldBase; // shorthand
    const type = exercise.countType;

    const onTypeChange = (value) => {
        setFieldValue(`${f}.countType`, value);
        // Clear fields that don't apply to the new type
        setFieldValue(`${f}.countMin`, null);
        setFieldValue(`${f}.countMax`, null);
        setFieldValue(`${f}.timeCapSeconds`, null);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Reps / Time</Text>

            <View style={styles.row}>
                {/* ── Type picker ── */}
                <View style={styles.pickerWrapper}>
                    <RNPickerSelect
                        items={[
                            { label: 'Reps',  value: 'Reps',  key: 'reps'  },
                            { label: 'Timed', value: 'Timed', key: 'timed' },
                            { label: 'AMRAP', value: 'AMRAP', key: 'amrap' },
                        ]}
                        onValueChange={onTypeChange}
                        onClose={() => handleBlur(`${f}.countType`)}
                        value={exercise.countType}
                        style={pickerSelectStyles}
                        Icon={() => <Feather name="chevron-down" size={18} color="#fae9e9" />}
                        placeholder={{ label: 'Type...', value: null, color: '#888' }}
                    />
                </View>

                {/* ── Reps: min + optional max ── */}
                {type === 'Reps' && (
                    <View style={styles.countFields}>
                        <TextInput
                            style={styles.countInput}
                            keyboardType="numeric"
                            placeholder="Min"
                            placeholderTextColor="#888"
                            value={exercise.countMin != null ? String(exercise.countMin) : ''}
                            onChangeText={handleChange(`${f}.countMin`)}
                            onBlur={handleBlur(`${f}.countMin`)}
                        />
                        <Text style={styles.rangeSeparator}>–</Text>
                        <TextInput
                            style={[styles.countInput, styles.countInputOptional]}
                            keyboardType="numeric"
                            placeholder="Max"
                            placeholderTextColor="#555"
                            value={exercise.countMax != null ? String(exercise.countMax) : ''}
                            onChangeText={handleChange(`${f}.countMax`)}
                            onBlur={handleBlur(`${f}.countMax`)}
                        />
                        <Text style={styles.unitLabel}>reps</Text>
                    </View>
                )}

                {/* ── Timed: min seconds + optional max seconds ── */}
                {type === 'Timed' && (
                    <View style={styles.countFields}>
                        <TextInput
                            style={styles.countInput}
                            keyboardType="numeric"
                            placeholder="Min"
                            placeholderTextColor="#888"
                            value={exercise.countMin != null ? String(exercise.countMin) : ''}
                            onChangeText={handleChange(`${f}.countMin`)}
                            onBlur={handleBlur(`${f}.countMin`)}
                        />
                        <Text style={styles.rangeSeparator}>–</Text>
                        <TextInput
                            style={[styles.countInput, styles.countInputOptional]}
                            keyboardType="numeric"
                            placeholder="Max"
                            placeholderTextColor="#555"
                            value={exercise.countMax != null ? String(exercise.countMax) : ''}
                            onChangeText={handleChange(`${f}.countMax`)}
                            onBlur={handleBlur(`${f}.countMax`)}
                        />
                        <Text style={styles.unitLabel}>sec</Text>
                    </View>
                )}

                {/* ── AMRAP: optional time cap in minutes ── */}
                {type === 'AMRAP' && (
                    <View style={styles.countFields}>
                        <TextInput
                            style={[styles.countInput, styles.countInputOptional]}
                            keyboardType="numeric"
                            placeholder="Cap"
                            placeholderTextColor="#555"
                            value={exercise.timeCapSeconds != null
                                ? String(Math.round(exercise.timeCapSeconds / 60))
                                : ''
                            }
                            onChangeText={(v) => {
                                // Store as seconds internally
                                const mins = parseFloat(v);
                                setFieldValue(`${f}.timeCapSeconds`, isNaN(mins) ? null : mins * 60);
                            }}
                            onBlur={handleBlur(`${f}.timeCapSeconds`)}
                        />
                        <Text style={styles.unitLabel}>min cap{'\n'}(opt.)</Text>
                    </View>
                )}
            </View>

            {/* Validation messages */}
            <ErrorMessage
                render={msg => <Text style={styles.errorText}>{msg}</Text>}
                name={`${f}.countMin`}
            />
            <ErrorMessage
                render={msg => <Text style={styles.errorText}>{msg}</Text>}
                name={`${f}.countMax`}
            />
            <ErrorMessage
                render={msg => <Text style={styles.errorText}>{msg}</Text>}
                name={`${f}.timeCapSeconds`}
            />

            {/* Helpful display of what was entered */}
            {type && (
                <Text style={styles.preview}>
                    {type === 'Reps' && exercise.countMin && (
                        exercise.countMax
                            ? `${exercise.countMin}–${exercise.countMax} reps`
                            : `${exercise.countMin} reps`
                    )}
                    {type === 'Timed' && exercise.countMin && (
                        exercise.countMax
                            ? `${exercise.countMin}–${exercise.countMax} seconds`
                            : `${exercise.countMin} seconds`
                    )}
                    {type === 'AMRAP' && (
                        exercise.timeCapSeconds
                            ? `AMRAP · ${Math.round(exercise.timeCapSeconds / 60)} min cap`
                            : 'AMRAP · no time cap'
                    )}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fae9e9',
        padding: 8,
        marginVertical: 5,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    pickerWrapper: {
        flex: 1,
        minWidth: 100,
    },
    countFields: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flex: 1.4,
    },
    countInput: {
        width: 52,
        height: 40,
        borderWidth: 1,
        borderColor: '#fba8a0',
        backgroundColor: '#fae9e9',
        borderRadius: 4,
        padding: 8,
        fontSize: 15,
        textAlign: 'center',
        color: '#000',
    },
    countInputOptional: {
        borderColor: '#888',
        backgroundColor: '#1a1a1a',
        color: '#fae9e9',
    },
    rangeSeparator: {
        color: '#888',
        fontSize: 16,
    },
    unitLabel: {
        color: '#888',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 14,
    },
    preview: {
        fontSize: 12,
        color: '#7bb533',
        paddingHorizontal: 8,
        paddingTop: 4,
        fontStyle: 'italic',
    },
    errorText: {
        fontSize: 12,
        fontStyle: 'italic',
        padding: 4,
        color: '#fba8a0',
    },
});

const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
        fontSize: 15,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'gray',
        borderRadius: 4,
        color: '#fae9e9',
        paddingRight: 24,
    },
    inputAndroid: {
        fontSize: 15,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 0.5,
        borderColor: 'purple',
        borderRadius: 8,
        color: '#fae9e9',
        paddingRight: 24,
    },
});