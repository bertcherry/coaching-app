/**
 * tests/components/WorkoutPreviewItem.test.js
 *
 * Verifies WorkoutPreviewItem video behavior:
 *   - Film button visibility (has streamId, no streamId, completed, fetch failure)
 *   - VideoView shows / hides on toggle
 *   - useVideoPlayer receives the correct HLS stream URL
 *   - Player setup callback configures loop, muted, and autoplay
 *   - Loading state before demo fetch resolves
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseVideoPlayer = jest.fn(() => ({}));

jest.mock('expo-video', () => {
    const { View } = require('react-native');
    return {
        VideoView: (props) => <View testID={props.testID ?? 'video-player'} />,
        useVideoPlayer: (...args) => mockUseVideoPlayer(...args),
    };
});

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666', divider: '#444',
    accent: '#fba8a0', accentText: '#fba8a0', accentSubtle: '#3a2020',
    success: '#7bb533', overlay: 'rgba(0,0,0,0.5)', mode: 'dark',
};

jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

jest.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: { email: 'client@test.com' }, accessToken: 'tok', authFetch: jest.fn() }),
}));

jest.mock('../../utils/WorkoutSync', () => ({
    enqueueRecord: jest.fn(),
}));

jest.mock('../../components/SetRow', () => {
    const { View, Pressable, Text } = require('react-native');
    return ({ setNumber, noBorderTop, onSave }) => (
        <View testID={noBorderTop ? `set-row-no-border-${setNumber}` : `set-row-${setNumber}`}>
            <Pressable testID={`save-set-${setNumber}`} onPress={() => onSave?.({ set: setNumber })}>
                <Text>Save</Text>
            </Pressable>
        </View>
    );
});

// ─── Constants ────────────────────────────────────────────────────────────────

const STREAM_ID   = 'abc123stream';
const EXERCISE_ID = 'ex-1';
const HLS_URL     = `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${STREAM_ID}/manifest/video.m3u8`;
const DESCRIPTION = 'Stand with feet hip-width apart and lower until thighs are parallel to the floor.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockDemoFetch(overrides = {}) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            id: EXERCISE_ID,
            name: 'Squat',
            hasVideo: true,
            streamId: STREAM_ID,
            description: DESCRIPTION,
            ...overrides,
        }),
    });
}

function defaultProps(overrides = {}) {
    return {
        workoutId: 'workout-1',
        clientId: 'client-1',
        unitDefault: 'lbs',
        onSetSaved: jest.fn(),
        id: EXERCISE_ID,
        name: 'Squat',
        setsMin: 3,
        setsMax: null,
        countType: 'Reps',
        countMin: 5,
        countMax: null,
        ...overrides,
    };
}

import WorkoutPreviewItem from '../../components/WorkoutPreviewItem';

beforeEach(() => {
    jest.clearAllMocks();
    mockDemoFetch();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('WorkoutPreviewItem — loading state', () => {
    it('shows loading text before demo fetch resolves', () => {
        global.fetch = jest.fn(() => new Promise(() => {})); // never resolves
        render(<WorkoutPreviewItem {...defaultProps()} />);
        expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('shows exercise name after demo loads', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByText('Squat')).toBeTruthy();
    });
});

// ─── Film button visibility ───────────────────────────────────────────────────

describe('WorkoutPreviewItem — film button visibility', () => {
    it('shows film button when demo has a streamId', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));
        expect(screen.getByTestId('icon-film')).toBeTruthy();
    });

    it('hides film button when demo has no streamId', async () => {
        mockDemoFetch({ streamId: null, hasVideo: false });
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('icon-film')).toBeNull();
    });

    it('hides film button when isCompleted is true', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ isCompleted: true })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('icon-film')).toBeNull();
    });

    it('hides film button when demo fetch fails (streamId falls back to null)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        await waitFor(() => screen.getByText('Squat')); // fallback name renders
        expect(screen.queryByTestId('icon-film')).toBeNull();
    });
});

// ─── Video toggle ─────────────────────────────────────────────────────────────

describe('WorkoutPreviewItem — video toggle', () => {
    it('does not render VideoView before the film button is pressed', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));
        expect(screen.queryByTestId('video-player')).toBeNull();
    });

    it('renders VideoView after pressing the film button', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));

        await waitFor(() => screen.getByTestId('video-player'));
        expect(screen.getByTestId('video-player')).toBeTruthy();
    });

    it('hides VideoView after pressing the film button a second time', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-player'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => expect(screen.queryByTestId('video-player')).toBeNull());
    });
});

// ─── useVideoPlayer ───────────────────────────────────────────────────────────

describe('WorkoutPreviewItem — useVideoPlayer', () => {
    it('does not call useVideoPlayer before the film button is pressed', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));
        expect(mockUseVideoPlayer).not.toHaveBeenCalled();
    });

    it('calls useVideoPlayer with the correct HLS stream URL', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-player'));

        expect(mockUseVideoPlayer).toHaveBeenCalledWith(
            { uri: HLS_URL },
            expect.any(Function),
        );
    });

    it('setup callback configures loop=true, muted=true, and calls play', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-player'));

        const setupFn = mockUseVideoPlayer.mock.calls[0][1];
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);

        expect(mockPlayer.loop).toBe(true);
        expect(mockPlayer.muted).toBe(true);
        expect(mockPlayer.play).toHaveBeenCalled();
    });
});

// ─── Set 1 border (noBorderTop) ───────────────────────────────────────────────

async function openLogs(props) {
    render(<WorkoutPreviewItem {...props} />);
    await waitFor(() => screen.getByTestId('icon-edit-3'));
    fireEvent.press(screen.getByTestId('icon-edit-3'));
    await waitFor(() => screen.getAllByTestId(/set-row/));
}

describe('WorkoutPreviewItem — set 1 top border', () => {
    it('removes Set 1 border when there is no rec banner and no sets are complete', async () => {
        await openLogs(defaultProps());
        expect(screen.getByTestId('set-row-no-border-1')).toBeTruthy();
    });

    it('keeps Set 1 border when recommendedWeight is present', async () => {
        await openLogs(defaultProps({ recommendedWeight: '135' }));
        expect(screen.getByTestId('set-row-1')).toBeTruthy();
        expect(screen.queryByTestId('set-row-no-border-1')).toBeNull();
    });

    it('keeps Set 1 border when recommendedRpe is present', async () => {
        await openLogs(defaultProps({ recommendedRpe: 7 }));
        expect(screen.getByTestId('set-row-1')).toBeTruthy();
        expect(screen.queryByTestId('set-row-no-border-1')).toBeNull();
    });

    it('keeps Set 1 border when all required sets are logged (requiredComplete)', async () => {
        await openLogs(defaultProps({ setsMin: 1, setsMax: null }));
        expect(screen.getByTestId('set-row-no-border-1')).toBeTruthy(); // not complete yet

        fireEvent.press(screen.getByTestId('save-set-1'));

        // requiredComplete is now true — Set 1 should have its border back
        await waitFor(() => expect(screen.queryByTestId('set-row-no-border-1')).toBeNull());
        expect(screen.getByTestId('set-row-1')).toBeTruthy();
    });

    it('never removes the border from Set 2 or later', async () => {
        await openLogs(defaultProps({ setsMin: 3 }));
        expect(screen.queryByTestId('set-row-no-border-2')).toBeNull();
        expect(screen.queryByTestId('set-row-no-border-3')).toBeNull();
        expect(screen.getByTestId('set-row-2')).toBeTruthy();
        expect(screen.getByTestId('set-row-3')).toBeTruthy();
    });
});

// ─── Video description ────────────────────────────────────────────────────────

describe('WorkoutPreviewItem — video description', () => {
    it('does not show description before the film button is pressed', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));
        expect(screen.queryByTestId('video-description')).toBeNull();
    });

    it('shows description text after pressing the film button', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));

        await waitFor(() => screen.getByTestId('video-description'));
        expect(screen.getByText(DESCRIPTION)).toBeTruthy();
    });

    it('hides description after pressing the film button a second time', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-description'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => expect(screen.queryByTestId('video-description')).toBeNull());
    });

    it('does not show description when demo has no description', async () => {
        mockDemoFetch({ description: null });
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-player'));

        expect(screen.queryByTestId('video-description')).toBeNull();
    });

    it('description view has accessible label for screenreaders', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-description'));

        const descView = screen.getByTestId('video-description');
        expect(descView.props.accessibilityLabel).toBe(`Exercise description: ${DESCRIPTION}`);
        expect(descView.props.accessibilityRole).toBe('text');
    });

    it('film button has accessibilityRole button and correct expanded state', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        const btn = screen.getByTestId('icon-film').parent;
        // Find the Pressable by its accessibilityRole
        const pressable = screen.getByRole('button', { name: /Show Squat demo video/i });
        expect(pressable).toBeTruthy();

        fireEvent.press(pressable);
        await waitFor(() => screen.getByTestId('video-player'));

        const pressableExpanded = screen.getByRole('button', { name: /Hide Squat demo video/i });
        expect(pressableExpanded).toBeTruthy();
    });
});

// ─── initialShowVideo prop ────────────────────────────────────────────────────

describe('WorkoutPreviewItem — initialShowVideo', () => {
    it('shows video and description immediately when initialShowVideo=true', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ initialShowVideo: true })} />);
        await waitFor(() => screen.getByTestId('video-player'));
        expect(screen.getByTestId('video-description')).toBeTruthy();
    });

    it('does NOT call p.play() (no autoplay) when initially open via initialShowVideo', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ initialShowVideo: true })} />);
        await waitFor(() => screen.getByTestId('video-player'));

        const setupFn = mockUseVideoPlayer.mock.calls[0][1];
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);

        expect(mockPlayer.play).not.toHaveBeenCalled();
    });

    it('calls p.play() (autoplay) when user manually opens video with initialShowVideo=false', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByTestId('icon-film'));

        fireEvent.press(screen.getByTestId('icon-film'));
        await waitFor(() => screen.getByTestId('video-player'));

        const setupFn = mockUseVideoPlayer.mock.calls[0][1];
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);

        expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('calls p.play() when user closes and reopens a default-open video', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ initialShowVideo: true })} />);
        await waitFor(() => screen.getByTestId('video-player'));

        // close
        fireEvent.press(screen.getByRole('button', { name: /Hide Squat demo video/i }));
        await waitFor(() => expect(screen.queryByTestId('video-player')).toBeNull());

        // reopen — now user-initiated so autoplay should be true
        fireEvent.press(screen.getByRole('button', { name: /Show Squat demo video/i }));
        await waitFor(() => screen.getByTestId('video-player'));

        const lastCall = mockUseVideoPlayer.mock.calls[mockUseVideoPlayer.mock.calls.length - 1];
        const setupFn = lastCall[1];
        const mockPlayer = { play: jest.fn() };
        setupFn(mockPlayer);

        expect(mockPlayer.play).toHaveBeenCalled();
    });

    it('hides video after pressing film button when initialShowVideo=true', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ initialShowVideo: true })} />);
        await waitFor(() => screen.getByTestId('video-player'));

        fireEvent.press(screen.getByRole('button', { name: /Hide Squat demo video/i }));
        await waitFor(() => expect(screen.queryByTestId('video-player')).toBeNull());
    });
});

// ─── Two-sided exercise pills ─────────────────────────────────────────────────

describe('WorkoutPreviewItem — two-sided exercise', () => {
    it('appends "/ side" to timed prescription when sides=two', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ countType: 'Timed', countMin: 30, sides: 'two' })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByText('30 sec / side')).toBeTruthy();
    });

    it('appends "/ side" to reps prescription when sides=two', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ countType: 'Reps', countMin: 10, sides: 'two' })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByText('10 reps / side')).toBeTruthy();
    });

    it('shows rest between sides pill when sides=two and restBetweenSides is set', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ sides: 'two', restBetweenSides: 5 })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByTestId('sides-rest-pill')).toBeTruthy();
        expect(screen.getByText('5s rest between sides')).toBeTruthy();
    });

    it('does not show rest between sides pill when sides=single', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ sides: 'single', restBetweenSides: null })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('sides-rest-pill')).toBeNull();
    });

    it('does not show rest between sides pill when sides is null', async () => {
        render(<WorkoutPreviewItem {...defaultProps()} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.queryByTestId('sides-rest-pill')).toBeNull();
    });

    it('does not append "/ side" to prescription when sides=single', async () => {
        render(<WorkoutPreviewItem {...defaultProps({ countType: 'Timed', countMin: 30, sides: 'single' })} />);
        await waitFor(() => screen.getByText('Squat'));
        expect(screen.getByText('30 sec')).toBeTruthy();
        expect(screen.queryByText('30 sec / side')).toBeNull();
    });
});
