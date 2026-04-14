/**
 * RootNavigator.test.js
 * Location: <your-app-repo>/__tests__/navigation/RootNavigator.test.js
 *
 * Tests that the correct navigation stack is shown based on auth state
 * and the isCoach flag in the JWT payload.
 *
 * Run with: npx jest
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Stub navigators so we only test routing logic, not full screens ───────────
// jest.mock factory must not reference outer-scope variables (Jest 30); use require() inside.
jest.mock('../../../screens/navigation/SignInNavigation', () => {
    const { Text } = require('react-native');
    return () => <Text testID="sign-in-nav">SignIn</Text>;
});
jest.mock('../../../screens/navigation/CoachNavigation', () => {
    const { Text } = require('react-native');
    return () => <Text testID="coach-nav">Coach</Text>;
});
jest.mock('../../../screens/navigation/ClientNavigation', () => {
    const { Text } = require('react-native');
    return () => <Text testID="client-nav">Client</Text>;
});

// ─── Auth context mock — overridden per test ──────────────────────────────────
let mockAuthState = { user: null, loading: false };
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }) => children,
}));

jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { accent: '#fba8a0' } }),
}));

jest.mock('../../../utils/WorkoutSync', () => ({
  startNetInfoSync: jest.fn(),
  stopNetInfoSync: jest.fn(),
}));

import RootNavigator from '../../../screens/navigation/RootNavigator';

describe('RootNavigator — auth gating', () => {
  it('shows sign-in stack when user is null', () => {
    mockAuthState = { user: null, loading: false };
    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('sign-in-nav')).toBeTruthy();
  });

  it('shows coach stack when user.isCoach is true', () => {
    mockAuthState = { user: { sub: 'coach-1', isCoach: true }, loading: false };
    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('coach-nav')).toBeTruthy();
  });

  it('shows client stack when user.isCoach is false', () => {
    mockAuthState = { user: { sub: 'client-1', isCoach: false }, loading: false };
    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('client-nav')).toBeTruthy();
  });

  it('shows nothing (or a loader) while loading is true', () => {
    mockAuthState = { user: null, loading: true };
    const { queryByTestId } = render(<RootNavigator />);
    expect(queryByTestId('sign-in-nav')).toBeNull();
    expect(queryByTestId('coach-nav')).toBeNull();
    expect(queryByTestId('client-nav')).toBeNull();
  });

  it('does not show client nav to coaches', () => {
    mockAuthState = { user: { sub: 'coach-1', isCoach: true }, loading: false };
    const { queryByTestId } = render(<RootNavigator />);
    expect(queryByTestId('client-nav')).toBeNull();
  });

  it('does not show coach nav to regular clients', () => {
    mockAuthState = { user: { sub: 'client-1', isCoach: false }, loading: false };
    const { queryByTestId } = render(<RootNavigator />);
    expect(queryByTestId('coach-nav')).toBeNull();
  });
});