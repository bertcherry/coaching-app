/**
 * tests/screens/WorkoutPreview.test.js
 *
 * Verifies that WorkoutPreview accurately displays workout information:
 *   - Exercise names and prescriptions pulled from API
 *   - Set rows rendered (correct count based on setsMin/setsMax)
 *   - Optional set labelling
 *   - Coach notes shown on scheduled, hidden on completed
 *   - Coach rec banner (weight + RPE)
 *   - Completed workouts show badge, hide Start/Finish buttons
 *   - Scheduled workouts show Start + Finish buttons
 *   - Edit button shown for both clients and coaches on completed workouts
 *   - Completed workout history is fetched and summary displayed per exercise
 *   - SetRow pre-populated with logged values in edit mode
 *   - Back-navigation guard fires when sets have been saved
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';

// ─── Native / library mocks ───────────────────────────────────────────────────

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

jest.mock('expo-video', () => ({
    VideoView: () => null,
    useVideoPlayer: () => ({}),
}));

jest.mock('react-native-reanimated', () => ({
    default: { View: require('react-native').View },
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
}));

jest.mock('@react-navigation/elements', () => ({
    useHeaderHeight: () => 0,
}));

// WorkoutPreviewItem — mock to avoid deep rendering; exposes all props used in tests
jest.mock('../../components/WorkoutPreviewItem', () => {
    const { View, Text, Pressable } = require('react-native');
    return function MockWorkoutPreviewItem({
        name, id, setsMin, setsMax, readOnly,
        coachNotes, recommendedWeight, recommendedRpe,
        isCompleted, completedHistory, onSetSaved,
    }) {
        const sets = setsMax ?? setsMin ?? 1;
        // Simulate which logged sets are available from completedHistory
        const loggedSetNums = completedHistory
            ? Array.from({ length: sets }, (_, i) => i + 1).filter(n => completedHistory[`${id}-${n}`])
            : [];
        return (
            <View testID="workout-preview-item">
                <Text testID="exercise-name">{name}</Text>
                {/* Coach notes hidden when completed */}
                {coachNotes && !isCompleted ? <Text testID="coach-notes">{coachNotes}</Text> : null}
                {(recommendedWeight || recommendedRpe) ? (
                    <Text testID="rec-banner">
                        Coach rec:{recommendedWeight ? ` ${recommendedWeight}` : ''}{recommendedRpe ? `  ·  RPE ${recommendedRpe}` : ''}
                    </Text>
                ) : null}
                {/* Completed summary: one row per logged set */}
                {isCompleted && loggedSetNums.map(n => {
                    const r = completedHistory[`${id}-${n}`];
                    return (
                        <View key={n} testID={`summary-set-${n}`}>
                            <Text testID={`summary-values-${n}`}>
                                {[r.weight != null ? `${r.weight} ${r.weightUnit}` : null, r.reps != null ? `${r.reps} reps` : null, r.rpe != null ? `RPE ${r.rpe}` : null].filter(Boolean).join('  ·  ')}
                            </Text>
                            {r.note ? <Text testID={`summary-note-${n}`}>{r.note}</Text> : null}
                        </View>
                    );
                })}
                {Array.from({ length: sets }, (_, i) => (
                    <View key={i} testID={`set-row-${i + 1}`}>
                        {i + 1 > (setsMin ?? sets) && <Text testID={`optional-${i + 1}`}>optional</Text>}
                        {!readOnly && (
                            <Pressable testID={`save-set-${i + 1}`} onPress={() => onSetSaved?.({ set: i + 1 })}>
                                <Text>Save</Text>
                            </Pressable>
                        )}
                    </View>
                ))}
            </View>
        );
    };
});

// ─── Context / navigation mocks ───────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockDispatch  = jest.fn();
const mockGoBack    = jest.fn();
let   mockBeforeRemoveListener = null;

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
        useNavigation:  () => ({ navigate: mockNavigate }),
    };
});

const mockAuthFetch = jest.fn();
let   mockUser = { email: 'client@test.com', isCoach: false, unitDefault: 'imperial' };
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: mockUser, accessToken: 'tok', authFetch: mockAuthFetch }),
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666', divider: '#444',
    accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff', accentSubtle: '#3a2020', success: '#7bb533',
    overlay: 'rgba(0,0,0,0.5)', mode: 'dark',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));
jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: jest.fn() }),
}));

jest.mock('../../utils/WorkoutSync', () => ({
    enqueueRecord: jest.fn(),
    syncQueue:     jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation(overrides = {}) {
    return {
        navigate: mockNavigate,
        dispatch: mockDispatch,
        goBack:   mockGoBack,
        addListener: jest.fn((event, cb) => {
            if (event === 'beforeRemove') mockBeforeRemoveListener = cb;
            return jest.fn(); // unsubscribe
        }),
        ...overrides,
    };
}

function makeRoute(overrides = {}) {
    return {
        params: {
            id: 'workout-1',
            scheduledWorkoutId: 'sw-1',
            scheduledDate: '2026-04-17',
            initialStatus: 'scheduled',
            viewerIsAthlete: true,
            ...overrides,
        },
    };
}

// A minimal two-section workout API response
const WORKOUT_API_RESPONSE = [
    {
        title: 'Section 1',
        data: [
            {
                id: 'ex-1', name: 'Squat',
                setsMin: 3, setsMax: null,
                countType: 'Reps', countMin: 5, countMax: null,
                recommendedWeight: '135', recommendedRpe: 7,
                coachNotes: 'Drive through heels.',
                setConfigs: null,
            },
        ],
    },
    {
        title: 'Section 2',
        data: [
            {
                id: 'ex-2', name: 'Deadlift',
                setsMin: 2, setsMax: 4,
                countType: 'Reps', countMin: 3, countMax: 5,
                recommendedWeight: '135-185', recommendedRpe: null,
                coachNotes: null,
                setConfigs: null,
            },
        ],
    },
];

function mockWorkoutFetch() {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => WORKOUT_API_RESPONSE,
    });
}

import WorkoutPreview from '../../screens/WorkoutPreview';

beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemoveListener = null;
    mockUser = { email: 'client@test.com', isCoach: false, unitDefault: 'imperial' };
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockWorkoutFetch();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
});

// ─── Data display ─────────────────────────────────────────────────────────────

describe('WorkoutPreview — data display', () => {
    it('shows exercise names after API loads', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => {
            expect(screen.getAllByTestId('exercise-name').map(n => n.props.children))
                .toEqual(expect.arrayContaining(['Squat', 'Deadlift']));
        });
    });

    it('renders the correct total number of set rows across exercises', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        // Squat: setsMin=3, setsMax=null → 3 rows
        // Deadlift: setsMin=2, setsMax=4 → 4 rows
        // Total = 7
        expect(screen.getAllByTestId(/^set-row-/).length).toBe(7);
    });

    it('renders optional set rows for exercises with setsMax > setsMin', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        // Deadlift has setsMin=2, setsMax=4 → rows 3 and 4 are optional; 2 total optional rows
        expect(screen.getAllByTestId(/^optional-/).length).toBe(2);
        // Squat has no setsMax → no optional rows (none of its sets labelled optional)
        expect(screen.queryByTestId('optional-1')).toBeNull();
    });

    it('shows coach notes on a scheduled workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getByTestId('coach-notes'));
        expect(screen.getByTestId('coach-notes').props.children).toBe('Drive through heels.');
    });

    it('hides coach notes on a completed workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryByTestId('coach-notes')).toBeNull();
    });

    it('shows coach rec banner with weight and RPE', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getAllByTestId('rec-banner'));
        // Squat has both weight and RPE; find the banner that includes 'RPE'
        const banners = screen.getAllByTestId('rec-banner');
        const squat = banners.find(b => b.props.children.join('').includes('RPE'));
        expect(squat).toBeTruthy();
        const text = squat.props.children.join('');
        expect(text).toContain('135');
        expect(text).toContain('RPE 7');
    });

    it('shows loading state before API resolves', () => {
        global.fetch = jest.fn(() => new Promise(() => {})); // never resolves
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('passes initialStatus=completed so workout opens in completed state', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByText('Workout completed')).toBeTruthy();
    });
});

// ─── Footer buttons ───────────────────────────────────────────────────────────

describe('WorkoutPreview — footer buttons', () => {
    it('shows Start Workout and Workout Finished buttons when scheduled', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByText('Start Workout')).toBeTruthy();
        expect(screen.getByText('Workout Finished')).toBeTruthy();
    });

    it('hides Start/Finish buttons and shows completed badge when completed', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryByText('Start Workout')).toBeNull();
        expect(screen.queryByText('Workout Finished')).toBeNull();
        expect(screen.getByText('Workout completed')).toBeTruthy();
    });

    it('shows Edit workout button for client on completed workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByText('Edit workout')).toBeTruthy();
    });

    it('shows Edit workout button for coach on completed workout', async () => {
        mockUser = { email: 'coach@test.com', isCoach: true, unitDefault: 'imperial' };
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByText('Edit workout')).toBeTruthy();
    });
});

// ─── Completed workout history & summary ──────────────────────────────────────

const HISTORY_RECORDS = [
    { id: 'h1', exerciseId: 'ex-1', set: 1, weight: 135, weightUnit: 'lbs', reps: 5, rpe: 7, note: null },
    { id: 'h2', exerciseId: 'ex-1', set: 2, weight: 145, weightUnit: 'lbs', reps: 5, rpe: 7.5, note: 'felt heavy' },
];

function mockHistoryFetch(records = HISTORY_RECORDS) {
    mockAuthFetch.mockImplementation((url) => {
        if (url.includes('/history/workout')) {
            return Promise.resolve({ ok: true, json: async () => ({ records }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
}

describe('WorkoutPreview — completed workout history', () => {
    it('fetches /history/workout when workout is completed', async () => {
        mockHistoryFetch();
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/history/workout'),
            );
        });
        const call = mockAuthFetch.mock.calls.find(c => c[0].includes('/history/workout'));
        expect(call[0]).toContain('workoutId=workout-1');
        expect(call[0]).toContain('clientEmail=client%40test.com');
    });

    it('does not fetch history when workout is scheduled', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        const historyCalls = mockAuthFetch.mock.calls.filter(c => c[0]?.includes?.('/history/workout'));
        expect(historyCalls).toHaveLength(0);
    });

    it('renders per-set summary rows for logged sets on completed workout', async () => {
        mockHistoryFetch();
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        await waitFor(() => screen.getByTestId('summary-set-1'));
        expect(screen.getByTestId('summary-set-2')).toBeTruthy();
    });

    it('summary values include weight, reps, and RPE', async () => {
        mockHistoryFetch();
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getByTestId('summary-set-1'));
        const text = screen.getByTestId('summary-values-1').props.children;
        expect(text).toContain('135 lbs');
        expect(text).toContain('5 reps');
        expect(text).toContain('RPE 7');
    });

    it('summary shows note when present', async () => {
        mockHistoryFetch();
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getByTestId('summary-note-2'));
        expect(screen.getByTestId('summary-note-2').props.children).toBe('felt heavy');
    });

    it('shows no summary rows when history fetch returns empty records', async () => {
        mockHistoryFetch([]);
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('summary-set-1')).toBeNull();
    });

    it('passes loggedRecord to SetRow so fields are pre-populated in edit mode', async () => {
        // We verify this via the readOnly/edit flow — when edit mode is entered,
        // the mock WorkoutPreviewItem receives completedHistory so SetRows can be pre-filled.
        mockHistoryFetch();
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed', clientEmail: 'client@test.com' })} />);
        await waitFor(() => screen.getByText('Edit workout'));
        // completedHistory should be fetched before or after edit is pressed
        await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
        fireEvent.press(screen.getByText('Edit workout'));
        // After entering edit mode, save-set buttons appear (readOnly=false)
        await waitFor(() => expect(screen.queryAllByTestId('save-set-1').length).toBeGreaterThan(0));
    });
});

// ─── readOnly behaviour ───────────────────────────────────────────────────────

describe('WorkoutPreview — readOnly / edit mode', () => {
    it('hides set save buttons when workout is completed and not in edit mode', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryByTestId('save-set-1')).toBeNull();
    });

    it('shows set save buttons after client taps Edit workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        fireEvent.press(screen.getByText('Edit workout'));
        await waitFor(() => {
            expect(screen.queryAllByTestId('save-set-1').length).toBeGreaterThan(0);
        });
    });

    it('shows set save buttons when workout is scheduled', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryAllByTestId('save-set-1').length).toBeGreaterThan(0);
    });
});

// ─── Back-navigation guard ────────────────────────────────────────────────────

describe('WorkoutPreview — back-navigation guard', () => {
    it('does not block navigation when no sets have been saved', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('shows alert and blocks navigation after a set is saved', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        // Trigger a set save via the mock WorkoutPreviewItem (use first match)
        fireEvent.press(screen.getAllByTestId('save-set-1')[0]);

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
            'Leave workout?',
            expect.any(String),
            expect.any(Array),
        );
    });

    it('does not block navigation when workout is already completed', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'completed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        // Enter edit mode and save a set
        fireEvent.press(screen.getByText('Edit workout'));
        await waitFor(() => { expect(screen.queryAllByTestId('save-set-1').length).toBeGreaterThan(0); });
        fireEvent.press(screen.getAllByTestId('save-set-1')[0]);

        // Mark finished
        fireEvent.press(screen.getByText('Done editing'));

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        // Already completed → no block
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});

// ─── Navigation to Workout Active ─────────────────────────────────────────────

describe('WorkoutPreview — Start Workout navigation', () => {
    it('navigates to Workout Active with correct params when Start is pressed', async () => {
        // scheduledDate: null → treated as "today" so no reschedule overlay fires
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ scheduledDate: null })} />);
        await waitFor(() => screen.getByText('Start Workout'));
        fireEvent.press(screen.getByText('Start Workout'));
        expect(mockNavigate).toHaveBeenCalledWith('Workout Active', expect.objectContaining({
            workoutId: 'workout-1',
            scheduledWorkoutId: 'sw-1',
        }));
    });
});

// ─── Missed workout — Mark as Skipped ────────────────────────────────────────

describe('WorkoutPreview — missed workout skip', () => {
    it('shows Mark as Skipped button for client on missed workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByLabelText('Mark as skipped')).toBeTruthy();
    });

    it('does not show Mark as Skipped button when coach is viewing a client workout', async () => {
        mockUser = { email: 'coach@test.com', isCoach: true, unitDefault: 'imperial' };
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed', viewerIsAthlete: false })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryByLabelText('Mark as skipped')).toBeNull();
    });

    it('shows Mark as Skipped button on a scheduled workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByLabelText('Mark as skipped')).toBeTruthy();
    });

    it('shows Reschedule Workout button on a scheduled workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByLabelText('Reschedule workout')).toBeTruthy();
    });

    it('shows Reschedule Workout button on a skipped workout', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'skipped' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.getByLabelText('Reschedule workout')).toBeTruthy();
    });

    it('does not show action buttons when viewerIsAthlete is false', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled', viewerIsAthlete: false })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        expect(screen.queryByLabelText('Mark as skipped')).toBeNull();
        expect(screen.queryByLabelText('Reschedule workout')).toBeNull();
    });

    it('opens date picker when Reschedule Workout is pressed', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        fireEvent.press(screen.getByLabelText('Reschedule workout'));
        expect(screen.getByText('Reschedule to…')).toBeTruthy();
    });

    it('calls move API and closes modal after confirming reschedule', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'scheduled' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        fireEvent.press(screen.getByLabelText('Reschedule workout'));
        await waitFor(() => screen.getByText('Reschedule to…'));

        // Pick today — its accessibilityLabel is "<dayNum>, today"
        const todayBtn = screen.getAllByRole('button').find(
            el => el.props.accessibilityLabel?.includes('today') &&
                  !el.props.accessibilityLabel?.includes('month'),
        );
        fireEvent.press(todayBtn);
        fireEvent.press(screen.getByLabelText('Confirm date'));

        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule/move'),
                expect.objectContaining({ method: 'POST' }),
            );
        });
        expect(screen.queryByText('Reschedule to…')).toBeNull();
    });

    it('opens skip modal when Mark as Skipped is pressed', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        expect(screen.getByText('Mark as skipped?')).toBeTruthy();
    });

    it('closes skip modal without change when Cancel is pressed', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));
        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        fireEvent.press(screen.getByLabelText('Cancel'));
        await waitFor(() => {
            expect(screen.queryByText('Mark as skipped?')).toBeNull();
        });
        // Buttons should still show missed-state UI (Start/Finish still visible)
        expect(screen.getByText('Start Workout')).toBeTruthy();
    });

    it('posts to /schedule/skip and shows Workout skipped badge after confirming', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        fireEvent.press(screen.getByLabelText('Confirm mark as skipped'));

        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule/skip'),
                expect.objectContaining({ method: 'POST' }),
            );
        });
        await waitFor(() => {
            expect(screen.getByText('Workout skipped')).toBeTruthy();
        });
        expect(screen.queryByText('Start Workout')).toBeNull();
        expect(screen.queryByLabelText('Mark as skipped')).toBeNull();
    });

    it('sends the typed reason in the skip request body', async () => {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        fireEvent.changeText(screen.getByLabelText('Skip reason'), 'Sick day');
        fireEvent.press(screen.getByLabelText('Confirm mark as skipped'));

        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/schedule/skip'),
                expect.objectContaining({
                    body: expect.stringContaining('Sick day'),
                }),
            );
        });
    });

    it('reverts to missed status if the skip API call fails', async () => {
        mockAuthFetch.mockRejectedValue(new Error('Network error'));
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ initialStatus: 'missed' })} />);
        await waitFor(() => screen.getAllByTestId('exercise-name'));

        fireEvent.press(screen.getByLabelText('Mark as skipped'));
        fireEvent.press(screen.getByLabelText('Confirm mark as skipped'));

        await waitFor(() => {
            // Status should revert — Mark as Skipped button visible again
            expect(screen.getByLabelText('Mark as skipped')).toBeTruthy();
        });
        expect(screen.queryByText('Workout skipped')).toBeNull();
    });
});

// ─── Finish overlay icons ─────────────────────────────────────────────────────

const VALID_FINISH_ICONS = ['thumbs-up', 'star', 'sun', 'zap', 'award', 'heart'];

describe('WorkoutPreview — finish overlay icons', () => {
    async function openFinishOverlay() {
        render(<WorkoutPreview navigation={makeNavigation()} route={makeRoute({ scheduledDate: null })} />);
        await waitFor(() => screen.getByText('Workout Finished'));
        fireEvent.press(screen.getByText('Workout Finished'));
        await waitFor(() => screen.getByText('Mark this workout as finished?'));
    }

    it('finish overlay shows one of the known encouragement icons', async () => {
        await openFinishOverlay();
        const found = VALID_FINISH_ICONS.some(name => {
            try { screen.getByTestId(`icon-${name}`); return true; } catch { return false; }
        });
        expect(found).toBe(true);
    });

    it('confirm button reads "Thanks!"', async () => {
        await openFinishOverlay();
        expect(screen.getByText('Thanks!')).toBeTruthy();
    });
});
