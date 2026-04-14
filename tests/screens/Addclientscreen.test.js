/**
 * AddClientScreen.test.js
 * Location: <your-app-repo>/__tests__/screens/AddClientScreen.test.js
 *
 * Run with: npx jest
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AddClientScreen from '../../screens/AddClientScreen';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuthFetch = jest.fn();
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ authFetch: mockAuthFetch }),
}));

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
    };
});

jest.mock('@react-navigation/elements', () => ({
    useHeaderHeight: () => 0,
}));

jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({
        theme: {
            background: '#000', surface: '#111', surfaceElevated: '#222',
            surfaceBorder: '#333', textPrimary: '#fff', textSecondary: '#aaa',
            textTertiary: '#666', divider: '#444', accent: '#fba8a0',
            accentSubtle: '#3a2020', inputBackground: '#111', inputText: '#fff',
            inputBorder: '#333', inputPlaceholder: '#666', overlay: 'rgba(0,0,0,0.5)',
        },
    }),
}));

jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: jest.fn() }),
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('AddClientScreen — rendering', () => {
    it('renders first name, last name, and email inputs', () => {
        const { getByPlaceholderText } = render(<AddClientScreen />);
        expect(getByPlaceholderText('first name')).toBeTruthy();
        expect(getByPlaceholderText('last name')).toBeTruthy();
        expect(getByPlaceholderText('email')).toBeTruthy();
    });

    it('renders the Add Client button', () => {
        const { getByText } = render(<AddClientScreen />);
        expect(getByText('Add Client & Send Invite')).toBeTruthy();
    });

    it('shows instructional subtitle text', () => {
        const { getByText } = render(<AddClientScreen />);
        expect(getByText(/email them an access code/i)).toBeTruthy();
    });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('AddClientScreen — client-side validation', () => {
    it('shows alert and does not call API when first name is empty', async () => {
        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Missing Fields', expect.any(String));
            expect(mockAuthFetch).not.toHaveBeenCalled();
        });
    });

    it('shows alert when last name is empty', async () => {
        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Missing Fields', expect.any(String));
        });
    });

    it('shows alert when email is empty', async () => {
        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Missing Fields', expect.any(String));
        });
    });

    it('shows alert for invalid email format', async () => {
        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), 'not-an-email');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Invalid Email', expect.any(String));
            expect(mockAuthFetch).not.toHaveBeenCalled();
        });
    });

    it('does not show alert and calls API for valid inputs', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'Client added and invitation sent', clientId: 'new-uuid' }),
        });

        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalled();
            expect(alertSpy).not.toHaveBeenCalled();
        });
    });
});

// ─── API interaction ──────────────────────────────────────────────────────────

describe('AddClientScreen — API interaction', () => {
    function fillAndSubmit(getByPlaceholderText, getByText, overrides = {}) {
        fireEvent.changeText(getByPlaceholderText('first name'), overrides.fname ?? 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), overrides.lname ?? 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), overrides.email ?? 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));
    }

    it('calls authFetch with correct endpoint and body', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'ok', clientId: 'uuid' }),
        });

        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);

        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/coach/add-client'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('jane@example.com'),
                }),
            );
        });
    });

    it('sends email in lowercase regardless of what was typed', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'ok', clientId: 'uuid' }),
        });

        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText, { email: 'JANE@EXAMPLE.COM' });

        await waitFor(() => {
            const sentBody = JSON.parse(mockAuthFetch.mock.calls[0][1].body);
            expect(sentBody.email).toBe('jane@example.com');
        });
    });

    it('shows success screen after API returns 201', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'Client added and invitation sent', clientId: 'new-uuid' }),
        });

        const { getByPlaceholderText, getByText, findByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);

        expect(await findByText('Client Added')).toBeTruthy();
        expect(await findByText('Jane Doe')).toBeTruthy();
    });

    it('success screen shows the email the invite was sent to', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'ok', clientId: 'uuid' }),
        });

        const { getByPlaceholderText, getByText, findByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);

        expect(await findByText('jane@example.com')).toBeTruthy();
    });

    it('clears form fields after successful submission', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'ok', clientId: 'uuid' }),
        });

        const { getByPlaceholderText, getByText, findByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);
        await findByText('Client Added');

        // Tap "Add Another" to go back to the form
        fireEvent.press(getByText('Add Another Client'));
        expect(getByPlaceholderText('first name').props.value).toBe('');
        expect(getByPlaceholderText('last name').props.value).toBe('');
        expect(getByPlaceholderText('email').props.value).toBe('');
    });

    it('shows API error message in alert when response is not ok', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'This client is already in your roster' }),
        });

        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Error', 'This client is already in your roster');
        });
    });

    it('shows generic network error alert when fetch throws', async () => {
        mockAuthFetch.mockRejectedValueOnce(new Error('Network error'));

        const { getByPlaceholderText, getByText } = render(<AddClientScreen />);
        fillAndSubmit(getByPlaceholderText, getByText);

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Error', 'Network error. Please check your connection.');
        });
    });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('AddClientScreen — loading state', () => {
    it('shows loading indicator while request is in flight', async () => {
        let resolveRequest;
        mockAuthFetch.mockReturnValueOnce(
            new Promise(resolve => { resolveRequest = resolve; })
        );

        const { getByPlaceholderText, getByText, queryByText, getByTestId } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));

        // Button should be replaced by the spinner
        await waitFor(() => {
            expect(queryByText('Add Client & Send Invite')).toBeNull();
            expect(getByText('Sending invitation...')).toBeTruthy();
        });

        // Resolve so the component doesn't hang
        resolveRequest({ ok: true, json: async () => ({ message: 'ok', clientId: 'uuid' }) });
    });
});

// ─── Add Another flow ─────────────────────────────────────────────────────────

describe('AddClientScreen — Add Another Client flow', () => {
    it('returns to empty form when Add Another is pressed', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: 'ok', clientId: 'uuid' }),
        });

        const { getByPlaceholderText, getByText, findByText, queryByText } = render(<AddClientScreen />);
        fireEvent.changeText(getByPlaceholderText('first name'), 'Jane');
        fireEvent.changeText(getByPlaceholderText('last name'), 'Doe');
        fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
        fireEvent.press(getByText('Add Client & Send Invite'));

        await findByText('Client Added');
        fireEvent.press(getByText('Add Another Client'));

        expect(queryByText('Client Added')).toBeNull();
        expect(getByText('Add Client & Send Invite')).toBeTruthy();
    });
});