import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import CheckInModal from '../../components/CheckInModal';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666',
    divider: '#222', fieldBackground: '#1a1a1a', overlay: 'rgba(0,0,0,0.75)',
    accent: '#fba8a0', accentText: '#fba8a0', accentSubtle: 'rgba(251,168,160,0.12)',
    accentPressed: '#e8746a', inputText: '#000', inputPlaceholder: '#888',
    danger: '#c0392b', success: '#7bb533', mode: 'dark',
};

jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

const mockAuthFetch = jest.fn();
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ authFetch: mockAuthFetch }),
}));

// ReadinessScale is rendered inside CheckInModal — mock it to a simple pressable per key
jest.mock('../../components/ReadinessScale', () => {
    const { Pressable, Text } = require('react-native');
    return ({ question, onChange, testID }) => (
        <Pressable testID={testID} onPress={() => onChange(4)} accessibilityLabel={question}>
            <Text>{question}</Text>
        </Pressable>
    );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCALE_TEST_IDS = [
    'scale-sleep_quality',
    'scale-recovery',
    'scale-energy',
    'scale-mental_focus',
    'scale-readiness',
];

function answerAllQuestions() {
    SCALE_TEST_IDS.forEach(id => fireEvent.press(screen.getByTestId(id)));
}

const baseProps = {
    visible: true,
    onClose: jest.fn(),
    scheduledDate: '2099-12-31',
    scheduledWorkoutId: 'sw-1',
    clientEmail: 'client@test.com',
    clientTimezone: 'UTC',
    onMoveToToday: jest.fn(),
};

beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing check-in
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => null });
});

// ─── Move prompt step (workout on different day) ───────────────────────────────

describe('move prompt', () => {
    it('shows move prompt when workout is not today', async () => {
        render(<CheckInModal {...baseProps} scheduledDate="2099-11-01" />);
        await waitFor(() => {
            expect(screen.getByText(/Did you mean to move/)).toBeTruthy();
        });
    });

    it('skips move prompt when workout is today', async () => {
        // Use a date that getTodayInTimezone will return — mock with a known value
        // by setting scheduledDate to something that won't match today's UTC date but
        // passing a scheduledDate that equals the system date via null
        render(<CheckInModal {...baseProps} scheduledDate={null} />);
        await waitFor(() => {
            expect(screen.queryByText(/Did you mean to move/)).toBeNull();
        });
    });

    it('"Check in only" advances to questions', async () => {
        render(<CheckInModal {...baseProps} scheduledDate="2099-11-01" />);
        await waitFor(() => screen.getByText('Check in only'));
        fireEvent.press(screen.getByText('Check in only'));
        await waitFor(() => {
            expect(screen.getByText('How well did you sleep?')).toBeTruthy();
        });
    });

    it('"Cancel" calls onClose', async () => {
        const onClose = jest.fn();
        render(<CheckInModal {...baseProps} scheduledDate="2099-11-01" onClose={onClose} />);
        await waitFor(() => screen.getByText('Cancel'));
        fireEvent.press(screen.getByText('Cancel'));
        expect(onClose).toHaveBeenCalled();
    });

    it('"Yes, move to today" calls onMoveToToday and advances to questions', async () => {
        const onMoveToToday = jest.fn().mockResolvedValue(undefined);
        render(<CheckInModal {...baseProps} scheduledDate="2099-11-01" onMoveToToday={onMoveToToday} />);
        await waitFor(() => screen.getByText('Yes, move to today'));
        await act(async () => { fireEvent.press(screen.getByText('Yes, move to today')); });
        expect(onMoveToToday).toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByText('How well did you sleep?')).toBeTruthy();
        });
    });

    it('advances to questions even if onMoveToToday rejects', async () => {
        const onMoveToToday = jest.fn().mockRejectedValue(new Error('network'));
        render(<CheckInModal {...baseProps} scheduledDate="2099-11-01" onMoveToToday={onMoveToToday} />);
        await waitFor(() => screen.getByText('Yes, move to today'));
        await act(async () => { fireEvent.press(screen.getByText('Yes, move to today')); });
        await waitFor(() => {
            expect(screen.getByText('How well did you sleep?')).toBeTruthy();
        });
    });
});

// ─── Questions step ────────────────────────────────────────────────────────────

describe('questions step', () => {
    async function renderAtQuestions(props = {}) {
        render(<CheckInModal {...baseProps} scheduledDate={null} {...props} />);
        await waitFor(() => screen.getByText('How well did you sleep?'));
    }

    it('renders all 5 questions', async () => {
        await renderAtQuestions();
        expect(screen.getByText('How well did you sleep?')).toBeTruthy();
        expect(screen.getByText('How recovered do you feel?')).toBeTruthy();
        expect(screen.getByText('How is your energy?')).toBeTruthy();
        expect(screen.getByText('How calm and focused do you feel?')).toBeTruthy();
        expect(screen.getByText('Overall, how ready are you to train?')).toBeTruthy();
    });

    it('submit button is disabled until all questions answered', async () => {
        await renderAtQuestions();
        const submit = screen.getByRole('button', { name: /Submit Check-In/i });
        expect(submit.props.accessibilityState.disabled).toBe(true);
    });

    it('submit button enables once all questions answered', async () => {
        await renderAtQuestions();
        answerAllQuestions();
        const submit = screen.getByRole('button', { name: /Submit Check-In/i });
        expect(submit.props.accessibilityState.disabled).toBe(false);
    });

    it('posts to /checkins and calls onClose on success', async () => {
        const onClose = jest.fn();
        mockAuthFetch
            .mockResolvedValueOnce({ ok: true, json: async () => null }) // today fetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // submit
        await renderAtQuestions({ onClose });
        answerAllQuestions();
        await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Submit Check-In/i })); });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const submitCall = mockAuthFetch.mock.calls.find(c => c[0].includes('/checkins') && c[1]?.method === 'POST');
        expect(submitCall).toBeTruthy();
        const body = JSON.parse(submitCall[1].body);
        expect(body.type).toBe('pre_workout');
        expect(body.readiness).toBe(4);
    });

    it('shows error message when submit fails', async () => {
        mockAuthFetch
            .mockResolvedValueOnce({ ok: true, json: async () => null })
            .mockResolvedValueOnce({ ok: false });
        await renderAtQuestions();
        answerAllQuestions();
        await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Submit Check-In/i })); });
        await waitFor(() => {
            expect(screen.getByText(/Could not save check-in/)).toBeTruthy();
        });
    });
});

// ─── Pre-population (editing existing check-in) ────────────────────────────────

describe('pre-population', () => {
    it('shows "Updating" banner and "Update Check-In" button when check-in already exists', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                readiness: 3, sleep_quality: 2, energy: 4, recovery: 3, mental_focus: 5, notes: 'feeling tired',
            }),
        });
        render(<CheckInModal {...baseProps} scheduledDate={null} />);
        await waitFor(() => {
            expect(screen.getByText(/Updating today/)).toBeTruthy();
            expect(screen.getByRole('button', { name: /Update Check-In/i })).toBeTruthy();
        });
    });

    it('pre-populates notes field with existing value', async () => {
        mockAuthFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                readiness: 3, sleep_quality: 2, energy: 4, recovery: 3, mental_focus: 5, notes: 'feeling tired',
            }),
        });
        render(<CheckInModal {...baseProps} scheduledDate={null} />);
        await waitFor(() => {
            expect(screen.getByDisplayValue('feeling tired')).toBeTruthy();
        });
    });
});
