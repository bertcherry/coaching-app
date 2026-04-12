/**
 * SettingsScreen.js
 * Location: screens/SettingsScreen.js
 *
 * Sections:
 *   Appearance  — light / dark / system theme toggle
 *   Calendar    — default calendar view (month / week)
 *   Profile     — change first name, last name
 *   Security    — change email (requires password confirm), change password
 *   Workout     — default weight unit (lbs / kg)
 */

import * as React from 'react';
import {
    View, Text, ScrollView, Pressable, TextInput,
    StyleSheet, Modal, Alert, ActivityIndicator,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';
import { useAuth } from '../context/AuthContext';
import { CALENDAR_VIEW_KEY } from '../screens/CalendarScreen';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Reusable pieces ──────────────────────────────────────────────────────────

const SectionHeader = ({ title, theme }) => (
    <Text style={[styles.sectionHeader, { color: theme.textTertiary, borderBottomColor: theme.divider }]}>
        {title}
    </Text>
);

const Row = ({ icon, label, value, onPress, theme, last = false, destructive = false }) => (
    <Pressable
        style={[
            styles.row,
            { backgroundColor: theme.surface, borderBottomColor: theme.divider },
            last && styles.rowLast,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
    >
        <View style={[styles.rowIcon, { backgroundColor: theme.accentSubtle }]}>
            <Feather name={icon} size={18} color={destructive ? '#e05050' : theme.accent} />
        </View>
        <Text style={[styles.rowLabel, { color: destructive ? '#e05050' : theme.textPrimary }]}>
            {label}
        </Text>
        <View style={styles.rowRight}>
            {value ? <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{value}</Text> : null}
            <Feather name="chevron-right" size={16} color={theme.textTertiary} />
        </View>
    </Pressable>
);

// ─── Theme picker ─────────────────────────────────────────────────────────────

const ThemeOption = ({ value, label, icon, current, onSelect, theme }) => {
    const selected = current === value;
    return (
        <Pressable
            style={[
                styles.themeOption,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.surfaceBorder },
                selected && { borderColor: theme.accent, backgroundColor: theme.accentSubtle },
            ]}
            onPress={() => onSelect(value)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
        >
            <Feather name={icon} size={22} color={selected ? theme.accent : theme.textSecondary} />
            <Text style={[styles.themeOptionLabel, { color: selected ? theme.accent : theme.textSecondary }]}>
                {label}
            </Text>
            {selected && (
                <View style={[styles.themeCheck, { backgroundColor: theme.accent }]}>
                    <Feather name="check" size={10} color="#000" />
                </View>
            )}
        </Pressable>
    );
};

// ─── Calendar view picker ─────────────────────────────────────────────────────

const CalendarViewOption = ({ value, label, icon, desc, current, onSelect, theme }) => {
    const selected = current === value;
    return (
        <Pressable
            style={[
                styles.calViewOption,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.surfaceBorder },
                selected && { borderColor: theme.accent, backgroundColor: theme.accentSubtle },
            ]}
            onPress={() => onSelect(value)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
        >
            <View style={styles.calViewOptionLeft}>
                <Feather name={icon} size={22} color={selected ? theme.accent : theme.textSecondary} />
                <View>
                    <Text style={[styles.calViewOptionLabel, { color: selected ? theme.accent : theme.textPrimary }]}>
                        {label}
                    </Text>
                    <Text style={[styles.calViewOptionDesc, { color: theme.textSecondary }]}>
                        {desc}
                    </Text>
                </View>
            </View>
            {selected && (
                <View style={[styles.calViewCheck, { backgroundColor: theme.accent }]}>
                    <Feather name="check" size={12} color="#000" />
                </View>
            )}
        </Pressable>
    );
};

// ─── Generic edit modal ───────────────────────────────────────────────────────

const EditModal = ({
    visible, onClose, title, subtitle, fields, onSubmit, submitLabel = 'Save',
    theme, loading,
}) => {
    const [values, setValues] = React.useState({});

    React.useEffect(() => {
        if (visible) {
            const init = {};
            fields.forEach(f => { init[f.key] = f.initialValue ?? ''; });
            setValues(init);
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={[styles.modalCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.surfaceBorder }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{title}</Text>
                        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.modalClose}>
                            <Feather name="x" size={20} color={theme.textTertiary} />
                        </Pressable>
                    </View>
                    {subtitle ? (
                        <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
                    ) : null}

                    {fields.map(f => (
                        <View key={f.key} style={styles.modalField}>
                            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                            <TextInput
                                style={[styles.modalInput, {
                                    backgroundColor: theme.inputBackground,
                                    color: theme.inputText,
                                    borderColor: theme.inputBorder,
                                }]}
                                value={values[f.key] ?? ''}
                                onChangeText={v => setValues(prev => ({ ...prev, [f.key]: v }))}
                                placeholder={f.placeholder ?? ''}
                                placeholderTextColor={theme.inputPlaceholder}
                                secureTextEntry={f.secure ?? false}
                                keyboardType={f.keyboardType ?? 'default'}
                                autoCapitalize={f.autoCapitalize ?? 'sentences'}
                                autoCorrect={false}
                                accessibilityLabel={f.label}
                            />
                        </View>
                    ))}

                    <View style={styles.modalActions}>
                        <Pressable
                            style={[styles.modalButtonSecondary, { borderColor: theme.divider }]}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                        >
                            <Text style={[styles.modalButtonSecondaryText, { color: theme.textSecondary }]}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.modalButtonPrimary, { backgroundColor: theme.accent }]}
                            onPress={() => onSubmit(values)}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={submitLabel}
                        >
                            {loading
                                ? <ActivityIndicator size="small" color="#000" />
                                : <Text style={styles.modalButtonPrimaryText}>{submitLabel}</Text>
                            }
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Unit picker modal ────────────────────────────────────────────────────────

const UnitPickerModal = ({ visible, current, onClose, onSelect, theme }) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
            <View style={[styles.modalCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary, marginBottom: 16 }]}>
                    Default Weight Unit
                </Text>
                {[
                    { value: 'imperial', label: 'Pounds (lbs)', desc: 'Used in the US, UK' },
                    { value: 'metric',   label: 'Kilograms (kg)', desc: 'Used internationally' },
                ].map(opt => (
                    <Pressable
                        key={opt.value}
                        style={[
                            styles.unitOption,
                            { borderColor: theme.divider, backgroundColor: theme.surface },
                            current === opt.value && { borderColor: theme.accent, backgroundColor: theme.accentSubtle },
                        ]}
                        onPress={() => { onSelect(opt.value); onClose(); }}
                        accessibilityRole="radio"
                        accessibilityLabel={opt.label}
                        accessibilityState={{ selected: current === opt.value }}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.unitOptionLabel, { color: theme.textPrimary }]}>{opt.label}</Text>
                            <Text style={[styles.unitOptionDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
                        </View>
                        {current === opt.value && (
                            <Feather name="check-circle" size={20} color={theme.accent} />
                        )}
                    </Pressable>
                ))}
            </View>
        </Pressable>
    </Modal>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
    const { theme, preference, setPreference } = useTheme();
    const scrollY = useScrollY();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));
    const { user, authFetch, signOut } = useAuth();

    const [loading, setLoading] = React.useState(false);

    // Modal visibility
    const [showEditName,     setShowEditName]     = React.useState(false);
    const [showEditEmail,    setShowEditEmail]     = React.useState(false);
    const [showEditPassword, setShowEditPassword] = React.useState(false);
    const [showUnitPicker,   setShowUnitPicker]   = React.useState(false);

    // Local prefs
    const [unitDefault,   setUnitDefault]   = React.useState(user?.unitDefault ?? 'imperial');
    const [calendarView,  setCalendarView]  = React.useState('month'); // 'month' | 'week'

    // Load saved calendar view preference
    React.useEffect(() => {
        AsyncStorage.getItem(CALENDAR_VIEW_KEY).then(v => {
            if (v === 'week' || v === 'month') setCalendarView(v);
        });
    }, []);

    // Sync unit from token refresh
    React.useEffect(() => {
        if (user?.unitDefault) setUnitDefault(user.unitDefault);
    }, [user?.unitDefault]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleCalendarViewSelect = async (value) => {
        setCalendarView(value);
        try { await AsyncStorage.setItem(CALENDAR_VIEW_KEY, value); } catch {}
    };

    const handleSaveName = async ({ fname, lname }) => {
        if (!fname.trim() || !lname.trim()) {
            Alert.alert('Required', 'First and last name are required.');
            return;
        }
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/profile/name`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fname: fname.trim(), lname: lname.trim() }),
            });
            if (res.ok) {
                setShowEditName(false);
                Alert.alert('Saved', 'Your name has been updated. Changes take effect on next sign-in.');
            } else {
                const body = await res.json();
                Alert.alert('Error', body.error ?? 'Could not update name.');
            }
        } catch {
            Alert.alert('Error', 'Network error. Please try again.');
        } finally { setLoading(false); }
    };

    const handleSaveEmail = async ({ newEmail, password }) => {
        if (!newEmail.trim() || !password) {
            Alert.alert('Required', 'New email and current password are required.');
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail.trim())) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/profile/email`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase(), password }),
            });
            if (res.ok) {
                setShowEditEmail(false);
                Alert.alert(
                    'Email Updated',
                    'Your email has been changed. Please sign in again with your new email.',
                    [{ text: 'Sign Out', onPress: signOut }]
                );
            } else {
                const body = await res.json();
                Alert.alert('Error', body.error ?? 'Could not update email.');
            }
        } catch {
            Alert.alert('Error', 'Network error. Please try again.');
        } finally { setLoading(false); }
    };

    const handleSavePassword = async ({ currentPassword, newPassword, confirmPassword }) => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('Required', 'All password fields are required.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Mismatch', 'New passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            Alert.alert('Too short', 'Password must be at least 8 characters.');
            return;
        }
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/profile/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            if (res.ok) {
                setShowEditPassword(false);
                Alert.alert('Password Changed', 'Your password has been updated.');
            } else {
                const body = await res.json();
                Alert.alert('Error', body.error ?? 'Could not update password.');
            }
        } catch {
            Alert.alert('Error', 'Network error. Please try again.');
        } finally { setLoading(false); }
    };

    const handleSaveUnit = async (unit) => {
        setUnitDefault(unit);
        try {
            await authFetch(`${WORKER_URL}/profile/unit`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitDefault: unit }),
            });
        } catch {}
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const s = makeStyles(theme);
    const themeLabel = { system: 'System', light: 'Light', dark: 'Dark' }[preference];
    const unitLabel  = unitDefault === 'metric' ? 'kg' : 'lbs';
    const calLabel   = calendarView === 'week' ? 'Weekly' : 'Monthly';

    return (
        <View style={s.container}>
            <ScrollView contentContainerStyle={s.scrollContent} onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)} scrollEventThrottle={16}>

                {/* ── Appearance ── */}
                <SectionHeader title="APPEARANCE" theme={theme} />
                <View style={[s.themeCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                    <Text style={[s.themeCardLabel, { color: theme.textSecondary }]}>Color theme</Text>
                    <View style={s.themeOptions}>
                        <ThemeOption value="system" label="Auto"  icon="smartphone"  current={preference} onSelect={setPreference} theme={theme} />
                        <ThemeOption value="light"  label="Light" icon="sun"         current={preference} onSelect={setPreference} theme={theme} />
                        <ThemeOption value="dark"   label="Dark"  icon="moon"        current={preference} onSelect={setPreference} theme={theme} />
                    </View>
                    <Text style={[s.themeHint, { color: theme.textTertiary }]}>
                        {preference === 'system' ? 'Follows your device setting' : `Always use ${preference} mode`}
                    </Text>
                </View>

                {/* ── Calendar ── */}
                <SectionHeader title="CALENDAR" theme={theme} />
                <View style={[s.calCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                    <Text style={[s.calCardLabel, { color: theme.textSecondary }]}>
                        Default calendar view
                    </Text>
                    <Text style={[s.calCardHint, { color: theme.textTertiary }]}>
                        You can also toggle the view directly in the calendar header.
                    </Text>
                    <View style={s.calViewOptions}>
                        <CalendarViewOption
                            value="month"
                            label="Monthly"
                            icon="grid"
                            desc="See the whole month at a glance"
                            current={calendarView}
                            onSelect={handleCalendarViewSelect}
                            theme={theme}
                        />
                        <CalendarViewOption
                            value="week"
                            label="Weekly"
                            icon="columns"
                            desc="Focus on the current week with a detailed list"
                            current={calendarView}
                            onSelect={handleCalendarViewSelect}
                            theme={theme}
                        />
                    </View>
                    <View style={[s.tzNote, { backgroundColor: theme.surfaceElevated, borderColor: theme.surfaceBorder }]}>
                        <Feather name="globe" size={13} color={theme.textTertiary} style={{ marginRight: 8, flexShrink: 0, marginTop: 1 }} />
                        <Text style={[s.tzNoteText, { color: theme.textTertiary }]}>
                            Today is always highlighted based on your device's current timezone.
                            Workout dates are calendar dates — a workout on April 10 shows as April 10
                            everywhere, regardless of timezone.
                        </Text>
                    </View>
                </View>

                {/* ── Profile ── */}
                <SectionHeader title="PROFILE" theme={theme} />
                <View style={s.group}>
                    <Row
                        icon="user"
                        label="Name"
                        value={user ? `${user.fname} ${user.lname}` : '—'}
                        onPress={() => setShowEditName(true)}
                        theme={theme}
                    />
                    <Row
                        icon="mail"
                        label="Email"
                        value={user?.email ?? '—'}
                        onPress={() => setShowEditEmail(true)}
                        theme={theme}
                        last
                    />
                </View>

                {/* ── Security ── */}
                <SectionHeader title="SECURITY" theme={theme} />
                <View style={s.group}>
                    <Row
                        icon="lock"
                        label="Change Password"
                        onPress={() => setShowEditPassword(true)}
                        theme={theme}
                        last
                    />
                </View>

                {/* ── Workout Defaults ── */}
                <SectionHeader title="WORKOUT DEFAULTS" theme={theme} />
                <View style={s.group}>
                    <Row
                        icon="activity"
                        label="Default Weight Unit"
                        value={unitLabel}
                        onPress={() => setShowUnitPicker(true)}
                        theme={theme}
                        last
                    />
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* ── Modals ── */}

            <EditModal
                visible={showEditName}
                onClose={() => setShowEditName(false)}
                title="Change Name"
                fields={[
                    { key: 'fname', label: 'First Name', initialValue: user?.fname, placeholder: 'First name', autoCapitalize: 'words' },
                    { key: 'lname', label: 'Last Name',  initialValue: user?.lname, placeholder: 'Last name',  autoCapitalize: 'words' },
                ]}
                onSubmit={handleSaveName}
                submitLabel="Save Name"
                theme={theme}
                loading={loading}
            />

            <EditModal
                visible={showEditEmail}
                onClose={() => setShowEditEmail(false)}
                title="Change Email"
                subtitle="You'll need to sign in again after changing your email."
                fields={[
                    { key: 'newEmail',  label: 'New Email Address', placeholder: 'new@example.com', keyboardType: 'email-address', autoCapitalize: 'none' },
                    { key: 'password',  label: 'Current Password (to confirm)', placeholder: '••••••••', secure: true },
                ]}
                onSubmit={handleSaveEmail}
                submitLabel="Update Email"
                theme={theme}
                loading={loading}
            />

            <EditModal
                visible={showEditPassword}
                onClose={() => setShowEditPassword(false)}
                title="Change Password"
                fields={[
                    { key: 'currentPassword', label: 'Current Password',     placeholder: '••••••••', secure: true },
                    { key: 'newPassword',      label: 'New Password',         placeholder: 'at least 8 characters', secure: true },
                    { key: 'confirmPassword',  label: 'Confirm New Password', placeholder: '••••••••', secure: true },
                ]}
                onSubmit={handleSavePassword}
                submitLabel="Update Password"
                theme={theme}
                loading={loading}
            />

            <UnitPickerModal
                visible={showUnitPicker}
                current={unitDefault}
                onClose={() => setShowUnitPicker(false)}
                onSelect={handleSaveUnit}
                theme={theme}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container:    { flex: 1, backgroundColor: theme.background },
        scrollContent:{ paddingBottom: 40 },
        themeCard:    { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, padding: 16 },
        themeCardLabel:{ fontSize: 13, fontWeight: '600', marginBottom: 12, color: theme.textSecondary },
        themeOptions: { flexDirection: 'row', gap: 10 },
        themeHint:    { fontSize: 11, marginTop: 10 },

        calCard:        { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, padding: 16 },
        calCardLabel:   { fontSize: 13, fontWeight: '600', marginBottom: 4 },
        calCardHint:    { fontSize: 12, marginBottom: 14, lineHeight: 16 },
        calViewOptions: { gap: 10 },
        tzNote:         { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 8, borderWidth: 1, padding: 12, marginTop: 14 },
        tzNoteText:     { fontSize: 12, lineHeight: 17, flex: 1 },

        group: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.surfaceBorder },
    });
}

const styles = StyleSheet.create({
    sectionHeader: {
        fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
        paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8,
    },
    row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, minHeight: 56 },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    rowLabel:{ flex: 1, fontSize: 15 },
    rowRight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowValue:{ fontSize: 14 },

    themeOption:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, gap: 6, position: 'relative', minHeight: 72 },
    themeOptionLabel: { fontSize: 12, fontWeight: '600' },
    themeCheck:       { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

    calViewOption:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1.5, padding: 14, minHeight: 64 },
    calViewOptionLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    calViewOptionLabel: { fontSize: 15, fontWeight: '600' },
    calViewOptionDesc:  { fontSize: 12, marginTop: 2 },
    calViewCheck:       { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

    unitOption:      { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
    unitOptionLabel: { fontSize: 15, fontWeight: '600' },
    unitOptionDesc:  { fontSize: 12, marginTop: 2 },

    modalOverlay:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard:      { width: '100%', borderRadius: 16, padding: 24, borderWidth: 1 },
    modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    modalClose:     { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    modalTitle:     { fontSize: 18, fontWeight: 'bold' },
    modalSubtitle:  { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    modalField:     { marginBottom: 14 },
    fieldLabel:     { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    modalInput:     { height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
    modalActions:   { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalButtonPrimary:       { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    modalButtonPrimaryText:   { color: '#000', fontWeight: '700', fontSize: 15 },
    modalButtonSecondary:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
    modalButtonSecondaryText: { fontSize: 15 },
});