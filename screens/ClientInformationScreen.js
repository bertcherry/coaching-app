import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, Pressable, TextInput,
    StyleSheet, ActivityIndicator, Platform, Modal,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LimitationModal from '../components/LimitationModal';

const API = 'https://coaching-app.bert-m-cherry.workers.dev';

const EXPERIENCE_OPTIONS = [
    { key: 'beginner',     label: 'Beginner' },
    { key: 'intermediate', label: 'Intermediate' },
    { key: 'advanced',     label: 'Advanced' },
    { key: 'elite',        label: 'Elite' },
];

const FOCUS_OPTIONS = [
    { key: 'general',              label: 'General fitness' },
    { key: 'strength',             label: 'Strength' },
    { key: 'hypertrophy',          label: 'Hypertrophy' },
    { key: 'conditioning',         label: 'Conditioning' },
    { key: 'sport',                label: 'Sport performance' },
    { key: 'rehab',                label: 'Rehab / Return to sport' },
    { key: 'menopause_management', label: 'Menopause management' },
    { key: 'healthy_aging',        label: 'Healthy aging' },
];

const SEVERITY_LABELS = { avoid: 'Avoid', modify: 'Modify', monitor: 'Monitor' };
const SEVERITY_COLORS = { avoid: '#d9534f', modify: '#e8924a', monitor: '#e8c44a' };

function regionLabel(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isLimitationActive(lim) {
    if (!lim.is_active) return false;
    if (lim.until) {
        const today = new Date().toISOString().split('T')[0];
        return lim.until >= today;
    }
    return true;
}

function parseTrainingFocus(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [raw];
    }
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, theme }) {
    return (
        <View style={{ marginBottom: 28 }}>
            <Text style={[sectionStyles.heading, { color: theme.textSecondary, borderBottomColor: theme.divider }]}>
                {title}
            </Text>
            {children}
        </View>
    );
}

const sectionStyles = StyleSheet.create({
    heading: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingBottom: 10,
        marginBottom: 14,
        borderBottomWidth: 1,
    },
});

// ─── Simple bottom-sheet picker ───────────────────────────────────────────────

function BottomSheetPicker({ visible, title, options, onSelect, onClose, theme }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <Pressable
                style={bsStyles.overlay}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close picker"
            >
                <Pressable style={[bsStyles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
                    <View style={[bsStyles.header, { borderBottomColor: theme.divider }]}>
                        <Text style={[bsStyles.title, { color: theme.textPrimary }]}>{title}</Text>
                        <Pressable onPress={onClose} style={bsStyles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </Pressable>
                    </View>
                    {options.map((opt, i) => (
                        <Pressable
                            key={opt.key}
                            onPress={() => onSelect(opt.key)}
                            style={[bsStyles.option, { borderBottomColor: theme.divider, borderBottomWidth: i < options.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                            accessibilityRole="button"
                            accessibilityLabel={opt.label}
                        >
                            <Text style={[bsStyles.optionText, { color: theme.textPrimary }]}>{opt.label}</Text>
                        </Pressable>
                    ))}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const bsStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    title: { fontSize: 17, fontWeight: '700' },
    closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    option: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        minHeight: 52,
        justifyContent: 'center',
    },
    optionText: { fontSize: 16 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClientInformationScreen({ route, navigation }) {
    const { clientEmail, clientName } = route.params;
    const { authFetch } = useAuth();
    const { theme } = useTheme();
    const s = makeStyles(theme);

    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState(false);
    const [saveError, setSaveError]   = useState(null);
    const [movementPatterns, setMovementPatterns] = useState([]);

    const [rpeDisplay, setRpeDisplay]               = useState('numeric');
    const [experienceLevel, setExperienceLevel]     = useState(null);
    const [trainingFocus, setTrainingFocus]         = useState([]);
    const [sport, setSport]                         = useState('');
    const [competitionDate, setCompetitionDate]     = useState('');
    const [privateNotes, setPrivateNotes]           = useState('');
    const [limitations, setLimitations]             = useState([]);

    const [expPickerOpen, setExpPickerOpen]         = useState(false);
    const [focusPickerOpen, setFocusPickerOpen]     = useState(false);
    const [limitationModalVisible, setLimitationModalVisible] = useState(false);
    const [editingLimitation, setEditingLimitation] = useState(null);
    const [historyExpanded, setHistoryExpanded]     = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setSaveError(null);
        try {
            const [profileRes, patternsRes] = await Promise.all([
                authFetch(`${API}/clients/${encodeURIComponent(clientEmail)}/profile`),
                authFetch(`${API}/movement-patterns`),
            ]);

            if (profileRes.ok) {
                const { athleteProfile, rpeDisplay: rpd } = await profileRes.json();
                setRpeDisplay(rpd ?? 'numeric');
                if (athleteProfile) {
                    setExperienceLevel(athleteProfile.experience_level ?? null);
                    setTrainingFocus(parseTrainingFocus(athleteProfile.training_focus));
                    setSport(athleteProfile.sport ?? '');
                    setCompetitionDate(athleteProfile.competition_date ?? '');
                    setPrivateNotes(athleteProfile.private_notes ?? '');
                    try {
                        setLimitations(JSON.parse(athleteProfile.limitations ?? '[]'));
                    } catch {
                        setLimitations([]);
                    }
                }
            }
            if (patternsRes.ok) {
                setMovementPatterns(await patternsRes.json());
            }
        } catch {
            setSaveError('Could not load client data.');
        } finally {
            setLoading(false);
        }
    }, [clientEmail, authFetch]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await authFetch(`${API}/clients/${encodeURIComponent(clientEmail)}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rpe_display: rpeDisplay,
                    experience_level: experienceLevel,
                    training_focus: trainingFocus,
                    sport: sport.trim() || null,
                    competition_date: competitionDate.trim() || null,
                    limitations,
                    private_notes: privateNotes.trim() || null,
                }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setSaveError('Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const saveLimitation = async (lim) => {
        const updated = editingLimitation
            ? limitations.map(l => l.id === lim.id ? lim : l)
            : [...limitations, lim];
        setLimitations(updated);
        setLimitationModalVisible(false);
        setEditingLimitation(null);

        try {
            await authFetch(`${API}/clients/${encodeURIComponent(clientEmail)}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limitations: updated }),
            });
        } catch {
            setSaveError('Limitation saved locally but could not sync. Tap Save to retry.');
        }
    };

    const openAddLimitation = () => {
        setEditingLimitation(null);
        setLimitationModalVisible(true);
    };

    const openEditLimitation = (lim) => {
        setEditingLimitation(lim);
        setLimitationModalVisible(true);
    };

    const removeFocus = (key) => setTrainingFocus(prev => prev.filter(k => k !== key));

    const activeLimitations = limitations.filter(isLimitationActive);
    const pastLimitations   = limitations.filter(l => !isLimitationActive(l));
    const availableFocusOptions = FOCUS_OPTIONS.filter(o => !trainingFocus.includes(o.key));

    const selectedExperience = EXPERIENCE_OPTIONS.find(o => o.key === experienceLevel);

    if (loading) {
        return (
            <View style={[s.loadingContainer, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.accent} size="large" />
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: theme.background }]}>
            <ScrollView
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
                indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
            >
                {/* Client header */}
                <View style={s.clientHeader}>
                    <View style={[s.avatar, { backgroundColor: theme.accentSubtle }]}>
                        <Text style={[s.avatarText, { color: theme.accentText }]}>
                            {clientName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </Text>
                    </View>
                    <View>
                        <Text style={[s.clientName, { color: theme.textPrimary }]}>{clientName}</Text>
                        <Text style={[s.clientEmail, { color: theme.textSecondary }]}>{clientEmail}</Text>
                    </View>
                </View>

                {/* ── Athlete Profile ── */}
                <Section title="Athlete Profile" theme={theme}>

                    {/* Experience level — dropdown */}
                    <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Experience level</Text>
                    <Pressable
                        style={[s.dropdownControl, { borderColor: theme.divider, backgroundColor: theme.fieldBackground }]}
                        onPress={() => setExpPickerOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={selectedExperience ? `Experience level: ${selectedExperience.label}` : 'Select experience level'}
                    >
                        <Text style={[s.dropdownValue, { color: selectedExperience ? theme.textPrimary : theme.inputPlaceholder }]}>
                            {selectedExperience ? selectedExperience.label : 'Select experience level'}
                        </Text>
                        <Feather name="chevron-down" size={16} color={theme.textTertiary} accessible={false} />
                    </Pressable>

                    {/* Training focus — multi-select bubbles */}
                    <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Training focus</Text>
                    {trainingFocus.length > 0 && (
                        <View style={s.focusBubbles}>
                            {trainingFocus.map(key => {
                                const opt = FOCUS_OPTIONS.find(o => o.key === key);
                                return (
                                    <View key={key} style={[s.focusBubble, { backgroundColor: theme.accent }]}>
                                        <Text style={s.focusBubbleText}>{opt?.label ?? key}</Text>
                                        <Pressable
                                            onPress={() => removeFocus(key)}
                                            hitSlop={8}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Remove ${opt?.label ?? key}`}
                                        >
                                            <Feather name="x" size={13} color="#000" accessible={false} />
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                    {availableFocusOptions.length > 0 && (
                        <Pressable
                            style={[s.addFocusBtn, { borderColor: theme.accentText }]}
                            onPress={() => setFocusPickerOpen(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Add training focus"
                        >
                            <Feather name="plus" size={14} color={theme.accentText} accessible={false} />
                            <Text style={[s.addFocusBtnText, { color: theme.accentText }]}>Add focus</Text>
                        </Pressable>
                    )}

                    <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: 16 }]}>Sport / activity</Text>
                    <TextInput
                        style={[s.input, { color: theme.inputText, backgroundColor: theme.fieldBackground, borderColor: theme.divider }]}
                        value={sport}
                        onChangeText={setSport}
                        placeholder="e.g. Powerlifting, CrossFit, Soccer…"
                        placeholderTextColor={theme.inputPlaceholder}
                        accessibilityLabel="Sport or activity"
                    />

                    <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Goal / competition date</Text>
                    <TextInput
                        style={[s.input, { color: theme.inputText, backgroundColor: theme.fieldBackground, borderColor: theme.divider }]}
                        value={competitionDate}
                        onChangeText={setCompetitionDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.inputPlaceholder}
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                        accessibilityLabel="Goal or competition date"
                    />
                </Section>

                {/* ── Private Notes ── */}
                <Section title="Private Notes" theme={theme}>
                    <Text style={[s.helperText, { color: theme.textTertiary }]}>
                        Only visible to you. Not shared with the client.
                    </Text>
                    <TextInput
                        style={[s.notesInput, { color: theme.inputText, backgroundColor: theme.fieldBackground, borderColor: theme.divider }]}
                        value={privateNotes}
                        onChangeText={setPrivateNotes}
                        placeholder="Personality notes, program context, communication preferences…"
                        placeholderTextColor={theme.inputPlaceholder}
                        multiline
                        maxLength={2000}
                        textAlignVertical="top"
                        accessibilityLabel="Private coach notes"
                    />
                </Section>

                {/* ── Limitations ── */}
                <Section title="Limitations" theme={theme}>
                    <Text style={[s.helperText, { color: theme.textTertiary }]}>
                        Add a separate entry for each limitation.
                    </Text>

                    {activeLimitations.length === 0 ? (
                        <Text style={[s.emptyText, { color: theme.textTertiary }]}>No active limitations recorded.</Text>
                    ) : (
                        activeLimitations.map(lim => (
                            <LimitationRow
                                key={lim.id}
                                lim={lim}
                                movementPatterns={movementPatterns}
                                theme={theme}
                                s={s}
                                onEdit={() => openEditLimitation(lim)}
                            />
                        ))
                    )}

                    <Pressable
                        style={[s.addLimBtn, { borderColor: theme.accentText }]}
                        onPress={openAddLimitation}
                        accessibilityRole="button"
                        accessibilityLabel="Add limitation"
                    >
                        <Feather name="plus" size={16} color={theme.accentText} accessible={false} />
                        <Text style={[s.addLimBtnText, { color: theme.accentText }]}>Add Limitation</Text>
                    </Pressable>

                    {pastLimitations.length > 0 && (
                        <>
                            <Pressable
                                onPress={() => setHistoryExpanded(v => !v)}
                                style={s.historyToggle}
                                accessibilityRole="button"
                                accessibilityLabel={historyExpanded ? 'Collapse limitation history' : 'Expand limitation history'}
                            >
                                <Text style={[s.historyToggleText, { color: theme.textTertiary }]}>
                                    Past limitations ({pastLimitations.length})
                                </Text>
                                <Feather
                                    name={historyExpanded ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color={theme.textTertiary}
                                    accessible={false}
                                />
                            </Pressable>
                            {historyExpanded && pastLimitations.map(lim => (
                                <LimitationRow
                                    key={lim.id}
                                    lim={lim}
                                    movementPatterns={movementPatterns}
                                    theme={theme}
                                    s={s}
                                    isPast
                                    onEdit={() => openEditLimitation(lim)}
                                />
                            ))}
                        </>
                    )}
                </Section>

                {/* ── Connected Devices ── */}
                <Section title="Connected Devices" theme={theme}>
                    <View style={[s.devicesPlaceholder, { backgroundColor: theme.surfaceElevated, borderColor: theme.divider }]}>
                        <Feather name="watch" size={22} color={theme.textTertiary} accessible={false} />
                        <Text style={[s.devicesPlaceholderText, { color: theme.textTertiary }]}>
                            No devices connected
                        </Text>
                        <Text style={[s.devicesPlaceholderSub, { color: theme.textTertiary }]}>
                            Apple Health, Whoop, and Oura integrations coming soon
                        </Text>
                    </View>
                </Section>

                {/* ── RPE Display ── */}
                <Section title="RPE Display" theme={theme}>
                    <Text style={[s.helperText, { color: theme.textTertiary }]}>
                        Controls how effort is logged during workouts.
                    </Text>
                    <View style={s.rpeRow} accessibilityRole="radiogroup" accessibilityLabel="RPE display preference">
                        {[
                            { key: 'numeric',     label: 'Numeric', sub: '1 – 10' },
                            { key: 'descriptive', label: 'Descriptive', sub: 'Easy · Moderate · Hard' },
                        ].map(opt => {
                            const selected = rpeDisplay === opt.key;
                            return (
                                <Pressable
                                    key={opt.key}
                                    onPress={() => setRpeDisplay(opt.key)}
                                    style={[s.rpeOption, selected && s.rpeOptionSelected, { borderColor: selected ? theme.accent : theme.surfaceBorder }]}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: selected }}
                                    accessibilityLabel={`${opt.label}, ${opt.sub}`}
                                >
                                    <Text style={[s.rpeLabel, { color: selected ? theme.accentText : theme.textPrimary }]}>
                                        {opt.label}
                                    </Text>
                                    <Text style={[s.rpeSub, { color: theme.textTertiary }]}>{opt.sub}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </Section>

                {saveError && (
                    <Text style={[s.errorText, { color: theme.danger }]}>{saveError}</Text>
                )}
                <Pressable
                    style={[s.saveBtn, { backgroundColor: theme.accent }, saving && s.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Save changes"
                    accessibilityState={{ disabled: saving }}
                >
                    {saving
                        ? <ActivityIndicator color="#000" />
                        : <Text style={s.saveBtnText}>Save Changes</Text>
                    }
                </Pressable>
            </ScrollView>

            {/* Experience level picker */}
            <BottomSheetPicker
                visible={expPickerOpen}
                title="Experience Level"
                options={EXPERIENCE_OPTIONS}
                onSelect={(key) => { setExperienceLevel(key); setExpPickerOpen(false); }}
                onClose={() => setExpPickerOpen(false)}
                theme={theme}
            />

            {/* Training focus picker — shows only unselected options */}
            <BottomSheetPicker
                visible={focusPickerOpen}
                title="Add Training Focus"
                options={availableFocusOptions}
                onSelect={(key) => { setTrainingFocus(prev => [...prev, key]); setFocusPickerOpen(false); }}
                onClose={() => setFocusPickerOpen(false)}
                theme={theme}
            />

            <LimitationModal
                visible={limitationModalVisible}
                limitation={editingLimitation}
                movementPatterns={movementPatterns}
                onSave={saveLimitation}
                onClose={() => { setLimitationModalVisible(false); setEditingLimitation(null); }}
            />
        </View>
    );
}

// ─── Limitation row ───────────────────────────────────────────────────────────

function LimitationRow({ lim, movementPatterns, theme, s, isPast, onEdit }) {
    const patternLabels = lim.patterns_affected
        ?.map(name => movementPatterns.find(p => p.name === name)?.label ?? name)
        .join(', ');

    const severityColor = SEVERITY_COLORS[lim.severity] ?? theme.textSecondary;

    return (
        <View style={[s.limRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.divider }, isPast && s.limRowPast]}>
            <View style={s.limHeader}>
                <View style={[s.severityBadge, { backgroundColor: severityColor + '22', borderColor: severityColor }]}>
                    <Text style={[s.severityBadgeText, { color: severityColor }]}>
                        {SEVERITY_LABELS[lim.severity] ?? lim.severity}
                    </Text>
                </View>
                <Pressable
                    onPress={onEdit}
                    style={s.editBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Edit limitation"
                >
                    <Feather name="edit-2" size={14} color={theme.textTertiary} accessible={false} />
                    <Text style={[s.editBtnText, { color: theme.textTertiary }]}>Edit</Text>
                </Pressable>
            </View>

            <Text style={[s.limRegions, { color: theme.textPrimary }]}>
                {lim.regions?.map(regionLabel).join(', ')}
            </Text>

            {patternLabels ? (
                <Text style={[s.limPatterns, { color: theme.textSecondary }]}>{patternLabels}</Text>
            ) : null}

            {lim.notes ? (
                <Text style={[s.limNotes, { color: theme.textTertiary }]}>{lim.notes}</Text>
            ) : null}

            {(lim.since || lim.until) && (
                <Text style={[s.limDates, { color: theme.textTertiary }]}>
                    {lim.since ? `Since ${lim.since}` : ''}
                    {lim.since && lim.until ? ' · ' : ''}
                    {lim.until ? `Until ${lim.until}` : ''}
                </Text>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container: { flex: 1 },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        scrollContent: { padding: 20, paddingBottom: 48 },

        clientHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 28,
        },
        avatar: {
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
        },
        avatarText: { fontSize: 18, fontWeight: '700' },
        clientName: { fontSize: 18, fontWeight: '700' },
        clientEmail: { fontSize: 13, marginTop: 2 },

        fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
        helperText: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
        emptyText: { fontSize: 14, marginBottom: 12 },
        errorText: { textAlign: 'center', fontSize: 13, marginBottom: 12 },

        dropdownControl: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: Platform.OS === 'ios' ? 13 : 11,
            minHeight: 48,
            marginBottom: 16,
        },
        dropdownValue: { fontSize: 15 },

        focusBubbles: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
        },
        focusBubble: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            minHeight: 36,
        },
        focusBubbleText: { fontSize: 13, fontWeight: '600', color: '#000' },

        addFocusBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 9,
            minHeight: 40,
            marginBottom: 4,
        },
        addFocusBtnText: { fontSize: 13, fontWeight: '600' },

        input: {
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === 'ios' ? 12 : 10,
            fontSize: 14,
            minHeight: 44,
            marginBottom: 16,
        },
        notesInput: {
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            fontSize: 14,
            minHeight: 100,
            textAlignVertical: 'top',
        },

        limRow: {
            borderWidth: 1,
            borderRadius: 10,
            padding: 14,
            marginBottom: 10,
        },
        limRowPast: { opacity: 0.55 },
        limHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        },
        severityBadge: {
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            borderWidth: 1,
        },
        severityBadgeText: { fontSize: 12, fontWeight: '700' },
        editBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            minHeight: 36,
            paddingHorizontal: 4,
        },
        editBtnText: { fontSize: 13 },
        limRegions: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
        limPatterns: { fontSize: 13, marginBottom: 4 },
        limNotes: { fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
        limDates: { fontSize: 12, marginTop: 2 },

        addLimBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 13,
            minHeight: 48,
            marginTop: 4,
        },
        addLimBtnText: { fontSize: 15, fontWeight: '600' },

        historyToggle: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 12,
            minHeight: 44,
            marginTop: 8,
        },
        historyToggleText: { fontSize: 13, fontWeight: '500' },

        devicesPlaceholder: {
            borderWidth: 1,
            borderRadius: 10,
            padding: 24,
            alignItems: 'center',
            gap: 8,
        },
        devicesPlaceholderText: { fontSize: 15, fontWeight: '600', marginTop: 4 },
        devicesPlaceholderSub: { fontSize: 13, textAlign: 'center' },

        rpeRow: {
            flexDirection: 'row',
            gap: 12,
        },
        rpeOption: {
            flex: 1,
            borderWidth: 1,
            borderRadius: 10,
            padding: 14,
            minHeight: 70,
            justifyContent: 'center',
        },
        rpeOptionSelected: { backgroundColor: theme.accentSubtle },
        rpeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
        rpeSub: { fontSize: 12 },

        saveBtn: {
            borderRadius: 12,
            paddingVertical: 15,
            alignItems: 'center',
            minHeight: 50,
            justifyContent: 'center',
            marginTop: 8,
        },
        saveBtnDisabled: { opacity: 0.5 },
        saveBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
    });
}
