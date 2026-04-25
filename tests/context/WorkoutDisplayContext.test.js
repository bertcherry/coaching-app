import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutDisplayProvider, useWorkoutDisplay, PREVIEW_DETAILS_KEY, ACTIVE_DETAILS_KEY, ACTIVE_AUTOPLAY_KEY } from '../../context/WorkoutDisplayContext';

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(null),
}));

function Consumer() {
    const {
        previewDetailsDefault, activeDetailsDefault, activeAutoplaysDefault,
        setPreviewDetailsDefault, setActiveDetailsDefault, setActiveAutoplaysDefault,
        hydrated,
    } = useWorkoutDisplay();
    return (
        <>
            <Text testID="preview">{String(previewDetailsDefault)}</Text>
            <Text testID="active">{String(activeDetailsDefault)}</Text>
            <Text testID="autoplay">{String(activeAutoplaysDefault)}</Text>
            <Text testID="hydrated">{String(hydrated)}</Text>
            <Pressable testID="set-preview-true"   onPress={() => setPreviewDetailsDefault(true)} />
            <Pressable testID="set-preview-false"  onPress={() => setPreviewDetailsDefault(false)} />
            <Pressable testID="set-active-true"    onPress={() => setActiveDetailsDefault(true)} />
            <Pressable testID="set-autoplay-true"  onPress={() => setActiveAutoplaysDefault(true)} />
            <Pressable testID="set-autoplay-false" onPress={() => setActiveAutoplaysDefault(false)} />
        </>
    );
}

function renderWithProvider() {
    return render(
        <WorkoutDisplayProvider>
            <Consumer />
        </WorkoutDisplayProvider>
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(null);
});

// ─── Defaults ─────────────────────────────────────────────────────────────────

describe('WorkoutDisplayContext — defaults', () => {
    it('defaults preview and active expand to false, autoplay to true', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
        expect(screen.getByTestId('preview').props.children).toBe('false');
        expect(screen.getByTestId('active').props.children).toBe('false');
        expect(screen.getByTestId('autoplay').props.children).toBe('true');
    });

    it('sets hydrated to true after AsyncStorage resolves', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    });
});

// ─── Persistence load ─────────────────────────────────────────────────────────

describe('WorkoutDisplayContext — loading saved values', () => {
    it('loads previewDetailsDefault=true from AsyncStorage', async () => {
        AsyncStorage.getItem.mockImplementation((key) =>
            Promise.resolve(key === PREVIEW_DETAILS_KEY ? 'true' : null)
        );
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('preview').props.children).toBe('true'));
        expect(screen.getByTestId('active').props.children).toBe('false');
        expect(screen.getByTestId('autoplay').props.children).toBe('true'); // default
    });

    it('loads activeDetailsDefault=true from AsyncStorage', async () => {
        AsyncStorage.getItem.mockImplementation((key) =>
            Promise.resolve(key === ACTIVE_DETAILS_KEY ? 'true' : null)
        );
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('active').props.children).toBe('true'));
        expect(screen.getByTestId('preview').props.children).toBe('false');
        expect(screen.getByTestId('autoplay').props.children).toBe('true'); // default
    });

    it('loads activeAutoplaysDefault=true from AsyncStorage', async () => {
        AsyncStorage.getItem.mockImplementation((key) =>
            Promise.resolve(key === ACTIVE_AUTOPLAY_KEY ? 'true' : null)
        );
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('autoplay').props.children).toBe('true'));
        expect(screen.getByTestId('preview').props.children).toBe('false');
        expect(screen.getByTestId('active').props.children).toBe('false');
    });

    it('loads all three values from AsyncStorage', async () => {
        AsyncStorage.getItem.mockResolvedValue('true');
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('preview').props.children).toBe('true'));
        expect(screen.getByTestId('active').props.children).toBe('true');
        expect(screen.getByTestId('autoplay').props.children).toBe('true');
    });

    it('ignores null AsyncStorage values and keeps defaults', async () => {
        AsyncStorage.getItem.mockResolvedValue(null);
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
        expect(screen.getByTestId('preview').props.children).toBe('false');
        expect(screen.getByTestId('active').props.children).toBe('false');
        expect(screen.getByTestId('autoplay').props.children).toBe('true');
    });
});

// ─── Setters ──────────────────────────────────────────────────────────────────

describe('WorkoutDisplayContext — setters', () => {
    it('setPreviewDetailsDefault updates state and persists to AsyncStorage', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        fireEvent.press(screen.getByTestId('set-preview-true'));

        await waitFor(() => expect(screen.getByTestId('preview').props.children).toBe('true'));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREVIEW_DETAILS_KEY, 'true');
    });

    it('setActiveDetailsDefault updates state and persists to AsyncStorage', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        fireEvent.press(screen.getByTestId('set-active-true'));

        await waitFor(() => expect(screen.getByTestId('active').props.children).toBe('true'));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(ACTIVE_DETAILS_KEY, 'true');
    });

    it('setActiveAutoplaysDefault updates state and persists to AsyncStorage', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        fireEvent.press(screen.getByTestId('set-autoplay-true'));

        await waitFor(() => expect(screen.getByTestId('autoplay').props.children).toBe('true'));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(ACTIVE_AUTOPLAY_KEY, 'true');
    });

    it('setPreviewDetailsDefault(false) persists "false"', async () => {
        AsyncStorage.getItem.mockResolvedValue('true');
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('preview').props.children).toBe('true'));

        fireEvent.press(screen.getByTestId('set-preview-false'));

        await waitFor(() => expect(screen.getByTestId('preview').props.children).toBe('false'));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREVIEW_DETAILS_KEY, 'false');
    });

    it('setActiveAutoplaysDefault(false) persists "false"', async () => {
        AsyncStorage.getItem.mockResolvedValue('true');
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('autoplay').props.children).toBe('true'));

        fireEvent.press(screen.getByTestId('set-autoplay-false'));

        await waitFor(() => expect(screen.getByTestId('autoplay').props.children).toBe('false'));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(ACTIVE_AUTOPLAY_KEY, 'false');
    });
});

// ─── Error guard ──────────────────────────────────────────────────────────────

describe('WorkoutDisplayContext — useWorkoutDisplay outside provider', () => {
    it('throws when used outside WorkoutDisplayProvider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Consumer />)).toThrow('useWorkoutDisplay must be used inside WorkoutDisplayProvider');
        spy.mockRestore();
    });
});
