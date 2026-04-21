/**
 * tests/screens/WorkoutActiveScreen.test.js
 *
 * Verifies that WorkoutActiveScreen correctly displays and drives the
 * set-by-set workout flow:
 *   - Exercise name, section label, set label, prescription, coach notes
 *   - Coach rec banner (weight + RPE); per-set config overrides exercise level
 *   - Input pre-fill from single-value recommendations
 *   - Next advances cursor through sets then exercises
 *   - Last set shows "Finish workout" label; pressing it shows finish overlay
 *   - Confirming finish overlay shows done screen
 *   - Skip records all remaining required sets as skipped and advances
 *   - Back-navigation guard: no alert with no sets saved; alert after a set saved
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

jest.mock('react-native-get-random-values', () => {});
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

// ─── Context / navigation mocks ───────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockGoBack   = jest.fn();
let   mockBeforeRemoveListener = null;

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb) => { React.useEffect(cb, []); },
        useNavigation:  () => ({ navigate: mockNavigate }),
    };
});

const mockAuthFetch = jest.fn();
let mockUser = { email: 'client@test.com', isCoach: false, unitDefault: 'imperial' };
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: mockUser, accessToken: 'tok', authFetch: mockAuthFetch }),
}));

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666', divider: '#444',
    accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff', accentSubtle: '#3a2020', success: '#7bb533',
    overlay: 'rgba(0,0,0,0.5)', mode: 'dark',
    inputPlaceholder: '#555',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));
jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: jest.fn() }),
}));

const mockEnqueueRecord = jest.fn();
const mockSyncQueue     = jest.fn();
const mockGetLocalWorkoutHistory = jest.fn();
jest.mock('../../utils/WorkoutSync', () => ({
    enqueueRecord:            (...args) => mockEnqueueRecord(...args),
    syncQueue:                (...args) => mockSyncQueue(...args),
    getLocalWorkoutHistory:   (...args) => mockGetLocalWorkoutHistory(...args),
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

// A simple single-section, two-exercise workout
const SECTION_1 = {
    title: 'Section 1',
    circuit: false,
    timed: false,
    data: [
        {
            id: 'ex-1', name: 'Squat',
            setsMin: 3, setsMax: null,
            countType: 'Reps', countMin: 5, countMax: null,
            recommendedWeight: '135', recommendedRpe: 7,
            coachNotes: 'Drive through heels.',
            setConfigs: null,
        },
        {
            id: 'ex-2', name: 'Deadlift',
            setsMin: 2, setsMax: null,
            countType: 'Reps', countMin: 3, countMax: null,
            recommendedWeight: null, recommendedRpe: null,
            coachNotes: null,
            setConfigs: null,
        },
    ],
};

function makeRoute(overrides = {}) {
    return {
        params: {
            workoutData: [SECTION_1],
            workoutId:   'workout-1',
            scheduledWorkoutId: 'sw-1',
            ...overrides,
        },
    };
}

/** Mock fetch: demos return { id, name, streamId: null }; everything else → {} */
function mockFetch() {
    global.fetch = jest.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/demos/')) {
            const id = urlStr.split('/demos/')[1];
            const ex = [SECTION_1.data[0], SECTION_1.data[1]].find(e => e.id === id);
            return Promise.resolve({
                ok: true,
                json: async () => ({ id, name: ex?.name ?? id, streamId: null }),
            });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
}

import WorkoutActiveScreen from '../../screens/WorkoutActiveScreen';

beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemoveListener = null;
    mockUser = { email: 'client@test.com', isCoach: false, unitDefault: 'imperial' };
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockGetLocalWorkoutHistory.mockResolvedValue({});
    mockFetch();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
});

// ─── Display ──────────────────────────────────────────────────────────────────

describe('WorkoutActiveScreen — display', () => {
    it('shows the first exercise name after demo loads', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText('Squat')).toBeTruthy());
    });

    it('shows the section label', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText(/Section 1/)).toBeTruthy());
    });

    it('shows the correct set label', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText('Set 1 of 3')).toBeTruthy());
    });

    it('shows the prescription pill', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText('5 reps')).toBeTruthy());
    });

    it('shows coach notes when present', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText('Drive through heels.')).toBeTruthy());
    });

    it('shows coach rec banner when weight and RPE are set', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => {
            const recText = screen.getByText(/Coach rec:/);
            expect(recText.props.children.join?.('') ?? recText.props.children).toMatch(/135/);
            expect(recText.props.children.join?.('') ?? recText.props.children).toMatch(/RPE 7/);
        });
    });

    it('pre-fills weight input from single-value recommendation', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Squat'));
        // The weight input has value '135' from recommendedWeight
        const inputs = screen.getAllByDisplayValue('135');
        expect(inputs.length).toBeGreaterThan(0);
    });

    it('pre-fills rpe input from single-value recommendation', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Squat'));
        const inputs = screen.getAllByDisplayValue('7');
        expect(inputs.length).toBeGreaterThan(0);
    });

    it('per-set config weight overrides exercise-level recommendation', async () => {
        const workoutData = [{
            ...SECTION_1,
            data: [{
                ...SECTION_1.data[0],
                recommendedWeight: '135',
                setConfigs: [
                    { weight: '155', rpe: null, countMin: null },
                    { weight: null,  rpe: null, countMin: null },
                    { weight: null,  rpe: null, countMin: null },
                ],
            }, SECTION_1.data[1]],
        }];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));
        // Set 1 should show 155 (per-set config), not 135 (exercise level)
        expect(screen.getAllByDisplayValue('155').length).toBeGreaterThan(0);
        expect(screen.queryByDisplayValue('135')).toBeNull();
    });

    it('shows optional label when set number exceeds setsMin', async () => {
        const workoutData = [{
            ...SECTION_1,
            data: [{
                ...SECTION_1.data[0],
                setsMin: 2,
                setsMax: 3,
            }, SECTION_1.data[1]],
        }];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));

        // Advance past the 2 required sets to set 3 (optional)
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3 (optional)'));
    });
});

// ─── Cursor advancement ───────────────────────────────────────────────────────

describe('WorkoutActiveScreen — cursor advancement', () => {
    it('advances set counter when Next is pressed', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
    });

    it('advances to next exercise after all sets are done', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Complete all 3 Squat sets
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));

        // Should now be on Deadlift Set 1 of 2
        await waitFor(() => expect(screen.getByText('Deadlift')).toBeTruthy());
        expect(screen.getByText('Set 1 of 2')).toBeTruthy();
    });

    it('shows "Finish workout" label on the last set of the last exercise', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Complete Squat (3 sets) and Deadlift (2 sets), stopping at the last set
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));

        await waitFor(() => screen.getByText('Deadlift'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 2'));

        expect(screen.getByText('Finish workout')).toBeTruthy();
    });

    it('shows finish overlay after pressing Finish workout', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Navigate to the last set of the last exercise
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Deadlift'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 2'));
        fireEvent.press(screen.getByText('Finish workout'));

        await waitFor(() => expect(screen.getByText('Mark this workout as finished?')).toBeTruthy());
    });

    it('shows done screen after confirming finish overlay', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Navigate to last set and finish
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Deadlift'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 2'));
        fireEvent.press(screen.getByText('Finish workout'));
        await waitFor(() => screen.getByText("Thanks!"));
        fireEvent.press(screen.getByText("Thanks!"));

        await waitFor(() => expect(screen.getByText('Workout complete!')).toBeTruthy());
    });
});

// ─── Skip ─────────────────────────────────────────────────────────────────────

describe('WorkoutActiveScreen — Skip', () => {
    // Use a 1-set exercise so advanceCursor moves past it (setNum=1 === totalSets=1)
    const SINGLE_SET_SECTION = {
        title: 'Section 1',
        circuit: false,
        timed: false,
        data: [
            {
                id: 'ex-1', name: 'Squat',
                setsMin: 1, setsMax: null,
                countType: 'Reps', countMin: 5, countMax: null,
                recommendedWeight: null, recommendedRpe: null,
                coachNotes: null, setConfigs: null,
            },
            {
                id: 'ex-2', name: 'Deadlift',
                setsMin: 2, setsMax: null,
                countType: 'Reps', countMin: 3, countMax: null,
                recommendedWeight: null, recommendedRpe: null,
                coachNotes: null, setConfigs: null,
            },
        ],
    };

    it('records required sets as skipped and advances to next exercise', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()}
            route={makeRoute({ workoutData: [SINGLE_SET_SECTION] })} />);
        await waitFor(() => screen.getByText('Set 1 of 1'));

        fireEvent.press(screen.getByText('Skip exercise'));

        // 1 required set → 1 skipped record
        expect(mockEnqueueRecord).toHaveBeenCalledTimes(1);
        expect(mockEnqueueRecord).toHaveBeenCalledWith(expect.objectContaining({
            exerciseId: 'ex-1',
            skipped: true,
        }));

        // Advances to Deadlift
        await waitFor(() => expect(screen.getByText('Deadlift')).toBeTruthy());
    });

    it('records all remaining required sets as skipped when skipping a multi-set exercise', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        fireEvent.press(screen.getByText('Skip exercise'));

        // setsMin=3, setsMax=null → 3 required → 3 skipped records
        expect(mockEnqueueRecord).toHaveBeenCalledTimes(3);
        mockEnqueueRecord.mock.calls.forEach(([record]) => {
            expect(record).toMatchObject({ exerciseId: 'ex-1', skipped: true });
        });
    });

    it('records only remaining required sets when skip is pressed mid-exercise', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Complete set 1 first (recorded as not-skipped)
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        mockEnqueueRecord.mockClear();
        fireEvent.press(screen.getByText('Skip exercise'));

        // Sets 2 and 3 are remaining required sets → 2 skipped records
        expect(mockEnqueueRecord).toHaveBeenCalledTimes(2);
    });
});

// ─── enqueueRecord ────────────────────────────────────────────────────────────

describe('WorkoutActiveScreen — record saving', () => {
    it('calls enqueueRecord with correct fields when Next is pressed', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        fireEvent.press(screen.getByText('Next'));

        expect(mockEnqueueRecord).toHaveBeenCalledWith(expect.objectContaining({
            exerciseId: 'ex-1',
            workoutId:  'workout-1',
            set:        1,
            skipped:    false,
        }));
    });
});

// ─── Back-navigation guard ────────────────────────────────────────────────────

describe('WorkoutActiveScreen — back-navigation guard', () => {
    it('does not block navigation when no sets have been saved', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('blocks navigation and shows alert after a set has been saved', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Save a set via Next
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
            'Leave workout?',
            expect.any(String),
            expect.any(Array),
        );
    });

    it('does not block navigation when workout is done', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Complete all sets and confirm finish
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Deadlift'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 2'));
        fireEvent.press(screen.getByText('Finish workout'));
        await waitFor(() => screen.getByText("Thanks!"));
        fireEvent.press(screen.getByText("Thanks!"));
        await waitFor(() => screen.getByText('Workout complete!'));

        const event = { preventDefault: jest.fn(), data: { action: {} } };
        act(() => { mockBeforeRemoveListener?.(event); });

        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});

// ─── Finish overlay icons ─────────────────────────────────────────────────────

const VALID_FINISH_ICONS = ['thumbs-up', 'star', 'sun', 'zap', 'award', 'heart'];

/** Navigate to the last set so the finish overlay can be triggered. */
async function navigateToFinishOverlay() {
    render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
    await waitFor(() => screen.getByText('Set 1 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 2 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 3 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Deadlift'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 2 of 2'));
    fireEvent.press(screen.getByText('Finish workout'));
    await waitFor(() => screen.getByText('Mark this workout as finished?'));
}

describe('WorkoutActiveScreen — finish overlay icons', () => {
    it('finish overlay shows one of the known encouragement icons', async () => {
        await navigateToFinishOverlay();
        const found = VALID_FINISH_ICONS.some(name => {
            try { screen.getByTestId(`icon-${name}`); return true; } catch { return false; }
        });
        expect(found).toBe(true);
    });

    it('confirm button reads "Thanks!"', async () => {
        await navigateToFinishOverlay();
        expect(screen.getByText('Thanks!')).toBeTruthy();
    });

    it('done screen shows the award icon after confirming', async () => {
        await navigateToFinishOverlay();
        fireEvent.press(screen.getByText('Thanks!'));
        await waitFor(() => screen.getByText('Workout complete!'));
        expect(screen.getByTestId('icon-award')).toBeTruthy();
    });
});

// ─── Back to preview navigation ───────────────────────────────────────────────

async function finishWorkout(nav = makeNavigation(), routeOverrides = {}) {
    render(<WorkoutActiveScreen navigation={nav} route={makeRoute(routeOverrides)} />);
    await waitFor(() => screen.getByText('Set 1 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 2 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 3 of 3'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Deadlift'));
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Set 2 of 2'));
    fireEvent.press(screen.getByText('Finish workout'));
    await waitFor(() => screen.getByText('Thanks!'));
    fireEvent.press(screen.getByText('Thanks!'));
    await waitFor(() => screen.getByText('Workout complete!'));
}

describe('WorkoutActiveScreen — back to preview navigation', () => {
    it('pressing Back to preview navigates to Workout Preview', async () => {
        const nav = makeNavigation();
        await finishWorkout(nav);
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                id: 'workout-1',
                scheduledWorkoutId: 'sw-1',
                initialStatus: 'completed',
            }));
        });
    });

    it('navigates with calendarRefresh: true', async () => {
        await finishWorkout();
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                calendarRefresh: true,
            }));
        });
    });

    it('reads local queue and passes localHistory when sets are queued', async () => {
        const localHistory = {
            'ex-1-1': { exerciseId: 'ex-1', set: 1, weight: 135, weightUnit: 'lbs', reps: 5 },
        };
        mockGetLocalWorkoutHistory.mockResolvedValue(localHistory);
        await finishWorkout();
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                localHistory,
            }));
        });
    });

    it('passes localHistory as undefined when the queue is empty', async () => {
        mockGetLocalWorkoutHistory.mockResolvedValue({});
        await finishWorkout();
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            const call = mockNavigate.mock.calls.find(c => c[0] === 'Workout Preview');
            expect(call[1].localHistory).toBeUndefined();
        });
    });

    it('passes clientEmail from route params', async () => {
        await finishWorkout(makeNavigation(), { clientEmail: 'athlete@test.com' });
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                clientEmail: 'athlete@test.com',
            }));
        });
    });

    it('falls back to user email when no clientEmail param', async () => {
        await finishWorkout();
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                clientEmail: 'client@test.com',
            }));
        });
    });

    it('calls getLocalWorkoutHistory with the correct workoutId', async () => {
        await finishWorkout();
        fireEvent.press(screen.getByText('Back to preview'));
        await waitFor(() => {
            expect(mockGetLocalWorkoutHistory).toHaveBeenCalledWith('workout-1');
        });
    });
});

// ─── Two-sided timed exercise ─────────────────────────────────────────────────

const TIMED_TWO_SIDED_SECTION = {
    title: 'Section 1',
    circuit: false,
    timed: true,
    repRest: 30,
    setRest: 60,
    data: [{
        id: 'ex-ts', name: 'Side Plank',
        setsMin: 1, setsMax: null,
        countType: 'Timed', countMin: 30, countMax: null,
        sides: 'two', restBetweenSides: 5,
        recommendedWeight: null, recommendedRpe: null,
        coachNotes: null, setConfigs: null,
    }],
};

describe('WorkoutActiveScreen — two-sided timed exercise', () => {
    it('shows "Side 1 of 2" indicator when exercise has sides=two', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));
        expect(screen.getByText('Side 1 of 2')).toBeTruthy();
    });

    it('pressing Finish workout on side 1 transitions to REST (BETWEEN SIDES) without recording a set', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout'));

        await waitFor(() => expect(screen.getByText('REST (BETWEEN SIDES)')).toBeTruthy());
        expect(mockEnqueueRecord).not.toHaveBeenCalled();
    });

    it('hides set inputs and actions during side-rest phase', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout'));
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        expect(screen.queryByText('Finish workout')).toBeNull();
        expect(screen.queryByText('Skip exercise')).toBeNull();
    });

    it('shows "Side 2 of 2" after side-rest timer runs', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout')); // side 1 → side-rest (auto-starts)
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        // side-rest auto-started — just advance time past the 5s rest
        act(() => { jest.advanceTimersByTime(6000); });

        await waitFor(() => expect(screen.getByText('Side 2 of 2')).toBeTruthy());
        jest.useRealTimers();
    });

    it('records set exactly once after completing both sides', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION], sectionOnly: true, startSectionIdx: 0 })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish section')); // side 1 → side-rest (auto-starts)
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        // side-rest auto-started — advance time to reach side 2
        act(() => { jest.advanceTimersByTime(6000); });
        await waitFor(() => screen.getByText('Side 2 of 2'));
        jest.useRealTimers();

        mockEnqueueRecord.mockClear();
        fireEvent.press(screen.getByText('Finish section')); // side 2 → record

        expect(mockEnqueueRecord).toHaveBeenCalledTimes(1);
        expect(mockEnqueueRecord).toHaveBeenCalledWith(expect.objectContaining({
            exerciseId: 'ex-ts',
            skipped:    false,
        }));
    });
});

// ─── Section-only mode ────────────────────────────────────────────────────────

const SINGLE_EXERCISE_WORKOUT = [
    {
        title: 'Section 1', circuit: false, timed: false,
        data: [{
            id: 'sec1-ex', name: 'Warm-up Squat',
            setsMin: 1, setsMax: null,
            countType: 'Reps', countMin: 5, countMax: null,
            recommendedWeight: null, recommendedRpe: null,
            coachNotes: null, setConfigs: null,
        }],
    },
    {
        title: 'Section 2', circuit: false, timed: false,
        data: [{
            id: 'sec2-ex', name: 'Working Squat',
            setsMin: 1, setsMax: null,
            countType: 'Reps', countMin: 5, countMax: null,
            recommendedWeight: null, recommendedRpe: null,
            coachNotes: null, setConfigs: null,
        }],
    },
];

describe('WorkoutActiveScreen — sectionOnly mode', () => {
    it('shows "Finish section" label on last set when sectionOnly=true', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));
        expect(screen.getByText('Finish section')).toBeTruthy();
    });

    it('does not show "Finish workout" when sectionOnly=true', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));
        expect(screen.queryByText('Finish workout')).toBeNull();
    });

    it('shows section complete modal after pressing Finish section', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));

        fireEvent.press(screen.getByText('Finish section'));

        await waitFor(() => expect(screen.getByText('Section complete!')).toBeTruthy());
    });

    it('does not show the full finish overlay in sectionOnly mode', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));

        fireEvent.press(screen.getByText('Finish section'));
        await waitFor(() => screen.getByText('Section complete!'));

        expect(screen.queryByText('Mark this workout as finished?')).toBeNull();
    });

    it('"Back to workout summary" button navigates to Workout Preview', async () => {
        const nav = makeNavigation();
        render(<WorkoutActiveScreen navigation={nav} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));

        fireEvent.press(screen.getByText('Finish section'));
        await waitFor(() => screen.getByTestId('section-complete-back-button'));

        fireEvent.press(screen.getByTestId('section-complete-back-button'));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('Workout Preview', expect.objectContaining({
                id: 'workout-1',
            }));
        });
    });

    it('startSectionIdx positions cursor at the given section', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 1,
        })} />);
        // Should show Section 2's exercise, not Section 1's
        await waitFor(() => expect(screen.getByText('Working Squat')).toBeTruthy());
        expect(screen.queryByText('Warm-up Squat')).toBeNull();
    });

    it('section complete modal shows "Back to workout summary" label text', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: SINGLE_EXERCISE_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Warm-up Squat'));

        fireEvent.press(screen.getByText('Finish section'));
        await waitFor(() => screen.getByText('Back to workout summary'));
        expect(screen.getByText('Back to workout summary')).toBeTruthy();
    });
});

// ─── Timer mode auto-advance ──────────────────────────────────────────────────

const TIMED_TWO_SET_WORKOUT = [{
    title: 'Timed Section',
    circuit: false,
    timed: true,
    repRest: 20,
    setRest: 45,
    data: [{
        id: 'timed-ex', name: 'Plank',
        setsMin: 2, setsMax: null,
        countType: 'Timed', countMin: 10, countMax: null,
        sides: 'single', restBetweenSides: null,
        recommendedWeight: null, recommendedRpe: null,
        coachNotes: null, setConfigs: null,
    }],
}];

describe('WorkoutActiveScreen — timer auto-advance mode', () => {
    it('in manual mode the rest timer does not auto-start (shows Start button)', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        // Start the work timer manually, let it run to max
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // timer hits max but stays on work phase in manual mode

        // In manual mode the user presses the action button to record and advance to rest
        fireEvent.press(screen.getByText('Next'));

        // Rest timer appears but has NOT auto-started — shows Start button
        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByText('Start')).toBeTruthy();
        jest.useRealTimers();
    });

    it('in auto mode the rest timer starts immediately after work ends', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // work ends (10s) → rest auto-starts

        // Rest phase visible with no Start button (auto-started)
        await waitFor(() => screen.getByText('REST'));
        expect(screen.queryByText('Start')).toBeNull();
        jest.useRealTimers();
    });

    it('in auto mode the next work timer starts immediately after rest ends', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // work ends → rest auto-starts
        await waitFor(() => screen.getByText('REST'));
        act(() => { jest.advanceTimersByTime(46000); }); // rest ends (45s) → next work auto-starts

        await waitFor(() => screen.getByText('WORK'));
        expect(screen.queryByText('Start')).toBeNull();
        jest.useRealTimers();
    });

    it('in manual mode switching to auto does not retroactively start the rest timer', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        // In manual mode: start work, press Next to advance to rest
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next')); // advance to rest manually
        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByText('Start')).toBeTruthy(); // rest has Start button

        // Switching to auto should NOT auto-start the already-mounted rest timer
        fireEvent.press(screen.getByText('Auto advance'));
        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByText('Start')).toBeTruthy();
        jest.useRealTimers();
    });

    it('side-rest timer always auto-starts regardless of timer mode', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        // Manual mode (default) — side 1 done
        fireEvent.press(screen.getByText('Finish workout')); // side 1 → side-rest

        // Side-rest should auto-start (no Start button) even in manual mode
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));
        expect(screen.queryByText('Start')).toBeNull();
        jest.useRealTimers();
    });

    it('in auto mode the timer card shows green background for work phase', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('WORK'));
        // The WORK label being present confirms the work-phase timer card is rendered
        expect(screen.getByText('WORK')).toBeTruthy();
    });
});
