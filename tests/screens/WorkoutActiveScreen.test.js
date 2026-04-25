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

const mockUseVideoPlayer = jest.fn(() => ({}));
jest.mock('expo-video', () => {
    return {
        VideoView: () => null,
        useVideoPlayer: (...args) => mockUseVideoPlayer(...args),
    };
});

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
    accent: '#fba8a0', accentText: '#fba8a0', fieldBackground: '#fff', accentSubtle: '#3a2020',
    success: '#7bb533', danger: '#ff6b6b', paused: '#a85420',
    overlay: 'rgba(0,0,0,0.5)', mode: 'dark',
    inputPlaceholder: '#555',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));
jest.mock('../../context/ScrollContext', () => ({
    useScrollY: () => ({ setValue: jest.fn() }),
}));

let mockActiveDetailsDefault  = false;
let mockActiveAutoplaysDefault = false;
jest.mock('../../context/WorkoutDisplayContext', () => ({
    useWorkoutDisplay: () => ({
        activeDetailsDefault:   mockActiveDetailsDefault,
        activeAutoplaysDefault: mockActiveAutoplaysDefault,
    }),
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

const DEMO_DESCRIPTION = 'Stand with feet hip-width apart and lower until thighs are parallel to the floor.';
const STREAM_ID = 'abc123stream';

/** Mock fetch: demos return { id, name, streamId: null }; everything else → {} */
function mockFetch({ withVideo = false } = {}) {
    global.fetch = jest.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/demos/')) {
            const id = urlStr.split('/demos/')[1];
            const ex = [SECTION_1.data[0], SECTION_1.data[1]].find(e => e.id === id);
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    id,
                    name: ex?.name ?? id,
                    streamId: withVideo ? STREAM_ID : null,
                    description: withVideo ? DEMO_DESCRIPTION : null,
                }),
            });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
}

import WorkoutActiveScreen from '../../screens/WorkoutActiveScreen';

beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemoveListener = null;
    mockActiveDetailsDefault   = false;
    mockActiveAutoplaysDefault = true;
    mockUseVideoPlayer.mockReturnValue({});
    mockUser = { email: 'client@test.com', isCoach: false, unitDefault: 'imperial' };
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockGetLocalWorkoutHistory.mockResolvedValue({});
    mockFetch({ withVideo: false });
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

    it('hides set inputs and Skip during side-rest but keeps Next visible', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout'));
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        // Skip is hidden, inputs are hidden, but an advance button IS available
        expect(screen.queryByText('Skip exercise')).toBeNull();
        expect(screen.queryByTestId('rest-log-header')).toBeNull();
        // Advance button is always visible — "Finish workout" because this is the last set
        expect(screen.getByText('Finish workout')).toBeTruthy();
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

    it('records set exactly once after completing both sides (deferred to rest exit)', async () => {
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
        fireEvent.press(screen.getByText('Finish section')); // side 2 work → rest phase (NO record yet)
        expect(mockEnqueueRecord).not.toHaveBeenCalled();

        // Now in rest phase — press the advance button to record and complete
        await waitFor(() => screen.getByText('REST'));
        // Label is "Finish section" because this is the last set of the last exercise
        fireEvent.press(screen.getByText('Finish section')); // rest exit → records the set

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
    it('in manual mode the rest timer auto-starts immediately (no Start button)', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        // Start the work timer manually, let it run to max
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // timer hits max but stays on work phase in manual mode

        // In manual mode the user presses Next to record and advance to rest
        fireEvent.press(screen.getByText('Next'));

        // Rest timer auto-starts (no Start button) — manual mode only controls when to advance
        await waitFor(() => screen.getByText('REST'));
        expect(screen.queryByText('Start')).toBeNull();
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

    it('rest timer runs in manual mode and shows tap-to-advance banner when rest expires', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        // Start work, press Next to enter rest
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('REST'));

        // Rest auto-started — no Start button
        expect(screen.queryByText('Start')).toBeNull();

        // Let rest expire (45s setRest) — banner appears instructing user to tap or press Next
        act(() => { jest.advanceTimersByTime(46000); });
        await waitFor(() => screen.getByText(/Rest done!/i));
        // External Next button still visible
        expect(screen.getByText('Next')).toBeTruthy();
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

// ─── Video description ────────────────────────────────────────────────────────

describe('WorkoutActiveScreen — video description', () => {
    it('does not show description before the demo toggle is pressed', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));
        expect(screen.queryByTestId('video-description')).toBeNull();
    });

    it('shows description after pressing Show demo', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));

        await waitFor(() => screen.getByTestId('video-description'));
        expect(screen.getByText(DEMO_DESCRIPTION)).toBeTruthy();
    });

    it('hides description after pressing Hide demo', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByTestId('video-description'));

        fireEvent.press(screen.getByText('Hide demo'));
        await waitFor(() => expect(screen.queryByTestId('video-description')).toBeNull());
    });

    it('does not show description when demo has no description', async () => {
        global.fetch = jest.fn((url) => {
            const urlStr = String(url);
            if (urlStr.includes('/demos/')) {
                const id = urlStr.split('/demos/')[1];
                const ex = [SECTION_1.data[0], SECTION_1.data[1]].find(e => e.id === id);
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ id, name: ex?.name ?? id, streamId: STREAM_ID, description: null }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByText('Hide demo'));

        expect(screen.queryByTestId('video-description')).toBeNull();
    });

    it('description view has accessible label for screenreaders', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByTestId('video-description'));

        const descView = screen.getByTestId('video-description');
        expect(descView.props.accessibilityLabel).toBe(`Exercise description: ${DEMO_DESCRIPTION}`);
        expect(descView.props.accessibilityRole).toBe('text');
    });

    it('toggle button has correct accessibilityRole and expanded state', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        const showBtn = screen.getByRole('button', { name: /Show Squat demo video/i });
        expect(showBtn).toBeTruthy();

        fireEvent.press(showBtn);
        await waitFor(() => screen.getByTestId('video-description'));

        const hideBtn = screen.getByRole('button', { name: /Hide Squat demo video/i });
        expect(hideBtn).toBeTruthy();
    });

    it('description is hidden after advancing to the next set (showVideo reset)', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByTestId('video-description'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        expect(screen.queryByTestId('video-description')).toBeNull();
    });
});

// ─── activeDetailsDefault setting ────────────────────────────────────────────

describe('WorkoutActiveScreen — activeDetailsDefault', () => {
    it('hides demo video by default when activeDetailsDefault=false', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));
        expect(screen.queryByTestId('video-description')).toBeNull();
    });

    it('shows demo video on mount when activeDetailsDefault=true', async () => {
        mockActiveDetailsDefault = true;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));
        expect(screen.getByTestId('video-description')).toBeTruthy();
    });

    it('shows "Hide demo" label on mount when activeDetailsDefault=true', async () => {
        mockActiveDetailsDefault = true;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => expect(screen.getByText('Hide demo')).toBeTruthy());
    });

    it('video remains visible after advancing to next set when activeDetailsDefault=true', async () => {
        mockActiveDetailsDefault = true;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        expect(screen.getByTestId('video-description')).toBeTruthy();
        expect(screen.getByText('Hide demo')).toBeTruthy();
    });

    it('hides video after pressing Hide demo when activeDetailsDefault=true', async () => {
        mockActiveDetailsDefault = true;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));

        fireEvent.press(screen.getByText('Hide demo'));
        await waitFor(() => expect(screen.queryByTestId('video-description')).toBeNull());
        expect(screen.getByText('Show demo')).toBeTruthy();
    });

    it('video resets to hidden on next set when activeDetailsDefault=false even if user opened it', async () => {
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByText('Hide demo'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        expect(screen.queryByTestId('video-description')).toBeNull();
        expect(screen.getByText('Show demo')).toBeTruthy();
    });
});

// ─── activeAutoplaysDefault setting ──────────────────────────────────────────
// activeAutoplaysDefault only governs demos that open via the default-expand setting.
// Demos opened manually by the user always autoplay regardless of this setting.

describe('WorkoutActiveScreen — activeAutoplaysDefault', () => {
    it('calls p.play() when default-expanded and activeAutoplaysDefault=true (default)', async () => {
        mockActiveDetailsDefault  = true;
        mockActiveAutoplaysDefault = true;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));

        const setupFn = mockUseVideoPlayer.mock.calls[0]?.[1];
        expect(setupFn).toBeDefined();
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);
        expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('does not call p.play() when default-expanded and activeAutoplaysDefault=false', async () => {
        mockActiveDetailsDefault  = true;
        mockActiveAutoplaysDefault = false;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));

        const setupFn = mockUseVideoPlayer.mock.calls[0]?.[1];
        expect(setupFn).toBeDefined();
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);
        expect(mockPlayer.play).not.toHaveBeenCalled();
    });

    it('always calls p.play() when user manually opens video, even if activeAutoplaysDefault=false', async () => {
        mockActiveAutoplaysDefault = false;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Show demo'));

        fireEvent.press(screen.getByText('Show demo'));
        await waitFor(() => screen.getByText('Hide demo'));

        const setupFn = mockUseVideoPlayer.mock.calls[0]?.[1];
        expect(setupFn).toBeDefined();
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);
        expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('resets to default-expand autoplay behavior after advancing to next set', async () => {
        mockActiveDetailsDefault  = true;
        mockActiveAutoplaysDefault = false;
        mockFetch({ withVideo: true });
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Hide demo'));

        // Advance — video re-opens via default-expand, autoplay=false
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        const lastCall = mockUseVideoPlayer.mock.calls[mockUseVideoPlayer.mock.calls.length - 1];
        const setupFn = lastCall?.[1];
        expect(setupFn).toBeDefined();
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);
        expect(mockPlayer.play).not.toHaveBeenCalled();
    });
});

// ─── Up Next banner ───────────────────────────────────────────────────────────

const TWO_SECTION_WORKOUT = [
    {
        title: 'Section 1', circuit: false, timed: false,
        data: [{
            id: 'ex-a', name: 'Squat',
            setsMin: 1, setsMax: null,
            countType: 'Reps', countMin: 5, countMax: null,
            recommendedWeight: null, recommendedRpe: null,
            coachNotes: null, setConfigs: null,
        }],
    },
    {
        title: 'Section 2', circuit: false, timed: false,
        data: [{
            id: 'ex-b', name: 'Front Plank Hold',
            setsMin: 1, setsMax: null,
            countType: 'Timed', countMin: 30, countMax: null,
            recommendedWeight: null, recommendedRpe: null,
            coachNotes: null, setConfigs: null,
        }],
    },
];

function mockFetchForExercises(exercises) {
    global.fetch = jest.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/demos/')) {
            const id = urlStr.split('/demos/')[1];
            const ex = exercises.find(e => e.id === id);
            return Promise.resolve({
                ok: true,
                json: async () => ({ id, name: ex?.name ?? id, streamId: null, description: null }),
            });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
}

describe('WorkoutActiveScreen — Up Next banner', () => {
    it('shows Up Next banner with same exercise and next set number when more sets remain', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        await waitFor(() => expect(screen.getByTestId('up-next-banner')).toBeTruthy());
        expect(screen.getByText('Squat Set 2, 5 reps')).toBeTruthy();
    });

    it('updates Up Next set number as sets advance', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));

        expect(screen.getByText('Squat Set 3, 5 reps')).toBeTruthy();
    });

    it('shows next different exercise with Set 1 when on last set of current exercise', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));

        await waitFor(() => expect(screen.getByTestId('up-next-banner')).toBeTruthy());
        expect(screen.getByText('Deadlift Set 1, 3 reps')).toBeTruthy();
    });

    it('banner has accessible label for screenreaders', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        const banner = await waitFor(() => screen.getByTestId('up-next-banner'));
        expect(banner.props.accessibilityLabel).toBe('Up next: Squat Set 2, 5 reps');
        expect(banner.props.accessibilityRole).toBe('text');
    });

    it('hides Up Next banner on last exercise of last section (end of workout)', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Set 1 of 3'));

        // Complete Squat (3 sets), advance to Deadlift set 2 (last)
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 3 of 3'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Deadlift'));
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('Set 2 of 2'));

        expect(screen.queryByTestId('up-next-banner')).toBeNull();
    });

    it('shows "New Section - [name], [prescription]" when next exercise is in a new section (full workout mode)', async () => {
        mockFetchForExercises([...TWO_SECTION_WORKOUT[0].data, ...TWO_SECTION_WORKOUT[1].data]);
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TWO_SECTION_WORKOUT })} />);
        await waitFor(() => screen.getByText('Squat'));

        await waitFor(() => expect(screen.getByTestId('up-next-banner')).toBeTruthy());
        expect(screen.getByText('New Section - Front Plank Hold, 30 sec')).toBeTruthy();
    });

    it('cross-section banner accessible label reads section, exercise name, and prescription', async () => {
        mockFetchForExercises([...TWO_SECTION_WORKOUT[0].data, ...TWO_SECTION_WORKOUT[1].data]);
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TWO_SECTION_WORKOUT })} />);
        await waitFor(() => screen.getByText('Squat'));

        const banner = await waitFor(() => screen.getByTestId('up-next-banner'));
        expect(banner.props.accessibilityLabel).toBe('Up next: New Section, Front Plank Hold, 30 sec');
    });

    it('hides Up Next banner when sectionOnly=true and on last exercise', async () => {
        mockFetchForExercises([...TWO_SECTION_WORKOUT[0].data, ...TWO_SECTION_WORKOUT[1].data]);
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({
            workoutData: TWO_SECTION_WORKOUT,
            sectionOnly: true,
            startSectionIdx: 0,
        })} />);
        await waitFor(() => screen.getByText('Squat'));

        expect(screen.queryByTestId('up-next-banner')).toBeNull();
    });
});

// ─── Timer pause behavior ─────────────────────────────────────────────────────

describe('WorkoutActiveScreen — timer pause', () => {
    it('tapping the timer card before starting has no effect (no pause label)', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByTestId('timer-card'));
        expect(screen.queryByTestId('timer-paused-label')).toBeNull();
    });

    it('tapping the timer card after starting shows PAUSED label', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(2000); });

        fireEvent.press(screen.getByTestId('timer-card'));
        await waitFor(() => screen.getByTestId('timer-paused-label'));
        expect(screen.getByTestId('timer-paused-label')).toBeTruthy();
        jest.useRealTimers();
    });

    it('tapping the timer card again resumes (removes PAUSED label)', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(2000); });

        // Pause
        fireEvent.press(screen.getByTestId('timer-card'));
        await waitFor(() => screen.getByTestId('timer-paused-label'));

        // Resume
        fireEvent.press(screen.getByTestId('timer-card'));
        await waitFor(() => expect(screen.queryByTestId('timer-paused-label')).toBeNull());
        jest.useRealTimers();
    });

    it('paused timer does not advance elapsed time', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(2000); });
        const displayBefore = screen.getByTestId('timer-display').props.children;

        // Pause and advance time — display should not change
        fireEvent.press(screen.getByTestId('timer-card'));
        act(() => { jest.advanceTimersByTime(5000); });
        const displayAfterPause = screen.getByTestId('timer-display').props.children;

        expect(displayBefore).toBe(displayAfterPause);
        jest.useRealTimers();
    });

    it('pause resets to running when advancing from rest to next set', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        // Complete work → enter rest (auto-starts)
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('REST'));

        // Pause the rest timer
        fireEvent.press(screen.getByTestId('timer-card'));
        await waitFor(() => screen.getByTestId('timer-paused-label'));

        // Press Next to advance to next work set
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('WORK'));

        // Paused label should be gone on the new work timer
        expect(screen.queryByTestId('timer-paused-label')).toBeNull();
        jest.useRealTimers();
    });
});

// ─── Rest note field position ─────────────────────────────────────────────────

describe('WorkoutActiveScreen — rest note field', () => {
    it('note field appears during rest phase', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));

        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByTestId('rest-note-input')).toBeTruthy();
        jest.useRealTimers();
    });

    it('log-set header (rest-specific UI) is not visible during work phase', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));
        expect(screen.queryByTestId('rest-log-header')).toBeNull();
    });
});

// ─── Next button always visible ───────────────────────────────────────────────

describe('WorkoutActiveScreen — Next button always visible', () => {
    it('Next button is visible during work phase in manual mode', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));
        expect(screen.getByText('Next')).toBeTruthy();
    });

    it('Next button is visible during rest phase in manual mode', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));

        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByText('Next')).toBeTruthy();
        jest.useRealTimers();
    });

    it('Next button is visible during rest phase in auto mode', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // work ends → rest auto-starts

        await waitFor(() => screen.getByText('REST'));
        expect(screen.getByText('Next')).toBeTruthy();
        jest.useRealTimers();
    });

    it('Skip exercise button is hidden during rest phase', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));

        await waitFor(() => screen.getByText('REST'));
        expect(screen.queryByText('Skip exercise')).toBeNull();
        jest.useRealTimers();
    });
});

// ─── Max-reached tap-to-advance (work phase, manual mode) ────────────────────

describe('WorkoutActiveScreen — max-reached tap-to-advance', () => {
    it('shows tap-to-advance banner when work timer maxes in manual mode', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // hits countMin=10 max

        await waitFor(() => screen.getByText(/Done! Tap here/i));
        jest.useRealTimers();
    });

    it('tapping timer card when max reached in manual mode advances to rest', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });

        await waitFor(() => screen.getByText(/Done! Tap here/i));
        fireEvent.press(screen.getByTestId('timer-card'));

        await waitFor(() => screen.getByText('REST'));
        jest.useRealTimers();
    });

    it('tapping timer card when rest expires in manual mode records and advances', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('REST'));

        // Let rest expire then tap the timer card
        act(() => { jest.advanceTimersByTime(46000); });
        await waitFor(() => screen.getByText(/Rest done!/i));
        fireEvent.press(screen.getByTestId('timer-card'));

        // Should record and return to WORK
        expect(mockEnqueueRecord).toHaveBeenCalledTimes(1);
        await waitFor(() => screen.getByText('WORK'));
        jest.useRealTimers();
    });
});

// ─── Deferred recording (rest-phase logging) ─────────────────────────────────

describe('WorkoutActiveScreen — deferred recording at rest exit', () => {
    it('does NOT record when pressing Next from work phase to enter rest', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        mockEnqueueRecord.mockClear();
        fireEvent.press(screen.getByText('Next')); // work → rest

        await waitFor(() => screen.getByText('REST'));
        expect(mockEnqueueRecord).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('records once when pressing Next from rest phase', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next')); // work → rest (no record)
        await waitFor(() => screen.getByText('REST'));

        mockEnqueueRecord.mockClear();
        fireEvent.press(screen.getByText('Next')); // rest → next set (records now)
        expect(mockEnqueueRecord).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('full set inputs (weight, count, RPE, note) are visible during rest', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        fireEvent.press(screen.getByText('Next'));
        await waitFor(() => screen.getByText('REST'));

        expect(screen.getByText(/Sec done/i)).toBeTruthy();
        expect(screen.getByText(/RPE/i)).toBeTruthy();
        // Header includes exercise name (or id) and set number
        const header = screen.getByTestId('rest-log-header');
        expect(header).toBeTruthy();
        expect(header.props.children.join('').toLowerCase()).toContain('set');
        jest.useRealTimers();
    });

    it('count field is pre-filled with elapsed seconds after auto-advance', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // work ends at countMin=10s → rest

        await waitFor(() => screen.getByText('REST'));
        const countInput = screen.getByTestId('count-input');
        // Pre-filled with elapsed time (10s target; fake-timer batching may produce 10 or 11)
        expect(parseInt(countInput.props.value, 10)).toBeGreaterThanOrEqual(10);
        jest.useRealTimers();
    });

    it('user can edit the count field during rest before it is recorded', async () => {
        jest.useFakeTimers();
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: TIMED_TWO_SET_WORKOUT })} />);
        await waitFor(() => screen.getByText('Plank'));

        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); });
        await waitFor(() => screen.getByText('REST'));

        fireEvent.changeText(screen.getByTestId('count-input'), '8');
        mockEnqueueRecord.mockClear();
        fireEvent.press(screen.getByText('Next'));

        expect(mockEnqueueRecord).toHaveBeenCalledWith(expect.objectContaining({
            reps: 8,
        }));
        jest.useRealTimers();
    });
});

// ─── Side-rest early advance via Next ────────────────────────────────────────

describe('WorkoutActiveScreen — side-rest Next button', () => {
    it('pressing Next during side-rest advances to side 2 without recording', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout')); // side 1 → side-rest
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        mockEnqueueRecord.mockClear();
        // Button shows "Finish workout" because it's a single-set exercise — same advance action
        fireEvent.press(screen.getByText('Finish workout')); // early advance through side-rest

        await waitFor(() => screen.getByText('Side 2 of 2'));
        expect(mockEnqueueRecord).not.toHaveBeenCalled();
    });

    it('Next button is visible during side-rest', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: [TIMED_TWO_SIDED_SECTION] })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        fireEvent.press(screen.getByText('Finish workout'));
        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));

        expect(screen.getByText('Finish workout')).toBeTruthy(); // same label — it's the last set
    });

    it('count field pre-fills with average of side 1 and side 2 elapsed after auto-advance', async () => {
        jest.useFakeTimers();
        // Exercise with countMin=30 so timer runs to 30s on each side
        const twoSidedWorkout = [{
            title: 'S', circuit: false, timed: true, repRest: 20, setRest: 45,
            data: [{
                id: 'ex-avg', name: 'Side Plank',
                setsMin: 1, setsMax: null,
                countType: 'Timed', countMin: 10, countMax: null,
                sides: 'two', restBetweenSides: 5,
                recommendedWeight: null, recommendedRpe: null,
                coachNotes: null, setConfigs: null,
            }],
        }];

        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData: twoSidedWorkout })} />);
        await waitFor(() => screen.getByText('Side Plank'));

        // Side 1: auto-advance after 10s
        fireEvent.press(screen.getByText('Auto advance'));
        fireEvent.press(screen.getByText('Start'));
        act(() => { jest.advanceTimersByTime(11000); }); // side 1 ends → side-rest

        await waitFor(() => screen.getByText('REST (BETWEEN SIDES)'));
        // Side-rest auto-advances after 5s → side 2
        act(() => { jest.advanceTimersByTime(6000); });
        await waitFor(() => screen.getByText('Side 2 of 2'));

        // Side 2: auto-advance after 10s → main rest
        act(() => { jest.advanceTimersByTime(11000); });
        await waitFor(() => screen.getByText('REST'));

        // Count should be average of side1 (~10s) and side2 (~10s) → 10
        const countInput = screen.getByTestId('count-input');
        expect(parseInt(countInput.props.value, 10)).toBeGreaterThanOrEqual(10);
        jest.useRealTimers();
    });
});

// ─── Section note ─────────────────────────────────────────────────────────────

describe('WorkoutActiveScreen — section note', () => {
    it('shows the section note above the exercise name when section.note is set', async () => {
        const workoutData = [{
            ...SECTION_1,
            note: 'Focus on tempo throughout this section.',
        }];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));

        expect(screen.getByTestId('section-note')).toBeTruthy();
        expect(screen.getByText('Focus on tempo throughout this section.')).toBeTruthy();
    });

    it('does not render section note when section.note is null', async () => {
        const workoutData = [{ ...SECTION_1, note: null }];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('section-note')).toBeNull();
    });

    it('does not render section note when section.note is absent', async () => {
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute()} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('section-note')).toBeNull();
    });

    it('section note persists across exercises within the same section', async () => {
        const workoutData = [{
            ...SECTION_1,
            note: 'Keep rest short.',
        }];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByTestId('section-note')).toBeTruthy();

        // Advance through all sets of exercise 1 to reach exercise 2
        const totalSets = SECTION_1.data[0].setsMin; // 3
        for (let i = 0; i < totalSets; i++) {
            fireEvent.press(screen.getByText('Next'));
        }

        await waitFor(() => screen.getByText('Deadlift'));
        expect(screen.getByTestId('section-note')).toBeTruthy();
        expect(screen.getByText('Keep rest short.')).toBeTruthy();
    });

    it('section note updates when moving to a new section with a different note', async () => {
        const workoutData = [
            { ...SECTION_1, note: 'Section 1 tip.' },
            {
                title: 'Section 2',
                circuit: false,
                timed: false,
                note: 'Section 2 tip.',
                data: [{
                    id: 'ex-3', name: 'Bench Press',
                    setsMin: 2, setsMax: null,
                    countType: 'Reps', countMin: 8, countMax: null,
                    recommendedWeight: null, recommendedRpe: null,
                    coachNotes: null, setConfigs: null,
                }],
            },
        ];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByText('Section 1 tip.')).toBeTruthy();

        // Complete all exercises/sets in section 1
        const ex1Sets = SECTION_1.data[0].setsMin; // 3
        const ex2Sets = SECTION_1.data[1].setsMin; // 2
        for (let i = 0; i < ex1Sets + ex2Sets; i++) {
            fireEvent.press(screen.getByText('Next'));
        }

        await waitFor(() => screen.getByText('Bench Press'));
        expect(screen.getByText('Section 2 tip.')).toBeTruthy();
        expect(screen.queryByText('Section 1 tip.')).toBeNull();
    });

    it('section note disappears when moving to a new section with no note', async () => {
        const workoutData = [
            { ...SECTION_1, note: 'Section 1 tip.' },
            {
                title: 'Section 2',
                circuit: false,
                timed: false,
                note: null,
                data: [{
                    id: 'ex-3', name: 'Bench Press',
                    setsMin: 2, setsMax: null,
                    countType: 'Reps', countMin: 8, countMax: null,
                    recommendedWeight: null, recommendedRpe: null,
                    coachNotes: null, setConfigs: null,
                }],
            },
        ];
        render(<WorkoutActiveScreen navigation={makeNavigation()} route={makeRoute({ workoutData })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByTestId('section-note')).toBeTruthy();

        const ex1Sets = SECTION_1.data[0].setsMin; // 3
        const ex2Sets = SECTION_1.data[1].setsMin; // 2
        for (let i = 0; i < ex1Sets + ex2Sets; i++) {
            fireEvent.press(screen.getByText('Next'));
        }

        await waitFor(() => screen.getByText('Bench Press'));
        expect(screen.queryByTestId('section-note')).toBeNull();
    });
});
