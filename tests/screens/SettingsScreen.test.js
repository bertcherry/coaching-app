/**
 * tests/screens/SettingsScreen.test.js
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SettingsScreen from '../../screens/SettingsScreen';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
    };
});

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(null),
}));

// CalendarScreen exports CALENDAR_VIEW_KEY — stub the whole module
jest.mock('../../screens/CalendarScreen', () => ({
    CALENDAR_VIEW_KEY: 'calendar_view_preference',
    default: () => null,
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222',
    surfaceBorder: '#333', textPrimary: '#fff', textSecondary: '#aaa',
    textTertiary: '#666', divider: '#444', accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff',
    accentSubtle: '#3a2020', inputBackground: '#111', inputText: '#fff',
    inputBorder: '#333', inputPlaceholder: '#666', overlay: 'rgba(0,0,0,0.5)',
    mode: 'dark',
};
const mockSetPreference = jest.fn();
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme, preference: 'dark', setPreference: mockSetPreference }),
}));

const mockScrollSetValue = jest.fn();
jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: mockScrollSetValue }),
}));

const mockAuthFetch = jest.fn();
const mockSignOut   = jest.fn();
let mockUser = {
    sub: 'client@example.com', email: 'client@example.com',
    fname: 'Jane', lname: 'Doe', isCoach: false, unitDefault: 'imperial',
};

jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: mockUser, authFetch: mockAuthFetch, signOut: mockSignOut }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockNotifSettingsResponse(settings = null) {
    mockAuthFetch.mockResolvedValue({
        ok: true,
        json: async () => settings ? { settings } : {},
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUser = {
        sub: 'client@example.com', email: 'client@example.com',
        fname: 'Jane', lname: 'Doe', isCoach: false, unitDefault: 'imperial',
    };
    // Default: notification-settings fetch returns empty (uses defaults)
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

// ─── Section rendering ────────────────────────────────────────────────────────

describe('SettingsScreen — section rendering', () => {
    it('renders all section headers', async () => {
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('APPEARANCE')).toBeTruthy();
            expect(screen.getByText('CALENDAR')).toBeTruthy();
            expect(screen.getByText('PROFILE')).toBeTruthy();
            expect(screen.getByText('SECURITY')).toBeTruthy();
            expect(screen.getByText('WORKOUT DEFAULTS')).toBeTruthy();
            expect(screen.getByText('NOTIFICATIONS')).toBeTruthy();
        });
    });

    it('shows user name and email in Profile rows', async () => {
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeTruthy();
            expect(screen.getByText('client@example.com')).toBeTruthy();
        });
    });

    it('shows lbs as default unit for imperial users', async () => {
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('lbs')).toBeTruthy();
        });
    });

    it('shows kg for metric users', async () => {
        mockUser = { ...mockUser, unitDefault: 'metric' };
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('kg')).toBeTruthy();
        });
    });
});

// ─── Notifications section ────────────────────────────────────────────────────

describe('SettingsScreen — notifications section', () => {
    it('shows coach notification rows (workout_completed, workout_skipped)', async () => {
        mockUser = { ...mockUser, isCoach: true };
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('Client completes workout')).toBeTruthy();
            expect(screen.getByText('Client skips workout')).toBeTruthy();
        });
        expect(screen.queryByText('New workout assigned')).toBeNull();
    });

    it('shows client notification row (new_workout)', async () => {
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(screen.getByText('New workout assigned')).toBeTruthy();
        });
        expect(screen.queryByText('Client completes workout')).toBeNull();
    });

    it('loads notification settings from API on mount', async () => {
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/profile/notification-settings'),
            );
        });
    });

    it('PATCHes notification settings when a push toggle is pressed', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByText('New workout assigned'));

        const pushBtn = screen.getByLabelText('Push notification for New workout assigned');
        fireEvent.press(pushBtn);

        await waitFor(() => {
            const patchCall = mockAuthFetch.mock.calls.find(([url, opts]) =>
                typeof url === 'string' &&
                url.includes('/profile/notification-settings') &&
                opts?.method === 'PATCH',
            );
            expect(patchCall).toBeDefined();
        });
    });
});

// ─── Name edit modal ──────────────────────────────────────────────────────────

describe('SettingsScreen — edit name modal', () => {
    it('opens name modal when Name row is pressed', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByText('Jane Doe'));

        fireEvent.press(screen.getByLabelText('Name: Jane Doe'));

        // The modal title appears
        expect(screen.getByText('Change Name')).toBeTruthy();
    });

    it('shows alert when first name is empty', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByText('Jane Doe'));

        fireEvent.press(screen.getByLabelText('Name: Jane Doe'));

        // Clear the fname field and submit
        const fnameInput = screen.getByLabelText('First Name');
        fireEvent.changeText(fnameInput, '');

        fireEvent.press(screen.getByLabelText('Save Name'));

        expect(Alert.alert).toHaveBeenCalledWith('Required', expect.stringContaining('required'));
    });

    it('calls PATCH /profile/name on valid submit', async () => {
        mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
        render(<SettingsScreen />);
        await waitFor(() => screen.getByText('Jane Doe'));

        fireEvent.press(screen.getByLabelText('Name: Jane Doe'));

        const lnameInput = screen.getByLabelText('Last Name');
        fireEvent.changeText(lnameInput, 'Smith');

        fireEvent.press(screen.getByLabelText('Save Name'));

        await waitFor(() => {
            const patchCall = mockAuthFetch.mock.calls.find(([url, opts]) =>
                typeof url === 'string' &&
                url.includes('/profile/name') &&
                opts?.method === 'PATCH',
            );
            expect(patchCall).toBeDefined();
        });
    });
});

// ─── Password modal ───────────────────────────────────────────────────────────

describe('SettingsScreen — change password modal', () => {
    async function openPasswordModal() {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByLabelText('Change Password'));
        fireEvent.press(screen.getByLabelText('Change Password'));
    }

    it('shows alert when passwords do not match', async () => {
        await openPasswordModal();

        fireEvent.changeText(screen.getByLabelText('Current Password'), 'oldpass123');
        fireEvent.changeText(screen.getByLabelText('New Password'), 'newpass123');
        fireEvent.changeText(screen.getByLabelText('Confirm New Password'), 'differentpass');

        fireEvent.press(screen.getByLabelText('Update Password'));

        expect(Alert.alert).toHaveBeenCalledWith('Mismatch', expect.stringContaining('do not match'));
    });

    it('shows alert when new password is too short', async () => {
        await openPasswordModal();

        fireEvent.changeText(screen.getByLabelText('Current Password'), 'oldpass123');
        fireEvent.changeText(screen.getByLabelText('New Password'), 'short');
        fireEvent.changeText(screen.getByLabelText('Confirm New Password'), 'short');

        fireEvent.press(screen.getByLabelText('Update Password'));

        expect(Alert.alert).toHaveBeenCalledWith('Too short', expect.stringContaining('8 characters'));
    });

    it('shows alert when fields are empty', async () => {
        await openPasswordModal();

        fireEvent.press(screen.getByLabelText('Update Password'));

        expect(Alert.alert).toHaveBeenCalledWith('Required', expect.stringContaining('required'));
    });
});

// ─── Email modal ──────────────────────────────────────────────────────────────

describe('SettingsScreen — change email modal', () => {
    it('shows invalid email alert for bad format', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByLabelText('Email: client@example.com'));
        fireEvent.press(screen.getByLabelText('Email: client@example.com'));

        fireEvent.changeText(screen.getByLabelText('New Email Address'), 'not-an-email');
        fireEvent.changeText(screen.getByLabelText('Current Password (to confirm)'), 'mypassword');

        fireEvent.press(screen.getByLabelText('Update Email'));

        expect(Alert.alert).toHaveBeenCalledWith('Invalid Email', expect.any(String));
    });

    it('shows required alert when fields are empty', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByLabelText('Email: client@example.com'));
        fireEvent.press(screen.getByLabelText('Email: client@example.com'));

        fireEvent.press(screen.getByLabelText('Update Email'));

        expect(Alert.alert).toHaveBeenCalledWith('Required', expect.any(String));
    });
});

// ─── Calendar view selection ──────────────────────────────────────────────────

describe('SettingsScreen — calendar view', () => {
    it('persists selected calendar view to AsyncStorage', async () => {
        render(<SettingsScreen />);
        await waitFor(() => screen.getByLabelText('Weekly'));

        fireEvent.press(screen.getByLabelText('Weekly'));

        await waitFor(() => {
            expect(AsyncStorage.setItem).toHaveBeenCalledWith('calendar_view_preference', 'week');
        });
    });

    it('loads saved calendar view from AsyncStorage on mount', async () => {
        AsyncStorage.getItem.mockResolvedValue('week');
        render(<SettingsScreen />);
        await waitFor(() => {
            expect(AsyncStorage.getItem).toHaveBeenCalledWith('calendar_view_preference');
        });
    });
});
