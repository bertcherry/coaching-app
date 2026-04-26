import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, Pressable, ScrollView, TextInput,
    StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../context/ThemeContext';

const REGIONS = [
    { key: 'lower_back',   label: 'Lower back' },
    { key: 'upper_back',   label: 'Upper back' },
    { key: 'neck',         label: 'Neck' },
    { key: 'head',         label: 'Head (concussion)' },
    { key: 'left_shoulder',  label: 'Left shoulder' },
    { key: 'right_shoulder', label: 'Right shoulder' },
    { key: 'left_elbow',   label: 'Left elbow' },
    { key: 'right_elbow',  label: 'Right elbow' },
    { key: 'left_wrist',   label: 'Left wrist' },
    { key: 'right_wrist',  label: 'Right wrist' },
    { key: 'left_hand',    label: 'Left hand' },
    { key: 'right_hand',   label: 'Right hand' },
    { key: 'left_hip',     label: 'Left hip' },
    { key: 'right_hip',    label: 'Right hip' },
    { key: 'left_knee',    label: 'Left knee' },
    { key: 'right_knee',   label: 'Right knee' },
    { key: 'left_ankle',   label: 'Left ankle' },
    { key: 'right_ankle',  label: 'Right ankle' },
    { key: 'core',         label: 'Core / abdominal' },
];

const SEVERITIES = [
    { key: 'avoid',   label: 'Avoid',   desc: "Don't program this pattern" },
    { key: 'modify',  label: 'Modify',  desc: 'Can do with caveats' },
    { key: 'monitor', label: 'Monitor', desc: 'Flag for attention' },
];

const EMPTY = {
    regions: [],
    patterns_affected: [],
    severity: null,
    notes: '',
    since: '',
    until: '',
    is_active: true,
};

function newId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function LimitationModal({ visible, limitation, movementPatterns, onSave, onClose }) {
    const { theme } = useTheme();
    const s = makeStyles(theme);

    const [form, setForm] = useState(EMPTY);

    useEffect(() => {
        if (visible) {
            setForm(limitation
                ? { ...limitation, notes: limitation.notes ?? '', since: limitation.since ?? '', until: limitation.until ?? '' }
                : EMPTY
            );
        }
    }, [visible, limitation]);

    const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

    const toggleItem = (key, item) => {
        set(key, form[key].includes(item)
            ? form[key].filter(x => x !== item)
            : [...form[key], item]
        );
    };

    const canSave = form.regions.length > 0 && form.severity !== null;

    const handleSave = () => {
        if (!canSave) return;
        onSave({
            id: limitation?.id ?? newId(),
            regions: form.regions,
            patterns_affected: form.patterns_affected,
            severity: form.severity,
            notes: form.notes.trim() || null,
            since: form.since.trim() || null,
            until: form.until.trim() || null,
            is_active: form.is_active,
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <KeyboardAvoidingView
                style={s.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={s.sheet}>
                    <View style={s.header}>
                        <Text style={s.title}>{limitation ? 'Edit Limitation' : 'Add Limitation'}</Text>
                        <Pressable onPress={onClose} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

                        {/* Regions */}
                        <Text style={s.sectionLabel}>Body region(s) <Text style={s.required}>*</Text></Text>
                        <View style={s.chipGrid}>
                            {REGIONS.map(r => {
                                const selected = form.regions.includes(r.key);
                                return (
                                    <Pressable
                                        key={r.key}
                                        onPress={() => toggleItem('regions', r.key)}
                                        style={[s.chip, selected && s.chipSelected]}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                        accessibilityLabel={r.label}
                                    >
                                        <Text style={[s.chipText, selected && s.chipTextSelected]}>{r.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Severity */}
                        <Text style={s.sectionLabel}>Severity <Text style={s.required}>*</Text></Text>
                        <View style={s.severityRow}>
                            {SEVERITIES.map(sv => {
                                const selected = form.severity === sv.key;
                                return (
                                    <Pressable
                                        key={sv.key}
                                        onPress={() => set('severity', sv.key)}
                                        style={[s.severityBtn, selected && s.severityBtnSelected]}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: selected }}
                                        accessibilityLabel={`${sv.label}: ${sv.desc}`}
                                    >
                                        <Text style={[s.severityLabel, selected && s.severityLabelSelected]}>{sv.label}</Text>
                                        <Text style={[s.severityDesc, selected && s.severityDescSelected]} numberOfLines={2}>{sv.desc}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Movement patterns */}
                        <Text style={s.sectionLabel}>Movement patterns affected</Text>
                        {movementPatterns.length === 0 ? (
                            <Text style={[s.emptyPatterns, { color: theme.textTertiary }]}>
                                No movement patterns available. Apply DB migration 005 to seed them.
                            </Text>
                        ) : null}
                        <View style={s.chipGrid}>
                            {movementPatterns.map(p => {
                                const selected = form.patterns_affected.includes(p.name);
                                return (
                                    <Pressable
                                        key={p.name}
                                        onPress={() => toggleItem('patterns_affected', p.name)}
                                        style={[s.chip, selected && s.chipSelected]}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                        accessibilityLabel={p.label}
                                    >
                                        <Text style={[s.chipText, selected && s.chipTextSelected]}>{p.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Notes */}
                        <Text style={s.sectionLabel}>Notes</Text>
                        <TextInput
                            style={s.textInput}
                            value={form.notes}
                            onChangeText={v => set('notes', v)}
                            placeholder="e.g. neutral grip OK, no external rotation"
                            placeholderTextColor={theme.inputPlaceholder}
                            multiline
                            maxLength={300}
                            accessibilityLabel="Limitation notes"
                        />

                        {/* Dates */}
                        <View style={s.dateRow}>
                            <View style={s.dateField}>
                                <Text style={s.sectionLabel}>Since</Text>
                                <TextInput
                                    style={s.dateInput}
                                    value={form.since}
                                    onChangeText={v => set('since', v)}
                                    placeholder="YYYY-MM"
                                    placeholderTextColor={theme.inputPlaceholder}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={7}
                                    accessibilityLabel="Since month and year"
                                />
                            </View>
                            <View style={s.dateField}>
                                <Text style={s.sectionLabel}>Until (optional)</Text>
                                <TextInput
                                    style={s.dateInput}
                                    value={form.until}
                                    onChangeText={v => set('until', v)}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={theme.inputPlaceholder}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={10}
                                    accessibilityLabel="Until date, optional"
                                />
                            </View>
                        </View>

                        {/* Active toggle — edit mode only */}
                        {limitation && (
                            <Pressable
                                onPress={() => set('is_active', !form.is_active)}
                                style={s.activeRow}
                                accessibilityRole="switch"
                                accessibilityState={{ checked: form.is_active }}
                                accessibilityLabel="Limitation is active"
                            >
                                <View>
                                    <Text style={s.activeLabel}>Active limitation</Text>
                                    <Text style={s.activeDesc}>Disable to move to history without deleting</Text>
                                </View>
                                <View style={[s.toggle, form.is_active && s.toggleOn]}>
                                    <View style={[s.toggleThumb, form.is_active && s.toggleThumbOn]} />
                                </View>
                            </Pressable>
                        )}

                    </ScrollView>

                    <View style={s.footer}>
                        <Pressable
                            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
                            onPress={handleSave}
                            disabled={!canSave}
                            accessibilityRole="button"
                            accessibilityLabel={limitation ? 'Update limitation' : 'Add limitation'}
                            accessibilityState={{ disabled: !canSave }}
                        >
                            <Text style={s.saveBtnText}>{limitation ? 'Update' : 'Add Limitation'}</Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: theme.overlay,
        },
        sheet: {
            backgroundColor: theme.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '92%',
            borderTopWidth: 1,
            borderColor: theme.divider,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
        },
        title: {
            fontSize: 17,
            fontWeight: '700',
            color: theme.textPrimary,
        },
        closeBtn: {
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        scroll: { flexShrink: 1 },
        content: { padding: 20, paddingBottom: 8 },
        sectionLabel: {
            fontSize: 13,
            fontWeight: '600',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 10,
            marginTop: 4,
        },
        required: {
            color: theme.danger,
        },
        emptyPatterns: {
            fontSize: 13,
            fontStyle: 'italic',
            marginBottom: 16,
        },
        chipGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
        },
        chip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            minHeight: 36,
            justifyContent: 'center',
        },
        chipSelected: {
            backgroundColor: theme.accent,
            borderColor: theme.accent,
        },
        chipText: {
            fontSize: 13,
            color: theme.textSecondary,
            fontWeight: '500',
        },
        chipTextSelected: {
            color: '#000',
            fontWeight: '600',
        },
        severityRow: {
            flexDirection: 'row',
            gap: 10,
            marginBottom: 20,
        },
        severityBtn: {
            flex: 1,
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
            borderRadius: 10,
            padding: 10,
            minHeight: 70,
            justifyContent: 'flex-start',
        },
        severityBtnSelected: {
            borderColor: theme.accent,
            backgroundColor: theme.accentSubtle,
        },
        severityLabel: {
            fontSize: 14,
            fontWeight: '700',
            color: theme.textPrimary,
            marginBottom: 4,
        },
        severityLabelSelected: {
            color: theme.accentText,
        },
        severityDesc: {
            fontSize: 11,
            color: theme.textTertiary,
            lineHeight: 15,
        },
        severityDescSelected: {
            color: theme.accentText,
        },
        textInput: {
            backgroundColor: theme.fieldBackground,
            borderWidth: 1,
            borderColor: theme.divider,
            borderRadius: 10,
            padding: 12,
            fontSize: 14,
            color: theme.inputText,
            minHeight: 72,
            textAlignVertical: 'top',
            marginBottom: 20,
        },
        dateRow: {
            flexDirection: 'row',
            gap: 12,
            marginBottom: 20,
        },
        dateField: { flex: 1 },
        dateInput: {
            backgroundColor: theme.fieldBackground,
            borderWidth: 1,
            borderColor: theme.divider,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            color: theme.inputText,
            minHeight: 44,
        },
        activeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: theme.divider,
            marginBottom: 8,
            minHeight: 60,
        },
        activeLabel: {
            fontSize: 15,
            fontWeight: '600',
            color: theme.textPrimary,
        },
        activeDesc: {
            fontSize: 12,
            color: theme.textTertiary,
            marginTop: 2,
        },
        toggle: {
            width: 48,
            height: 28,
            borderRadius: 14,
            backgroundColor: theme.surfaceBorder,
            padding: 3,
            justifyContent: 'center',
        },
        toggleOn: {
            backgroundColor: theme.accent,
        },
        toggleThumb: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#fff',
        },
        toggleThumbOn: {
            alignSelf: 'flex-end',
        },
        footer: {
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.divider,
        },
        saveBtn: {
            backgroundColor: theme.accent,
            borderRadius: 12,
            paddingVertical: 15,
            alignItems: 'center',
            minHeight: 50,
            justifyContent: 'center',
        },
        saveBtnDisabled: { opacity: 0.45 },
        saveBtnText: {
            fontSize: 15,
            fontWeight: '700',
            color: '#000',
        },
    });
}
