/**
 * AuthContext.test.js
 * Location: tests/context/AuthContext.test.js
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../context/AuthContext';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

function makeJWT(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 900;

const ACCESS_TOKEN_CLIENT = makeJWT({
  sub: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe',
  isCoach: false, unitDefault: 'imperial', exp: FUTURE_EXP,
});

const ACCESS_TOKEN_COACH = makeJWT({
  sub: 'coach-uuid-1', email: 'coach@example.com', fname: 'Bob', lname: 'Smith',
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render hook and wait for initial loading to finish (no stored token by default). */
async function renderReady() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

/** Render hook, then sign in. Mocks are added in correct queue order. */
async function signedInHook(token = ACCESS_TOKEN_CLIENT) {
  const hook = await renderReady();
  // Add signIn mock AFTER initial render so no other fetch consumes it first
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ accessToken: token, refreshToken: REFRESH_TOKEN }),
  });
  await act(async () => {
    await hook.result.current.signIn('jane@example.com', 'password123');
  });
  // Simulate SecureStore retaining the refresh token
  SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
  return hook;
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('AuthContext — initial state', () => {
  it('user is null and loading is false when no stored token', async () => {
    const { result } = await renderReady();
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('restores session from stored refresh token on mount', async () => {
    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT }),
    });

    const { result } = await renderReady();
    expect(result.current.user).not.toBeNull();
    expect(result.current.user.fname).toBe('Jane');
    expect(result.current.loading).toBe(false);
  });

  it('clears stored token and sets user null if refresh fails on mount', async () => {
    SecureStore.getItemAsync.mockResolvedValue(REFRESH_TOKEN);
    global.fetch.mockResolvedValueOnce({ ok: false });

    const { result } = await renderReady();
    expect(result.current.user).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });
});

// ─── signIn ───────────────────────────────────────────────────────────────────

describe('AuthContext — signIn', () => {
  it('calls login endpoint with email, password, and timezone', async () => {
    const { result } = await renderReady();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: ACCESS_TOKEN_CLIENT, refreshToken: REFRESH_TOKEN }),
    });

    await act(async () => {
      await result.current.signIn('jane@example.com', 'password123');
    });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.email).toBe('jane@example.com');
    expect(body.password).toBe('password123');
    expect(typeof body.timezone).toBe('string');
  });

  it('sets user after successful sign in', async () => {
    const { result } = await signedInHook();
    expect(result.current.user).not.toBeNull();
    expect(result.current.user.sub).toBe('client-uuid-1');
    expect(result.current.user.isCoach).toBe(false);
  });

  it('stores refresh token in SecureStore on success', async () => {
    await signedInHook();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', REFRESH_TOKEN);
  });

  it('throws on failed login (wrong credentials)', async () => {
    const { result } = await renderReady();
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    await expect(
      act(async () => result.current.signIn('jane@example.com', 'wrongpassword'))
    ).rejects.toThrow('Invalid credentials');
  });

  it('user.isCoach is true for coach accounts', async () => {
    const { result } = await signedInHook(ACCESS_TOKEN_COACH);
    expect(result.current.user.isCoach).toBe(true);
  });
});

// ─── signOut ──────────────────────────────────────────────────────────────────

describe('AuthContext — signOut', () => {
  it('calls logout endpoint with stored refresh token', async () => {
    const { result } = await signedInHook();
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await act(async () => { await result.current.signOut(); });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clears user after sign out', async () => {
    const { result } = await signedInHook();
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await act(async () => { await result.current.signOut(); });

    expect(result.current.user).toBeNull();
  });

  it('deletes refreshToken from SecureStore on sign out', async () => {
    const { result } = await signedInHook();
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await act(async () => { await result.current.signOut(); });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });

  it('still clears user even if logout endpoint fails', async () => {
    const { result } = await signedInHook();
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    // signOut uses try/finally: error propagates but finally still clears state
    await act(async () => {
      try { await result.current.signOut(); } catch {}
    });

    expect(result.current.user).toBeNull();
  });
});

// ─── authFetch ────────────────────────────────────────────────────────────────

describe('AuthContext — authFetch', () => {
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
    const newAccessToken = makeJWT({
      sub: 'client-uuid-1', fname: 'Jane', lname: 'Doe',
      isCoach: false, unitDefault: 'imperial', exp: FUTURE_EXP,
    });

    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: newAccessToken }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });

    let response;
    await act(async () => {
      response = await result.current.authFetch('https://api.example.com/data');
    });

    // signIn (1) + 3 authFetch calls = 4 total
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(response.status).toBe(200);
  });

  it('signs out when 401 received and refresh also fails', async () => {
    const { result } = await signedInHook();

    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 });

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
