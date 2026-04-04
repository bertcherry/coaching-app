/**
 * AuthContext.test.js
 * Location: <your-app-repo>/__tests__/context/AuthContext.test.js
 *
 * Run with: npx jest
 * Requires:
 *   npm install --save-dev jest @testing-library/react-native @testing-library/react-hooks
 *                            jest-expo expo-secure-store
 *
 * In package.json set: "jest": { "preset": "jest-expo" }
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { AuthProvider, useAuth } from '../../context/AuthContext'; // adjust path

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

// Build a minimal valid JWT (not cryptographically signed — fine for unit tests)
function makeJWT(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 900; // 15 min from now

const ACCESS_TOKEN_CLIENT = makeJWT({
  sub: 'client-uuid-1', fname: 'Jane', lname: 'Doe',
  isCoach: false, unitDefault: 'imperial', exp: FUTURE_EXP,
});

const ACCESS_TOKEN_COACH = makeJWT({
  sub: 'coach-uuid-1', fname: 'Bob', lname: 'Smith',
  isCoach: true, unitDefault: 'imperial', exp: FUTURE_EXP,
});

const REFRESH_TOKEN = 'fake-refresh-token-uuid';

global.fetch = jest.fn();

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.getItemAsync.mockResolvedValue(null);
  SecureStore.setItemAsync.mockResolvedValue(null);
  SecureStore.deleteItemAsync.mockResolvedValue(null);
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('AuthContext — initial state', () => {
  it('user is null and loading is false when no stored token', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('restores session from stored refresh token on mount', async () => {
    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT }),
    });

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    expect(result.current.user).not.toBeNull();
    expect(result.current.user.fname).toBe('Jane');
    expect(result.current.loading).toBe(false);
  });

  it('clears stored token and sets user null if refresh fails on mount', async () => {
    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
    global.fetch.mockResolvedValueOnce({ ok: false });

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    expect(result.current.user).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });
});

// ─── signIn ───────────────────────────────────────────────────────────────────

describe('AuthContext — signIn', () => {
  async function renderAndWait() {
    const hook = renderHook(() => useAuth(), { wrapper });
    await hook.waitForNextUpdate();
    return hook;
  }

  it('calls login endpoint with email and password', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }),
    });

    const { result, waitForNextUpdate } = await renderAndWait();
    await act(async () => {
      await result.current.signIn('jane@example.com', 'password123');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'jane@example.com', password: 'password123' }),
      }),
    );
  });

  it('sets user after successful sign in', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }),
    });

    const { result, waitForNextUpdate } = await renderAndWait();
    await act(async () => {
      await result.current.signIn('jane@example.com', 'password123');
    });

    expect(result.current.user).not.toBeNull();
    expect(result.current.user.sub).toBe('client-uuid-1');
    expect(result.current.user.isCoach).toBe(false);
  });

  it('stores refresh token in SecureStore on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }),
    });

    const { result, waitForNextUpdate } = await renderAndWait();
    await act(async () => {
      await result.current.signIn('jane@example.com', 'password123');
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', REFRESH_TOKEN);
  });

  it('throws on failed login (wrong credentials)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    const { result, waitForNextUpdate } = await renderAndWait();
    await expect(
      act(async () => result.current.signIn('jane@example.com', 'wrongpassword'))
    ).rejects.toThrow('Invalid credentials');
  });

  it('user.isCoach is true for coach accounts', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_COACH, refreshToken: REFRESH_TOKEN }),
    });

    const { result, waitForNextUpdate } = await renderAndWait();
    await act(async () => {
      await result.current.signIn('coach@example.com', 'password123');
    });

    expect(result.current.user.isCoach).toBe(true);
  });
});

// ─── signOut ──────────────────────────────────────────────────────────────────

describe('AuthContext — signOut', () => {
  it('calls logout endpoint with stored refresh token', async () => {
    // First, sign in
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // logout endpoint

    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    await act(async () => {
      await result.current.signIn('jane@example.com', 'password123');
    });
    await act(async () => {
      await result.current.signOut();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clears user after sign out', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    await act(async () => { await result.current.signIn('jane@example.com', 'password123'); });
    await act(async () => { await result.current.signOut(); });

    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it('deletes refreshToken from SecureStore on sign out', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    await act(async () => { await result.current.signIn('jane@example.com', 'password123'); });
    await act(async () => { await result.current.signOut(); });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });

  it('still clears user even if logout endpoint fails', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }) })
      .mockRejectedValueOnce(new Error('Network error'));

    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), { wrapper });
    await waitForNextUpdate();

    await act(async () => { await result.current.signIn('jane@example.com', 'password123'); });
    await act(async () => { await result.current.signOut(); });

    expect(result.current.user).toBeNull();
  });
});

// ─── authFetch ────────────────────────────────────────────────────────────────

describe('AuthContext — authFetch', () => {
  async function signedInHook(token = ACCESS_TOKEN_CLIENT) {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: token, refreshToken: REFRESH_TOKEN }),
    });
    const hook = renderHook(() => useAuth(), { wrapper });
    await hook.waitForNextUpdate();
    await act(async () => {
      await hook.result.current.signIn('jane@example.com', 'password123');
    });
    return hook;
  }

  it('attaches Authorization header to requests', async () => {
    const { result } = await signedInHook();

    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    await act(async () => {
      await result.current.authFetch('https://api.example.com/data');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer ') }),
      }),
    );
  });

  it('retries with new token when 401 received and refresh succeeds', async () => {
    const { result } = await signedInHook();

    const newAccessToken = makeJWT({ sub: 'client-uuid-1', fname: 'Jane', lname: 'Doe', isCoach: false, unitDefault: 'imperial', exp: FUTURE_EXP });

    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })                                        // original request 401s
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: newAccessToken }) }) // refresh
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });    // retry

    let response;
    await act(async () => {
      response = await result.current.authFetch('https://api.example.com/data');
    });

    expect(global.fetch).toHaveBeenCalledTimes(4); // sign-in + 3 above
    expect(response.status).toBe(200);
  });

  it('signs out when 401 received and refresh also fails', async () => {
    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
    const { result } = await signedInHook();

    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 }); // refresh fails too

    await act(async () => {
      await result.current.authFetch('https://api.example.com/data');
    });

    expect(result.current.user).toBeNull();
  });

  it('merges caller-provided headers with Authorization', async () => {
    const { result } = await signedInHook();

    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    await act(async () => {
      await result.current.authFetch('https://api.example.com/data', {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: expect.stringContaining('Bearer '),
        }),
      }),
    );
  });
});