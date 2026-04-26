import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import ClientInformationScreen from '../../screens/ClientInformationScreen';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#1a1a1a', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666',
    divider: '#222', fieldBackground: '#1a1a1a', overlay: 'rgba(0,0,0,0.75)',
    accent: '#fba8a0', accentText: '#fba8a0', accentSubtle: 'rgba(251,168,160,0.12)',
    accentPressed: '#e8746a', inputText: '#fff', inputPlaceholder: '#888',
    danger: '#c0392b', success: '#7bb533', mode: 'dark',
};

jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

const mockAuthFetch = jest.fn();
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ authFetch: mockAuthFetch }),
}));

jest.mock('../../components/LimitationModal', () => {
    const { View } = require('react-native');
    return ({ visible }) => visible ? <View testID="limitation-modal" /> : null;
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROUTE = { params: { clientEmail: 'client@test.com', clientName: 'Jane Smith' } };

const PATTERNS = [
    { id: 'mp-01', name: 'overhead_press', label: 'Overhead Press', display_order: 1 },
    { id: 'mp-02', name: 'horizontal_push', label: 'Horizontal Push', display_order: 2 },
];

const EMPTY_PROFILE_RESPONSE = {
    athleteProfile: null,
    rpeDisplay: 'numeric',
    connectedDevices: [],
};

const FULL_PROFILE_RESPONSE = {
    athleteProfile: {
        experience_level: 'intermediate',
        training_focus: '["strength"]',
        sport: 'Powerlifting',
        competition_date: '2026-10-15',
        limitations: JSON.stringify([{
            id: 'lim-1',
            regions: ['right_shoulder'],
            patterns_affected: ['overhead_press'],
            severity: 'avoid',
            notes: 'AC joint',
            since: '2025-09',
            until: null,
            is_active: true,
        }]),
        private_notes: 'Prefers morning sessions',
    },
    rpeDisplay: 'descriptive',
    connectedDevices: [],
};

function mockFetches(profileResponse = EMPTY_PROFILE_RESPONSE, patterns = PATTERNS) {
    mockAuthFetch.mockImplementation((url) => {
        if (url.includes('/movement-patterns')) {
            return Promise.resolve({ ok: true, json: async () => patterns });
        }
        return Promise.resolve({ ok: true, json: async () => profileResponse });
    });
}

beforeEach(() => jest.clearAllMocks());

// ─── Loading + rendering ──────────────────────────────────────────────────────

it('shows loading indicator before data resolves', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    expect(screen.queryByText('Save Changes')).toBeNull();
});

it('renders client name and email in header', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeTruthy();
        expect(screen.getByText('client@test.com')).toBeTruthy();
    });
});

it('renders all five sections', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByText(/Athlete Profile/i)).toBeTruthy();
        expect(screen.getByText(/Private Notes/i)).toBeTruthy();
        expect(screen.getByText('Limitations')).toBeTruthy();
        expect(screen.getByText(/Connected Devices/i)).toBeTruthy();
        expect(screen.getByText(/RPE Display/i)).toBeTruthy();
    });
});

// ─── Pre-population ───────────────────────────────────────────────────────────

it('pre-populates experience level from existing profile', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByLabelText(/Experience level: Intermediate/i)).toBeTruthy();
    });
});

it('pre-populates training focus from existing profile', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByText('Strength')).toBeTruthy();
    });
});

it('pre-populates sport text field', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByDisplayValue('Powerlifting')).toBeTruthy();
    });
});

it('pre-populates private notes', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByDisplayValue('Prefers morning sessions')).toBeTruthy();
    });
});

it('pre-populates RPE display selection', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        const descriptive = screen.getByRole('radio', { name: /Descriptive/ });
        expect(descriptive.props.accessibilityState.checked).toBe(true);
    });
});

it('renders active limitations from profile', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => {
        expect(screen.getByText('Right Shoulder')).toBeTruthy();
        expect(screen.getByText('Avoid')).toBeTruthy();
    });
});

// ─── Interaction ──────────────────────────────────────────────────────────────

it('selecting experience level updates the dropdown label', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByLabelText(/Select experience level/i));
    fireEvent.press(screen.getByLabelText(/Select experience level/i));
    fireEvent.press(screen.getByLabelText('Advanced'));
    expect(screen.getByLabelText(/Experience level: Advanced/i)).toBeTruthy();
});

it('selecting training focus adds a bubble', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByLabelText('Add training focus'));
    fireEvent.press(screen.getByLabelText('Add training focus'));
    fireEvent.press(screen.getByLabelText('Hypertrophy'));
    expect(screen.getByText('Hypertrophy')).toBeTruthy();
});

it('removing training focus bubble removes it from the list', async () => {
    mockFetches(FULL_PROFILE_RESPONSE);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByText('Strength'));
    fireEvent.press(screen.getByLabelText('Remove Strength'));
    expect(screen.queryByText('Strength')).toBeNull();
});

it('switching RPE to Descriptive updates selection', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByRole('radio', { name: /Descriptive/ }));
    fireEvent.press(screen.getByRole('radio', { name: /Descriptive/ }));
    const numeric = screen.getByRole('radio', { name: /Numeric/ });
    expect(numeric.props.accessibilityState.checked).toBe(false);
});

it('Add Limitation button opens the limitation modal', async () => {
    mockFetches();
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByRole('button', { name: 'Add limitation' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add limitation' }));
    expect(screen.getByTestId('limitation-modal')).toBeTruthy();
});

// ─── Save ─────────────────────────────────────────────────────────────────────

it('Save Changes PATCHes the profile endpoint', async () => {
    mockFetches();
    mockAuthFetch
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => EMPTY_PROFILE_RESPONSE }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => PATTERNS }))
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }));

    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save changes' })); });

    const saveCall = mockAuthFetch.mock.calls.find(c =>
        c[0].includes('/clients/') && c[1]?.method === 'PATCH'
    );
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(saveCall[1].body);
    expect(body.rpe_display).toBe('numeric');
});

it('shows error message when save fails', async () => {
    mockFetches();
    mockAuthFetch
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => EMPTY_PROFILE_RESPONSE }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => PATTERNS }))
        .mockResolvedValueOnce({ ok: false });

    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save changes' })); });

    await waitFor(() => {
        expect(screen.getByText(/Could not save/i)).toBeTruthy();
    });
});

// ─── Past limitations ─────────────────────────────────────────────────────────

it('past limitations are hidden behind a toggle', async () => {
    const profileWithPast = {
        ...FULL_PROFILE_RESPONSE,
        athleteProfile: {
            ...FULL_PROFILE_RESPONSE.athleteProfile,
            limitations: JSON.stringify([
                { id: 'lim-1', regions: ['right_shoulder'], patterns_affected: [], severity: 'avoid', notes: null, since: '2025-09', until: null, is_active: true },
                { id: 'lim-2', regions: ['left_knee'], patterns_affected: [], severity: 'modify', notes: 'Healed', since: '2024-01', until: '2024-06', is_active: false },
            ]),
        },
    };
    mockFetches(profileWithPast);
    render(<ClientInformationScreen route={ROUTE} navigation={{}} />);
    await waitFor(() => screen.getByRole('button', { name: /Expand limitation history/ }));

    // Past limitation text not visible yet
    expect(screen.queryByText('Left Knee')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: /Expand limitation history/ }));
    await waitFor(() => {
        expect(screen.getByText('Left Knee')).toBeTruthy();
    });
});
