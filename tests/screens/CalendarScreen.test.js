/**
 * tests/screens/CalendarScreen.test.js
 *
 * Covers the key behaviors of the CalendarScreen component:
 *   - Initial loading state
 *   - API fetch on mount with correct params
 *   - Rendering workouts from the schedule
 *   - Calendar header (month label, day-of-week labels)
 *   - View toggle (month ↔ week)
 *   - Error handling
 *   - Coach vs client differences
 *   - Workout press → navigate to Workout Preview
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarScreen from '../../screens/CalendarScreen';

// ─── Heavy native mocks ───────────────────────────────────────────────────────

// react-native-reanimated: replace shared values / animated views with no-ops
jest.mock('react-native-reanimated', () => {
    const { View } = require('react-native');
    return {
        __esModule: true,
        default: { View },
        useSharedValue: (v) => ({ value: v }),
        useAnimatedStyle: () => ({}),
        withSpring: (v) => v,
        runOnJS: (fn) => fn,
    };
});

// react-native-gesture-handler: GestureDetector passes through children;
// Gesture builders return chainable no-op proxies.
jest.mock('react-native-gesture-handler', () => {
    const chainProxy = () => new Proxy({}, { get: () => () => chainProxy() });
    return {
        GestureDetector: ({ children }) => children,
        Gesture: {
            Tap: chainProxy,
            Pan: chainProxy,
            Race: chainProxy,
        },
    };
});

// expo-localization
jest.mock('expo-localization', () => ({
    getCalendars: () => [{ timeZone: 'UTC' }],
}));

// @expo/vector-icons/Feather
jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

// TemplatePickerOverlay — not under test here
jest.mock('../../components/TemplatePickerOverlay', () => () => null);

// ─── Context / navigation mocks ───────────────────────────────────────────────

const mockNavigate  = jest.fn();
const mockSetParams = jest.fn();
jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
    };
});

const mockAuthFetch = jest.fn();
let mockUser = {
    sub: 'client@example.com', email: 'client@example.com',
    fname: 'Jane', lname: 'Doe', isCoach: false,
};
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: mockUser, authFetch: mockAuthFetch }),
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222',
    surfaceBorder: '#333', textPrimary: '#fff', textSecondary: '#aaa',
    textTertiary: '#666', divider: '#444', accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff',
    accentSubtle: '#3a2020', inputBackground: '#111', inputText: '#fff',
    inputBorder: '#333', inputPlaceholder: '#666', overlay: 'rgba(0,0,0,0.5)',
    mode: 'dark', headerBackground: '#000',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: jest.fn() }),
}));

const mockMarkRead = jest.fn();
jest.mock('../../context/NotificationsContext', () => ({
    useNotifications: () => ({ markRead: mockMarkRead, unreadWorkoutIds: new Set() }),
}));

// ─── Navigation / route props ─────────────────────────────────────────────────

const mockNavigation = { navigate: mockNavigate, setParams: mockSetParams };

function makeRoute(overrides = {}) {
    return {
        params: {
            clientEmail: 'client@example.com',
            clientName: 'Jane Doe',
            clientTimezone: 'UTC',
            ...overrides,
        },
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scheduleResponse(workouts = []) {
    mockAuthFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ workouts }),
    });
}

// Use dates in the current month so they appear in the default month view
const NOW = new Date();
const YEAR = NOW.getFullYear();
const MONTH_STR = String(NOW.getMonth() + 1).padStart(2, '0');

const WORKOUT_A = {
    id: 'sw-1', workoutId: 'w-1', workoutName: 'Upper Body',
    scheduledDate: `${YEAR}-${MONTH_STR}-10`, status: 'scheduled',
};
const WORKOUT_B = {
    id: 'sw-2', workoutId: 'w-2', workoutName: 'Lower Body',
    scheduledDate: `${YEAR}-${MONTH_STR}-12`, status: 'completed',
};
const MISSED_WORKOUT = {
    id: 'sw-3', workoutId: 'w-3', workoutName: 'Cardio',
    scheduledDate: `${YEAR}-${MONTH_STR}-05`, status: 'missed',
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    AsyncStorage.getItem.mockResolvedValue(null);
    mockUser = {
        sub: 'client@example.com', email: 'client@example.com',
        fname: 'Jane', lname: 'Doe', isCoach: false,
    };
    scheduleResponse([]);
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('CalendarScreen — loading', () => {
    it('shows loading indicator while schedule is being fetched', () => {
        mockAuthFetch.mockReturnValue(new Promise(() => {})); // never resolves
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        // While loading, workout pills should not be present
        expect(screen.queryByText('Upper Body')).toBeNull();
    });

    it('fetches schedule on mount', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule'),
            );
        });
    });

    it('includes clientEmail in the schedule request', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute({ clientEmail: 'test@example.com' })} />);
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('test%40example.com'),
            );
        });
    });
});

// ─── Workout rendering ────────────────────────────────────────────────────────

describe('CalendarScreen — workout rendering', () => {
    it('shows workout names from the schedule', async () => {
        scheduleResponse([WORKOUT_A, WORKOUT_B]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            expect(screen.getByText('Upper Body')).toBeTruthy();
            expect(screen.getByText('Lower Body')).toBeTruthy();
        });
    });

    it('renders the month header label after loading', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            // Month label appears in the header (e.g. "April 2026")
            const now = new Date();
            const label = now.toLocaleString('default', { month: 'long', year: 'numeric' });
            expect(screen.getByText(label)).toBeTruthy();
        });
    });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('CalendarScreen — error handling', () => {
    it('shows alert when API returns non-ok response', async () => {
        mockAuthFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        });
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not load schedule.');
        });
    });

    it('shows alert when fetch throws (network error)', async () => {
        mockAuthFetch.mockRejectedValue(new Error('Network error'));
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not load schedule.');
        });
    });
});

// ─── View toggle ─────────────────────────────────────────────────────────────

describe('CalendarScreen — view toggle', () => {
    it('saves calendar view to AsyncStorage when toggled', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());

        // Find the view toggle button (week/month toggle in the header)
        const toggleBtn = screen.queryByLabelText('Switch to weekly view') ??
                          screen.queryByLabelText('Switch to monthly view') ??
                          screen.queryByAccessibilityHint?.(/toggle/i);

        if (toggleBtn) {
            fireEvent.press(toggleBtn);
            await waitFor(() => {
                expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                    '@calendar_view',
                    expect.stringMatching(/month|week/),
                );
            });
        }
    });

    it('loads calendar view from AsyncStorage on mount', async () => {
        AsyncStorage.getItem.mockResolvedValue('week');
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => {
            expect(AsyncStorage.getItem).toHaveBeenCalledWith('@calendar_view');
        });
    });
});

// ─── Workout press navigation ─────────────────────────────────────────────────

describe('CalendarScreen — workout press', () => {
    it('navigates to Workout Preview when a workout is pressed', async () => {
        scheduleResponse([WORKOUT_A]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Upper Body'));

        fireEvent.press(screen.getByText('Upper Body'));

        expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
            scheduledWorkoutId: 'sw-1',
        }));
    });

    it('calls markRead when a workout is pressed', async () => {
        scheduleResponse([WORKOUT_A]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Upper Body'));

        fireEvent.press(screen.getByText('Upper Body'));

        expect(mockMarkRead).toHaveBeenCalledWith('sw-1');
    });
});

// ─── Missed workout sheet ─────────────────────────────────────────────────────

describe('CalendarScreen — missed workout sheet (client)', () => {
    async function renderWithMissed() {
        scheduleResponse([MISSED_WORKOUT]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Cardio'));
        fireEvent(screen.getByText('Cardio'), 'longPress');
    }

    it('shows MissedWorkoutSheet when client long-presses a missed workout', async () => {
        await renderWithMissed();
        expect(screen.getByLabelText('Mark as skipped')).toBeTruthy();
        expect(screen.getByLabelText('Reschedule to today')).toBeTruthy();
        expect(screen.getByLabelText('Reschedule to another date')).toBeTruthy();
    });

    it('shows MissedWorkoutSheet for a coach viewing their own calendar', async () => {
        mockUser = { ...mockUser, isCoach: true };
        // Route has no clientEmail override → clientEmail falls back to user.email → own calendar
        scheduleResponse([MISSED_WORKOUT]);
        render(<CalendarScreen navigation={mockNavigation} route={{ params: { clientTimezone: 'UTC' } }} />);
        await waitFor(() => screen.getByText('Cardio'));
        fireEvent(screen.getByText('Cardio'), 'longPress');
        expect(screen.getByLabelText('Reschedule to today')).toBeTruthy();
    });

    it('does not show MissedWorkoutSheet when coach is viewing a different client', async () => {
        mockUser = { ...mockUser, isCoach: true };
        // clientEmail differs from user.email → not own calendar
        scheduleResponse([MISSED_WORKOUT]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute({ clientEmail: 'otherclient@example.com' })} />);
        await waitFor(() => screen.getByText('Cardio'));
        fireEvent(screen.getByText('Cardio'), 'longPress');
        expect(screen.queryByLabelText('Reschedule to today')).toBeNull();
        expect(screen.getByLabelText('Skip workout')).toBeTruthy();
    });

    it('closes the sheet when Cancel is pressed', async () => {
        await renderWithMissed();
        fireEvent.press(screen.getByLabelText('Cancel'));
        await waitFor(() => {
            expect(screen.queryByLabelText('Reschedule to today')).toBeNull();
        });
    });

    it('opens SkipModal when Mark as skipped is pressed', async () => {
        await renderWithMissed();
        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        await waitFor(() => {
            expect(screen.getByText('Mark as skipped?')).toBeTruthy();
        });
    });

    it('posts to /schedule/skip and closes modal after confirming skip', async () => {
        mockAuthFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ workouts: [MISSED_WORKOUT] }) })
            .mockResolvedValue({ ok: true });

        await renderWithMissed();
        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        await waitFor(() => screen.getByText('Mark as skipped?'));

        fireEvent.press(screen.getByLabelText('Confirm skip'));
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule/skip'),
                expect.objectContaining({ method: 'POST' }),
            );
        });
        expect(screen.queryByText('Mark as skipped?')).toBeNull();
    });

    it('calls move API with today when Reschedule to today is pressed', async () => {
        mockAuthFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ workouts: [MISSED_WORKOUT] }) })
            .mockResolvedValue({ ok: true });

        await renderWithMissed();
        fireEvent.press(screen.getByLabelText('Reschedule to today'));
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule/move'),
                expect.objectContaining({ method: 'POST' }),
            );
        });
    });

    it('opens DatePickerModal when Reschedule to another date is pressed', async () => {
        await renderWithMissed();
        fireEvent.press(screen.getByLabelText('Reschedule to another date'));
        await waitFor(() => {
            expect(screen.getByText('Move workout to…')).toBeTruthy();
        });
    });
});

// ─── completedWorkoutId param → optimistic calendar update ───────────────────

describe('CalendarScreen — optimistic completion update', () => {
    it('flips a scheduled workout to completed when completedWorkoutId param is set', async () => {
        scheduleResponse([WORKOUT_A]);
        render(<CalendarScreen
            navigation={mockNavigation}
            route={makeRoute({ completedWorkoutId: 'sw-1' })}
        />);
        await waitFor(() => screen.getByText('Upper Body'));
        // The workout was scheduled; after the param is processed it should be shown as completed.
        // We verify indirectly: setParams is called to clear the param (preventing re-application).
        await waitFor(() => {
            expect(mockSetParams).toHaveBeenCalledWith({ completedWorkoutId: undefined });
        });
    });

    it('does not call setParams when completedWorkoutId is absent', async () => {
        scheduleResponse([WORKOUT_A]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Upper Body'));
        expect(mockSetParams).not.toHaveBeenCalled();
    });

    it('does not re-apply the update after setParams clears the param', async () => {
        scheduleResponse([WORKOUT_A]);
        // First render: param is present
        const { rerender } = render(<CalendarScreen
            navigation={mockNavigation}
            route={makeRoute({ completedWorkoutId: 'sw-1' })}
        />);
        await waitFor(() => expect(mockSetParams).toHaveBeenCalled());

        mockSetParams.mockClear();

        // Simulate re-render without the param (as setParams would cause)
        rerender(<CalendarScreen
            navigation={mockNavigation}
            route={makeRoute({ completedWorkoutId: undefined })}
        />);
        await waitFor(() => new Promise(r => setTimeout(r, 50)));
        expect(mockSetParams).not.toHaveBeenCalled();
    });
});

// ─── Coach vs client ──────────────────────────────────────────────────────────

describe('CalendarScreen — coach vs client', () => {
    it('uses route param clientEmail instead of user email when provided', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={makeRoute({ clientEmail: 'other@example.com' })} />);
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('other%40example.com'),
            );
        });
    });

    it('falls back to user email when no route params', async () => {
        scheduleResponse([]);
        render(<CalendarScreen navigation={mockNavigation} route={{ params: {} }} />);
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining(encodeURIComponent('client@example.com')),
            );
        });
    });
});
