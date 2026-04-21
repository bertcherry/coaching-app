/**
 * ExerciseCountInput.js
 * Location: components/ExerciseCountInput.js
 * Custom segmented picker replacing RNPickerSelect. Count inputs on their own row.
 */
import * as React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { ErrorMessage } from 'formik';
import { useTheme } from '../context/ThemeContext';

const COUNT_TYPES = [
    { label: 'Reps', value: 'Reps' },
    { label: 'Timed', value: 'Timed' },
    { label: 'AMRAP', value: 'AMRAP' },
];

export default function ExerciseCountInput({ exercise, fieldBase, handleChange, handleBlur, setFieldValue, forceTimed }) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const f    = fieldBase;
    const type = forceTimed ? 'Timed' : exercise.countType;

    const onTypeChange = (value) => {
        setFieldValue(`${f}.countType`, value);
        setFieldValue(`${f}.countMin`, null);
        setFieldValue(`${f}.countMax`, null);
        setFieldValue(`${f}.timeCapSeconds`, null);
    };

    return (
        <View style={styles.container}>
            {!forceTimed && (
                <>
                    <View style={styles.typeHeader}>
                        <Text style={styles.inputLabel}>Count type <Text style={styles.req}>*</Text></Text>
                    </View>
                    <View style={styles.segmentRow}>
                        {COUNT_TYPES.map(({ label, value }) => {
                            const active = type === value;
                            return (
                                <Pressable key={value} style={[styles.segment, active && styles.segmentActive]} onPress={() => onTypeChange(value)}>
                                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </>
            )}
            {forceTimed && (
                <View style={styles.forcedTimedBadge}>
                    <Text style={styles.forcedTimedText}>Timed (circuit)</Text>
                </View>
            )}

            {type === 'Reps' && (
                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Min reps <Text style={styles.req}>*</Text></Text>
                        <TextInput style={styles.countInput} keyboardType="numeric" placeholder="e.g. 8" placeholderTextColor={theme.inputPlaceholder}
                            value={exercise.countMin != null ? String(exercise.countMin) : ''}
                            onChangeText={handleChange(`${f}.countMin`)} onBlur={handleBlur(`${f}.countMin`)} />
                    </View>
                    <Text style={styles.rangeDash}>–</Text>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Max reps</Text>
                        <TextInput style={[styles.countInput, styles.countInputOptional]} keyboardType="numeric" placeholder="opt." placeholderTextColor={theme.inputPlaceholder}
                            value={exercise.countMax != null ? String(exercise.countMax) : ''}
                            onChangeText={handleChange(`${f}.countMax`)} onBlur={handleBlur(`${f}.countMax`)} />
                    </View>
                </View>
            )}

            {(type === 'Timed' || forceTimed) && (
                <>
                    <View style={styles.inputRow}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Min sec <Text style={styles.req}>*</Text></Text>
                            <TextInput style={styles.countInput} keyboardType="numeric" placeholder="e.g. 30" placeholderTextColor={theme.inputPlaceholder}
                                value={exercise.countMin != null ? String(exercise.countMin) : ''}
                                onChangeText={handleChange(`${f}.countMin`)} onBlur={handleBlur(`${f}.countMin`)} />
                        </View>
                        <Text style={styles.rangeDash}>–</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Max sec</Text>
                            <TextInput style={[styles.countInput, styles.countInputOptional]} keyboardType="numeric" placeholder="opt." placeholderTextColor={theme.inputPlaceholder}
                                value={exercise.countMax != null ? String(exercise.countMax) : ''}
                                onChangeText={handleChange(`${f}.countMax`)} onBlur={handleBlur(`${f}.countMax`)} />
                        </View>
                    </View>

                    {/* Single / Two Sides */}
                    <View style={styles.sidesRow}>
                        <Text style={styles.inputLabel}>Sides</Text>
                        <View style={styles.sidesPickerRow}>
                            {[{ label: 'Single', value: 'single' }, { label: 'Two Sides', value: 'two' }].map(({ label, value }) => {
                                const active = (exercise.sides ?? 'single') === value;
                                return (
                                    <Pressable
                                        key={value}
                                        style={[styles.sidesPill, active && styles.sidesPillActive]}
                                        onPress={() => {
                                            setFieldValue(`${f}.sides`, value);
                                            if (value === 'single') setFieldValue(`${f}.restBetweenSides`, null);
                                        }}
                                        testID={`sides-${value}`}
                                    >
                                        <Text style={[styles.sidesPillText, active && styles.sidesPillTextActive]}>{label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    {(exercise.sides ?? 'single') === 'two' && (
                        <View style={[styles.inputGroup, { maxWidth: 160, marginBottom: 4 }]}>
                            <Text style={styles.inputLabel}>Rest between sides (sec) <Text style={styles.req}>*</Text></Text>
                            <TextInput
                                style={styles.countInput}
                                keyboardType="numeric"
                                placeholder="e.g. 5"
                                placeholderTextColor={theme.inputPlaceholder}
                                value={exercise.restBetweenSides != null ? String(exercise.restBetweenSides) : ''}
                                onChangeText={handleChange(`${f}.restBetweenSides`)}
                                onBlur={handleBlur(`${f}.restBetweenSides`)}
                                testID="rest-between-sides-input"
                            />
                            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`${f}.restBetweenSides`} />
                        </View>
                    )}
                </>
            )}

            {type === 'AMRAP' && (
                <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { maxWidth: 140 }]}>
                        <Text style={styles.inputLabel}>Time cap (min)</Text>
                        <TextInput style={[styles.countInput, styles.countInputOptional]} keyboardType="numeric" placeholder="none" placeholderTextColor={theme.inputPlaceholder}
                            value={exercise.timeCapSeconds != null ? String(Math.round(exercise.timeCapSeconds / 60)) : ''}
                            onChangeText={(v) => { const m = parseFloat(v); setFieldValue(`${f}.timeCapSeconds`, isNaN(m) ? null : m * 60); }}
                            onBlur={handleBlur(`${f}.timeCapSeconds`)} />
                    </View>
                </View>
            )}

            {type && (
                <Text style={styles.preview}>
                    {type === 'Reps' && exercise.countMin != null && (exercise.countMax ? `${exercise.countMin}–${exercise.countMax} reps` : `${exercise.countMin} reps`)}
                    {(type === 'Timed' || forceTimed) && exercise.countMin != null && (
                        (exercise.countMax ? `${exercise.countMin}–${exercise.countMax} sec` : `${exercise.countMin} sec`) +
                        ((exercise.sides ?? 'single') === 'two' ? ' × 2 sides' : '')
                    )}
                    {type === 'AMRAP' && (exercise.timeCapSeconds ? `AMRAP · ${Math.round(exercise.timeCapSeconds / 60)} min cap` : 'AMRAP · no time cap')}
                </Text>
            )}

            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`${f}.countMin`} />
            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`${f}.countMax`} />
            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`${f}.timeCapSeconds`} />
        </View>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container: { marginTop: 8 },
        segmentRow: { flexDirection: 'row', backgroundColor: theme.fieldBackground, borderRadius: 10, borderWidth: 1, borderColor: theme.surfaceBorder, overflow: 'hidden', marginBottom: 10 },
        segment: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
        segmentActive: { backgroundColor: theme.accent, borderRadius: 8, margin: 3 },
        segmentText: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
        segmentTextActive: { color: '#000', fontWeight: '700' },
        forcedTimedBadge: { backgroundColor: 'rgba(123,181,51,0.1)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(123,181,51,0.3)' },
        forcedTimedText: { fontSize: 12, color: theme.success, fontWeight: '600' },
        inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
        inputGroup: { flex: 1 },
        inputLabel: { fontSize: 10, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
        req: { color: theme.accentText },
        typeHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
        countInput: { height: 40, backgroundColor: theme.fieldBackground, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingHorizontal: 10, fontSize: 15, color: theme.textPrimary, textAlign: 'center' },
        countInputOptional: { borderStyle: 'dashed', borderColor: theme.surfaceBorder },
        rangeDash: { color: theme.textTertiary, fontSize: 20, paddingBottom: 8, width: 16, textAlign: 'center' },
        preview: { fontSize: 12, color: theme.success, paddingTop: 4, paddingHorizontal: 2, fontStyle: 'italic' },
        errorText: { fontSize: 12, fontStyle: 'italic', paddingTop: 2, color: theme.accentText },
        sidesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        sidesPickerRow: { flexDirection: 'row', gap: 6 },
        sidesPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.fieldBackground },
        sidesPillActive: { borderColor: theme.accent, backgroundColor: theme.accentSubtle ?? 'rgba(251,168,160,0.15)' },
        sidesPillText: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },
        sidesPillTextActive: { color: theme.accentText, fontWeight: '700' },
    });
}