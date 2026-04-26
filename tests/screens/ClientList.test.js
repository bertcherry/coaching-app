/**
 * tests/screens/ClientList.test.js
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import ClientList from '../../screens/ClientList';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useNavigation: () => ({ navigate: mockNavigate }),
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
    };
});

const mockAuthFetch = jest.fn();
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ authFetch: mockAuthFetch }),
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222',
    surfaceBorder: '#333', textPrimary: '#fff', textSecondary: '#aaa',
    textTertiary: '#666', divider: '#444', accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff',
    accentSubtle: '#3a2020', mode: 'dark',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

const mockScrollSetValue = jest.fn();
jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: mockScrollSetValue }),
}));

let mockUnreadClientEmails = new Set();
jest.mock('../../context/NotificationsContext', () => ({
    useNotifications: () => ({ unreadClientEmails: mockUnreadClientEmails }),
}));

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

jest.mock('../../components/NotificationDot', () => {
    const { View } = require('react-native');
    return ({ visible }) => visible ? <View testID="notification-dot" /> : null;
});

jest.mock('../../components/Button', () => {
    const { TouchableOpacity, Text } = require('react-native');
    return ({ text, onPress }) => (
        <TouchableOpacity onPress={onPress} accessibilityLabel={text}>
            <Text>{text}</Text>
        </TouchableOpacity>
    );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clientsResponse(clients) {
    mockAuthFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ clients }),
    });
}

const ALICE = { email: 'alice@example.com', fname: 'Alice', lname: 'Smith', emailConfirmed: 1 };
const BOB   = { email: 'bob@example.com',   fname: 'Bob',   lname: 'Jones', emailConfirmed: 0 };

beforeEach(() => {
    jest.clearAllMocks();
    mockUnreadClientEmails = new Set();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

it('shows loading indicator initially', () => {
    // Never resolve so we stay in loading state
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<ClientList />);
    // ActivityIndicator is shown — empty/error states are hidden
    expect(screen.queryByText('No clients yet')).toBeNull();
    expect(screen.queryByText(/network error/i)).toBeNull();
});

it('shows empty state when API returns no clients', async () => {
    clientsResponse([]);
    render(<ClientList />);
    await waitFor(() => {
        expect(screen.getByText(/no clients yet/i)).toBeTruthy();
    });
});

it('renders client names and emails', async () => {
    clientsResponse([ALICE, BOB]);
    render(<ClientList />);
    await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeTruthy();
        expect(screen.getByText('alice@example.com')).toBeTruthy();
        expect(screen.getByText('Bob Jones')).toBeTruthy();
        expect(screen.getByText('bob@example.com')).toBeTruthy();
    });
});

it('shows Pending badge for unconfirmed clients only', async () => {
    clientsResponse([ALICE, BOB]);
    render(<ClientList />);
    await waitFor(() => {
        const pending = screen.getAllByText('Pending');
        expect(pending).toHaveLength(1); // only BOB is unconfirmed
    });
});

it('shows error text when API returns non-ok response', async () => {
    mockAuthFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
    });
    render(<ClientList />);
    await waitFor(() => {
        expect(screen.getByText('Unauthorized')).toBeTruthy();
    });
});

it('shows network error message when fetch throws', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network error'));
    render(<ClientList />);
    await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeTruthy();
    });
});

it('navigates to My Calendar with correct params on client press', async () => {
    clientsResponse([ALICE]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));

    fireEvent.press(screen.getByText('Alice Smith'));

    expect(mockNavigate).toHaveBeenCalledWith('My Calendar', {
        screen: 'Calendar',
        params: {
            clientEmail: 'alice@example.com',
            clientName: 'Alice Smith',
            clientTimezone: 'UTC',
        },
    });
});

it('uses client timezone if present', async () => {
    clientsResponse([{ ...ALICE, timezone: 'America/New_York' }]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));

    fireEvent.press(screen.getByText('Alice Smith'));

    expect(mockNavigate).toHaveBeenCalledWith(
        'My Calendar',
        expect.objectContaining({
            params: expect.objectContaining({ clientTimezone: 'America/New_York' }),
        }),
    );
});

it('navigates to Add Client screen on button press', async () => {
    clientsResponse([]);
    render(<ClientList />);
    await waitFor(() => screen.getByText(/no clients yet/i));

    fireEvent.press(screen.getByText('Add Client'));
    expect(mockNavigate).toHaveBeenCalledWith('Add Client');
});

it('shows notification dot for clients with unread emails', async () => {
    mockUnreadClientEmails = new Set(['alice@example.com']);
    clientsResponse([ALICE, BOB]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.getByTestId('notification-dot')).toBeTruthy();
});

it('renders calendar and user icon buttons for each client', async () => {
    clientsResponse([ALICE, BOB]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.getByTestId('client-calendar-btn-alice@example.com')).toBeTruthy();
    expect(screen.getByTestId('client-calendar-btn-bob@example.com')).toBeTruthy();
    expect(screen.getByTestId('client-info-btn-alice@example.com')).toBeTruthy();
    expect(screen.getByTestId('client-info-btn-bob@example.com')).toBeTruthy();
});

it('tapping calendar icon navigates to calendar', async () => {
    clientsResponse([ALICE]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));

    fireEvent.press(screen.getByTestId('client-calendar-btn-alice@example.com'));

    expect(mockNavigate).toHaveBeenCalledWith('My Calendar', expect.objectContaining({
        screen: 'Calendar',
        params: expect.objectContaining({ clientEmail: 'alice@example.com' }),
    }));
});

it('tapping user icon navigates to Client Information', async () => {
    clientsResponse([ALICE]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));

    fireEvent.press(screen.getByTestId('client-info-btn-alice@example.com'));

    expect(mockNavigate).toHaveBeenCalledWith('Client Information', {
        clientEmail: 'alice@example.com',
        clientName: 'Alice Smith',
    });
});

it('tapping client row still navigates to calendar', async () => {
    clientsResponse([ALICE]);
    render(<ClientList />);
    await waitFor(() => screen.getByText('Alice Smith'));

    fireEvent.press(screen.getByText('Alice Smith'));

    expect(mockNavigate).toHaveBeenCalledWith('My Calendar', expect.objectContaining({
        screen: 'Calendar',
        params: expect.objectContaining({ clientEmail: 'alice@example.com' }),
    }));
});
