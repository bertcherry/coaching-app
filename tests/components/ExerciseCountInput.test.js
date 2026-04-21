/**
 * tests/components/ExerciseCountInput.test.js
 *
 * Tests for ExerciseCountInput focusing on the Single/Two Sides feature:
 *   - Single/Two Sides toggle renders for Timed exercises
 *   - Single is selected by default (sides: null treated as 'single')
 *   - Pressing "Two Sides" calls setFieldValue and shows restBetweenSides input
 *   - Pressing "Single" hides restBetweenSides input and clears the field
 *   - Preview text includes "× 2 sides" when Two Sides is selected
 *   - Single/Two Sides toggle does not render for Reps exercises
 *   - Single/Two Sides toggle renders when forceTimed=true
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ExerciseCountInput from '../../components/ExerciseCountInput';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@expo/vector-icons/Feather', () => {
    const { View } = require('react-native');
    return ({ name }) => <View testID={`icon-${name}`} />;
});

const mockTheme = {
    background: '#000', surface: '#111', surfaceElevated: '#222', surfaceBorder: '#333',
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666',
    accent: '#fba8a0', accentText: '#fba8a0', accentSubtle: '#3a2020',
    fieldBackground: '#111', inputPlaceholder: '#555', success: '#7bb533',
};
jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

// ErrorMessage: just renders children when they exist
jest.mock('formik', () => ({
    ErrorMessage: ({ render: renderMsg, name }) => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides = {}) {
    return {
        countType: 'Timed',
        countMin: 30,
        countMax: null,
        timeCapSeconds: null,
        sides: null,
        restBetweenSides: null,
        ...overrides,
    };
}

function renderInput(exerciseOverrides = {}, props = {}) {
    const setFieldValue = jest.fn();
    const handleChange = jest.fn(() => jest.fn());
    const handleBlur   = jest.fn(() => jest.fn());

    render(
        <ExerciseCountInput
            exercise={makeExercise(exerciseOverrides)}
            fieldBase="data.0.data.0"
            handleChange={handleChange}
            handleBlur={handleBlur}
            setFieldValue={setFieldValue}
            forceTimed={false}
            {...props}
        />
    );
    return { setFieldValue, handleChange, handleBlur };
}

// ─── Single / Two Sides — Timed ───────────────────────────────────────────────

describe('ExerciseCountInput — Single/Two Sides for Timed', () => {
    it('renders Single and Two Sides buttons for Timed exercises', () => {
        renderInput({ countType: 'Timed' });
        expect(screen.getByTestId('sides-single')).toBeTruthy();
        expect(screen.getByTestId('sides-two')).toBeTruthy();
    });

    it('Single is visually active by default when sides is null', () => {
        renderInput({ countType: 'Timed', sides: null });
        expect(screen.getByText('Single')).toBeTruthy();
        expect(screen.getByText('Two Sides')).toBeTruthy();
        // restBetweenSides input should NOT be visible
        expect(screen.queryByTestId('rest-between-sides-input')).toBeNull();
    });

    it('restBetweenSides input is hidden when sides is "single"', () => {
        renderInput({ countType: 'Timed', sides: 'single' });
        expect(screen.queryByTestId('rest-between-sides-input')).toBeNull();
    });

    it('pressing "Two Sides" calls setFieldValue with sides="two"', () => {
        const { setFieldValue } = renderInput({ countType: 'Timed', sides: null });
        fireEvent.press(screen.getByTestId('sides-two'));
        expect(setFieldValue).toHaveBeenCalledWith('data.0.data.0.sides', 'two');
    });

    it('shows restBetweenSides input when sides is "two"', () => {
        renderInput({ countType: 'Timed', sides: 'two' });
        expect(screen.getByTestId('rest-between-sides-input')).toBeTruthy();
    });

    it('pressing "Single" calls setFieldValue with sides="single" and clears restBetweenSides', () => {
        const { setFieldValue } = renderInput({ countType: 'Timed', sides: 'two', restBetweenSides: 5 });
        fireEvent.press(screen.getByTestId('sides-single'));
        expect(setFieldValue).toHaveBeenCalledWith('data.0.data.0.sides', 'single');
        expect(setFieldValue).toHaveBeenCalledWith('data.0.data.0.restBetweenSides', null);
    });

    it('preview text shows "× 2 sides" when Two Sides selected', () => {
        renderInput({ countType: 'Timed', countMin: 30, sides: 'two' });
        expect(screen.getByText('30 sec × 2 sides')).toBeTruthy();
    });

    it('preview text does not include "× 2 sides" when Single', () => {
        renderInput({ countType: 'Timed', countMin: 30, sides: 'single' });
        expect(screen.getByText('30 sec')).toBeTruthy();
        expect(screen.queryByText(/× 2 sides/)).toBeNull();
    });

    it('preview text does not include "× 2 sides" when sides is null (default single)', () => {
        renderInput({ countType: 'Timed', countMin: 30, sides: null });
        expect(screen.queryByText(/× 2 sides/)).toBeNull();
    });
});

// ─── Single / Two Sides — forceTimed ─────────────────────────────────────────

describe('ExerciseCountInput — Single/Two Sides with forceTimed', () => {
    it('renders Single/Two Sides buttons when forceTimed=true', () => {
        renderInput({ countType: 'Timed', sides: null }, { forceTimed: true });
        expect(screen.getByTestId('sides-single')).toBeTruthy();
        expect(screen.getByTestId('sides-two')).toBeTruthy();
    });

    it('shows restBetweenSides input when forceTimed=true and sides="two"', () => {
        renderInput({ countType: null, sides: 'two' }, { forceTimed: true });
        expect(screen.getByTestId('rest-between-sides-input')).toBeTruthy();
    });
});

// ─── Single / Two Sides — Reps / AMRAP (should NOT show) ─────────────────────

describe('ExerciseCountInput — no sides toggle for non-Timed', () => {
    it('does not render sides toggle for Reps exercise', () => {
        renderInput({ countType: 'Reps', countMin: 8 });
        expect(screen.queryByTestId('sides-single')).toBeNull();
        expect(screen.queryByTestId('sides-two')).toBeNull();
    });

    it('does not render sides toggle for AMRAP exercise', () => {
        renderInput({ countType: 'AMRAP', timeCapSeconds: null });
        expect(screen.queryByTestId('sides-single')).toBeNull();
        expect(screen.queryByTestId('sides-two')).toBeNull();
    });
});
