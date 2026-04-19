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

jest.mock('expo-av', () => ({
    Video: () => null,
    ResizeMode: { CONTAIN: 'CONTAIN' },
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
jest.mock('../../utils/WorkoutSync', () => ({
    enqueueRecord: (...args) => mockEnqueueRecord(...args),
    syncQueue:     (...args) => mockSyncQueue(...args),
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
