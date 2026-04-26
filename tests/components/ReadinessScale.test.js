import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ReadinessScale from '../../components/ReadinessScale';

const mockTheme = {
    textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#666',
    surfaceBorder: '#333',
};

jest.mock('../../context/ThemeContext', () => ({
    useTheme: () => ({ theme: mockTheme }),
}));

describe('ReadinessScale', () => {
    const defaultProps = {
        question: 'How well did you sleep?',
        lowLabel: 'Restless',
        highLabel: 'Refreshed',
        value: null,
        onChange: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('renders the question text', () => {
        render(<ReadinessScale {...defaultProps} />);
        expect(screen.getByText('How well did you sleep?')).toBeTruthy();
    });

    it('renders low and high anchor labels', () => {
        render(<ReadinessScale {...defaultProps} />);
        expect(screen.getByText('Restless')).toBeTruthy();
        expect(screen.getByText('Refreshed')).toBeTruthy();
    });

    it('renders 5 radio buttons', () => {
        render(<ReadinessScale {...defaultProps} />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(5);
    });

    it('calls onChange with the correct value when a node is pressed', () => {
        const onChange = jest.fn();
        render(<ReadinessScale {...defaultProps} onChange={onChange} />);
        const radios = screen.getAllByRole('radio');
        fireEvent.press(radios[2]); // 3rd node = value 3
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it('marks the selected radio as checked', () => {
        render(<ReadinessScale {...defaultProps} value={4} />);
        const radios = screen.getAllByRole('radio');
        expect(radios[3].props.accessibilityState.checked).toBe(true);
        expect(radios[0].props.accessibilityState.checked).toBe(false);
    });

    it('renders tick labels 1 through 5', () => {
        render(<ReadinessScale {...defaultProps} />);
        for (let i = 1; i <= 5; i++) {
            expect(screen.getByText(String(i))).toBeTruthy();
        }
    });

    it('calls onChange with 1 when the first node is pressed', () => {
        const onChange = jest.fn();
        render(<ReadinessScale {...defaultProps} onChange={onChange} />);
        fireEvent.press(screen.getAllByRole('radio')[0]);
        expect(onChange).toHaveBeenCalledWith(1);
    });

    it('calls onChange with 5 when the last node is pressed', () => {
        const onChange = jest.fn();
        render(<ReadinessScale {...defaultProps} onChange={onChange} />);
        fireEvent.press(screen.getAllByRole('radio')[4]);
        expect(onChange).toHaveBeenCalledWith(5);
    });
});
