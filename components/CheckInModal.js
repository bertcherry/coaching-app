import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal, View, Text, Pressable, ScrollView, TextInput,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import ReadinessScale from './ReadinessScale';

const API = 'https://coaching-app.bert-m-cherry.workers.dev';

const QUESTIONS = [
    { key: 'sleep_quality', question: 'How well did you sleep?',           lowLabel: 'Restless',  highLabel: 'Refreshed' },
    { key: 'recovery',      question: 'How recovered do you feel?',         lowLabel: 'Sore / stiff', highLabel: 'Fresh' },
    { key: 'energy',        question: 'How is your energy?',               lowLabel: 'Drained',   highLabel: 'Energized' },
    { key: 'mental_focus',  question: 'How calm and focused do you feel?', lowLabel: 'Scattered', highLabel: 'Present' },
    { key: 'readiness',     question: 'Overall, how ready are you to train?', lowLabel: 'Not ready', highLabel: 'Ready to go' },
];

const EMPTY_VALUES = { sleep_quality: null, recovery: null, energy: null, mental_focus: null, readiness: null };

function getTodayInTimezone(timezone) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(new Date());
    } catch {
        return new Date().toISOString().split('T')[0];
    }
}

function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function CheckInModal({
    visible,
    onClose,
    scheduledDate,
    scheduledWorkoutId,
    clientEmail,
    clientTimezone,
    onMoveToToday,
}) {
    const { theme } = useTheme();
    const { authFetch } = useAuth();
    const s = makeStyles(theme);

    const today = getTodayInTimezone(clientTimezone);
    const isOnDifferentDay = scheduledDate && scheduledDate.length === 10 && scheduledDate !== today;

    const [step, setStep] = useState(isOnDifferentDay ? 'move_prompt' : 'questions');
    const [values, setValues] = useState(EMPTY_VALUES);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [prefilling, setPrefilling] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const fetchExisting = useCallback(async () => {
        if (!visible) return;
        setPrefilling(true);
        try {
            const params = new URLSearchParams({ date: today });
            if (clientEmail) params.set('clientEmail', clientEmail);
            const res = await authFetch(`${API}/checkins/today?${params}`);
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    setValues({
                        sleep_quality: data.sleep_quality,
                        recovery: data.recovery,
                        energy: data.energy,
                        mental_focus: data.mental_focus,
                        readiness: data.readiness,
                    });
                    setNotes(data.notes ?? '');
                    setIsEditing(true);
                }
            }
        } catch {
            // Non-fatal — modal still opens with empty values
        } finally {
            setPrefilling(false);
        }
    }, [visible, today, clientEmail, authFetch]);

    useEffect(() => {
        if (visible) {
            setStep(isOnDifferentDay ? 'move_prompt' : 'questions');
            setValues(EMPTY_VALUES);
            setNotes('');
            setIsEditing(false);
            setSubmitError(null);
            fetchExisting();
        }
    }, [visible]);

    const handleMoveAndCheckin = async () => {
        setLoading(true);
        try {
            await onMoveToToday();
        } catch {
            // Move failure is non-fatal — proceed to check-in anyway
        } finally {
            setLoading(false);
        }
        setStep('questions');
    };

    const allAnswered = QUESTIONS.every(q => values[q.key] !== null);

    const handleSubmit = async () => {
        if (!allAnswered) return;
        setLoading(true);
        setSubmitError(null);
        try {
            const res = await authFetch(`${API}/checkins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: today,
                    type: 'pre_workout',
                    ...values,
                    notes: notes.trim() || null,
                    scheduled_workout_id: scheduledWorkoutId ?? null,
                }),
            });
            if (!res.ok) throw new Error('Failed to save check-in');
            onClose();
        } catch {
            setSubmitError('Could not save check-in. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const setValue = (key, val) => setValues(prev => ({ ...prev, [key]: val }));

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
                    {/* Header */}
                    <View style={s.header}>
                        <Text style={s.headerTitle}>Check In</Text>
                        <Pressable
                            onPress={onClose}
                            style={s.closeButton}
                            accessibilityRole="button"
                            accessibilityLabel="Close check-in"
                        >
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </Pressable>
                    </View>

                    {prefilling ? (
                        <View style={s.loadingContainer}>
                            <ActivityIndicator color={theme.accent} />
                        </View>
                    ) : step === 'move_prompt' ? (
                        <View style={s.promptContainer}>
                            <Feather name="calendar" size={32} color={theme.accent} style={s.promptIcon} accessible={false} />
                            <Text style={s.promptTitle}>Did you mean to move this workout to today?</Text>
                            <Text style={s.promptSub}>
                                This workout is scheduled for {formatDateFriendly(scheduledDate)}.
                            </Text>
                            <Pressable
                                style={[s.actionButton, s.primaryButton]}
                                onPress={handleMoveAndCheckin}
                                disabled={loading}
                                accessibilityRole="button"
                                accessibilityLabel="Yes, move workout to today and check in"
                            >
                                {loading
                                    ? <ActivityIndicator color="#000" />
                                    : <Text style={s.primaryButtonText}>Yes, move to today</Text>
                                }
                            </Pressable>
                            <Pressable
                                style={[s.actionButton, s.secondaryButton]}
                                onPress={() => setStep('questions')}
                                accessibilityRole="button"
                                accessibilityLabel="Check in only, keep original date"
                            >
                                <Text style={s.secondaryButtonText}>Check in only</Text>
                            </Pressable>
                            <Pressable
                                style={s.cancelButton}
                                onPress={onClose}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel"
                            >
                                <Text style={s.cancelButtonText}>Cancel</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <>
                            <ScrollView
                                style={s.questionsScroll}
                                contentContainerStyle={s.questionsContent}
                                keyboardShouldPersistTaps="handled"
                            >
                                {isEditing && (
                                    <View style={s.editingBanner}>
                                        <Feather name="edit-2" size={13} color={theme.accentText} accessible={false} />
                                        <Text style={s.editingText}>Updating today's check-in</Text>
                                    </View>
                                )}
                                {QUESTIONS.map(q => (
                                    <ReadinessScale
                                        key={q.key}
                                        question={q.question}
                                        lowLabel={q.lowLabel}
                                        highLabel={q.highLabel}
                                        value={values[q.key]}
                                        onChange={val => setValue(q.key, val)}
                                        testID={`scale-${q.key}`}
                                    />
                                ))}
                                <Text style={s.notesLabel}>Notes (optional)</Text>
                                <TextInput
                                    style={s.notesInput}
                                    value={notes}
                                    onChangeText={setNotes}
                                    placeholder="Anything your coach should know…"
                                    placeholderTextColor={theme.inputPlaceholder}
                                    multiline
                                    maxLength={500}
                                    accessibilityLabel="Optional notes for your coach"
                                />
                            </ScrollView>

                            <View style={s.footer}>
                                {submitError && (
                                    <Text style={s.errorText}>{submitError}</Text>
                                )}
                                <Pressable
                                    style={[s.submitButton, !allAnswered && s.submitDisabled]}
                                    onPress={handleSubmit}
                                    disabled={!allAnswered || loading}
                                    accessibilityRole="button"
                                    accessibilityLabel={isEditing ? 'Update check-in' : 'Submit check-in'}
                                    accessibilityState={{ disabled: !allAnswered || loading }}
                                >
                                    {loading
                                        ? <ActivityIndicator color="#000" />
                                        : <Text style={s.submitButtonText}>
                                            {isEditing ? 'Update Check-In' : 'Submit Check-In'}
                                          </Text>
                                    }
                                </Pressable>
                            </View>
                        </>
                    )}
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
        headerTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: theme.textPrimary,
        },
        closeButton: {
            padding: 4,
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        loadingContainer: {
            padding: 40,
            alignItems: 'center',
        },
        // Move prompt
        promptContainer: {
            padding: 28,
            alignItems: 'center',
        },
        promptIcon: {
            marginBottom: 16,
        },
        promptTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: theme.textPrimary,
            textAlign: 'center',
            marginBottom: 8,
        },
        promptSub: {
            fontSize: 14,
            color: theme.textSecondary,
            textAlign: 'center',
            marginBottom: 28,
        },
        actionButton: {
            width: '100%',
            paddingVertical: 15,
            borderRadius: 12,
            alignItems: 'center',
            marginBottom: 12,
            minHeight: 50,
            justifyContent: 'center',
        },
        primaryButton: {
            backgroundColor: theme.accent,
        },
        primaryButtonText: {
            fontSize: 15,
            fontWeight: '700',
            color: '#000',
        },
        secondaryButton: {
            borderWidth: 1,
            borderColor: theme.surfaceBorder,
        },
        secondaryButtonText: {
            fontSize: 15,
            fontWeight: '600',
            color: theme.textPrimary,
        },
        cancelButton: {
            paddingVertical: 12,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelButtonText: {
            fontSize: 14,
            color: theme.textSecondary,
        },
        // Questions
        questionsScroll: {
            flexShrink: 1,
        },
        questionsContent: {
            padding: 16,
            paddingBottom: 8,
        },
        editingBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.accentSubtle,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 20,
        },
        editingText: {
            fontSize: 13,
            color: theme.accentText,
            fontWeight: '500',
        },
        notesLabel: {
            fontSize: 15,
            fontWeight: '600',
            color: theme.textPrimary,
            marginBottom: 8,
        },
        notesInput: {
            backgroundColor: theme.fieldBackground,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.divider,
            padding: 12,
            fontSize: 14,
            color: theme.inputText,
            minHeight: 72,
            textAlignVertical: 'top',
        },
        footer: {
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.divider,
        },
        errorText: {
            fontSize: 13,
            color: theme.danger,
            textAlign: 'center',
            marginBottom: 10,
        },
        submitButton: {
            backgroundColor: theme.accent,
            borderRadius: 12,
            paddingVertical: 15,
            alignItems: 'center',
            minHeight: 50,
            justifyContent: 'center',
        },
        submitDisabled: {
            opacity: 0.45,
        },
        submitButtonText: {
            fontSize: 15,
            fontWeight: '700',
            color: '#000',
        },
    });
}
