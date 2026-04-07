/**
 * screens.auth.test.js
 * Location: <your-app-repo>/__tests__/screens/screens.auth.test.js
 *
 * Tests each auth screen's behavior: rendering, input handling,
 * navigation, and error display.
 *
 * Run with: npx jest
 * Requires: jest-expo, @testing-library/react-native
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

// ─── Navigation mock ──────────────────────────────────────────────────────────
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// ─── Auth context mock ────────────────────────────────────────────────────────
const mockSignIn = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

global.fetch = jest.fn();

import SignInScreen from '../../screens/sign-in/SignInScreen';
import SignUpScreen from '../../screens/sign-in/SignUpScreen';
import ForgotPasswordScreen from '../../screens/sign-in/ForgotPasswordScreen';
import ResetPasswordScreen from '../../screens/sign-in/ResetPasswordScreen';
import ConfirmEmailScreen from '../../screens/ConfirmEmailScreen';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── SignInScreen ─────────────────────────────────────────────────────────────

describe('SignInScreen', () => {
  it('renders email and password inputs and Sign In button', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    expect(getByPlaceholderText('email')).toBeTruthy();
    expect(getByPlaceholderText('password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('calls signIn with entered email and password', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);

    fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
    fireEvent.changeText(getByPlaceholderText('password'), 'password123');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('jane@example.com', 'password123');
    });
  });

  it('shows error alert when signIn throws', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'));
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
    fireEvent.changeText(getByPlaceholderText('password'), 'wrong');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Sign In Failed', 'Invalid credentials');
    });
  });

  it('navigates to Forgot Password when link pressed', () => {
    const { getByText } = render(<SignInScreen />);
    fireEvent.press(getByText('Forgot Password?'));
    expect(mockNavigate).toHaveBeenCalledWith('Forgot Password');
  });

  it('navigates to Sign Up when link pressed', () => {
    const { getByText } = render(<SignInScreen />);
    fireEvent.press(getByText("Don't have an account? Create one"));
    expect(mockNavigate).toHaveBeenCalledWith('Sign Up');
  });

  it('password field has secureTextEntry enabled', () => {
    const { getByPlaceholderText } = render(<SignInScreen />);
    const pwInput = getByPlaceholderText('password');
    expect(pwInput.props.secureTextEntry).toBe(true);
  });

  it('email field has email-address keyboard type', () => {
    const { getByPlaceholderText } = render(<SignInScreen />);
    const emailInput = getByPlaceholderText('email');
    expect(emailInput.props.keyboardType).toBe('email-address');
  });
});

// ─── SignUpScreen ─────────────────────────────────────────────────────────────

describe('SignUpScreen', () => {
  it('renders all input fields', () => {
    const { getByPlaceholderText } = render(<SignUpScreen />);
    expect(getByPlaceholderText('email')).toBeTruthy();
    expect(getByPlaceholderText('access code')).toBeTruthy();
    expect(getByPlaceholderText('password')).toBeTruthy();
    expect(getByPlaceholderText('confirm password')).toBeTruthy();
  });

  it('calls register API and navigates to Confirm Email on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Registered.' }) });

    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    fireEvent.changeText(getByPlaceholderText('email'), 'new@example.com');
    fireEvent.changeText(getByPlaceholderText('access code'), 'COACH123');
    fireEvent.changeText(getByPlaceholderText('password'), 'securepass');
    fireEvent.changeText(getByPlaceholderText('confirm password'), 'securepass');
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Confirm Email');
    });
  });

  it('shows alert when API returns error', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid access code' }) });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    fireEvent.changeText(getByPlaceholderText('email'), 'new@example.com');
    fireEvent.changeText(getByPlaceholderText('access code'), 'WRONGCODE');
    fireEvent.changeText(getByPlaceholderText('password'), 'securepass');
    fireEvent.changeText(getByPlaceholderText('confirm password'), 'securepass');
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Invalid access code');
    });
  });

  it('shows alert when passwords do not match', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    fireEvent.changeText(getByPlaceholderText('password'), 'pass1');
    fireEvent.changeText(getByPlaceholderText('confirm password'), 'pass2');
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('navigates back to Sign In when link pressed', () => {
    const { getByText } = render(<SignUpScreen />);
    fireEvent.press(getByText('Have an account? Sign in'));
    expect(mockNavigate).toHaveBeenCalledWith('Sign In');
  });

  it('password fields have secureTextEntry enabled', () => {
    const { getByPlaceholderText } = render(<SignUpScreen />);
    expect(getByPlaceholderText('password').props.secureTextEntry).toBe(true);
    expect(getByPlaceholderText('confirm password').props.secureTextEntry).toBe(true);
  });
});

// ─── ForgotPasswordScreen ─────────────────────────────────────────────────────

describe('ForgotPasswordScreen', () => {
  it('renders email input and Send Code button', () => {
    const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);
    expect(getByPlaceholderText('email')).toBeTruthy();
    expect(getByText('Send Code')).toBeTruthy();
  });

  it('calls forgot-password API with entered email', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'If that email exists, a code was sent.' }) });

    const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
    fireEvent.press(getByText('Send Code'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password'),
        expect.objectContaining({ body: expect.stringContaining('jane@example.com') }),
      );
    });
  });

  it('navigates to Reset Password after code sent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'ok' }) });

    const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('email'), 'jane@example.com');
    fireEvent.press(getByText('Send Code'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Reset Password');
    });
  });

  it('navigates back to Sign In when link pressed', () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    fireEvent.press(getByText('Back to sign in'));
    expect(mockNavigate).toHaveBeenCalledWith('Sign In');
  });
});

// ─── ResetPasswordScreen ──────────────────────────────────────────────────────

describe('ResetPasswordScreen', () => {
  it('renders code and new password inputs', () => {
    const { getByPlaceholderText } = render(<ResetPasswordScreen />);
    expect(getByPlaceholderText('code')).toBeTruthy();
    expect(getByPlaceholderText('new password')).toBeTruthy();
  });

  it('calls reset-password API with code and new password', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Password updated.' }) });

    const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('code'), '123456');
    fireEvent.changeText(getByPlaceholderText('new password'), 'newpassword');
    fireEvent.press(getByText('Set Password'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/reset-password'),
        expect.objectContaining({
          body: expect.stringContaining('123456'),
        }),
      );
    });
  });

  it('navigates to Welcome after successful reset', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Password updated.' }) });

    const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('code'), '123456');
    fireEvent.changeText(getByPlaceholderText('new password'), 'newpassword');
    fireEvent.press(getByText('Set Password'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Welcome');
    });
  });

  it('shows alert when code is invalid', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid or expired code' }) });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('code'), '000000');
    fireEvent.changeText(getByPlaceholderText('new password'), 'newpassword');
    fireEvent.press(getByText('Set Password'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Invalid or expired code');
    });
  });

  it('navigates back to Sign In when link pressed', () => {
    const { getByText } = render(<ResetPasswordScreen />);
    fireEvent.press(getByText('Back to sign in'));
    expect(mockNavigate).toHaveBeenCalledWith('Sign In');
  });
});

// ─── ConfirmEmailScreen ───────────────────────────────────────────────────────

describe('ConfirmEmailScreen', () => {
  it('renders confirmation code input and Confirm button', () => {
    const { getByPlaceholderText, getByText } = render(<ConfirmEmailScreen />);
    expect(getByPlaceholderText('confirmation code')).toBeTruthy();
    expect(getByText('Confirm')).toBeTruthy();
    expect(getByText('Resend Code')).toBeTruthy();
  });

  it('calls confirm API with entered code on Confirm press', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Confirmed' }) });

    const { getByPlaceholderText, getByText } = render(<ConfirmEmailScreen />);
    fireEvent.changeText(getByPlaceholderText('confirmation code'), '987654');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/confirm'),
        expect.objectContaining({ body: expect.stringContaining('987654') }),
      );
    });
  });

  it('navigates to Welcome after confirmation', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Confirmed' }) });

    const { getByPlaceholderText, getByText } = render(<ConfirmEmailScreen />);
    fireEvent.changeText(getByPlaceholderText('confirmation code'), '987654');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Welcome');
    });
  });

  it('shows alert when code is wrong', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid code' }) });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(<ConfirmEmailScreen />);
    fireEvent.changeText(getByPlaceholderText('confirmation code'), '000000');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  it('calls resend API when Resend Code is pressed', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Resent' }) });

    const { getByText } = render(<ConfirmEmailScreen />);
    fireEvent.press(getByText('Resend Code'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/resend-code'),
        expect.any(Object),
      );
    });
  });

  it('navigates back to Sign In when link pressed', () => {
    const { getByText } = render(<ConfirmEmailScreen />);
    fireEvent.press(getByText('Back to sign in'));
    expect(mockNavigate).toHaveBeenCalledWith('Sign In');
  });
});