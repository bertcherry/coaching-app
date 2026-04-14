/**
 * NotificationsContext.test.js
 * Run with: npm test
 */

import React from 'react';
import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { NotificationsProvider, useNotifications } from '../../context/NotificationsContext';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// expo-notifications: mock all APIs.
// setNotificationHandler runs at module-load time in the context file, so the
// factory must be entirely self-contained (no closure over outer variables).
jest.mock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getExpoPushTokenAsync: jest.fn(),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Access the mocked functions via require (works after jest.mock hoisting)
const Notifications = require('expo-notifications');
const mockAddNotificationReceivedListener = Notifications.addNotificationReceivedListener;
const mockGetPermissionsAsync             = Notifications.getPermissionsAsync;
const mockRequestPermissionsAsync         = Notifications.requestPermissionsAsync;
const mockGetExpoPushTokenAsync           = Notifications.getExpoPushTokenAsync;

// AppState: capture the listener so tests can fire foreground events
let appStateListener = null;
const mockAppStateAddEventListener = jest.fn((event, cb) => {
    if (event === 'change') appStateListener = cb;
    return { remove: jest.fn() };
});
jest.spyOn(AppState, 'addEventListener').mockImplementation(mockAppStateAddEventListener);

// AuthContext: controlled per-test via mockAuthState
const mockAuthFetch = jest.fn();
let mockAuthState = { user: null, authFetch: mockAuthFetch };
jest.mock('../../context/AuthContext', () => ({
    useAuth: () => mockAuthState,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(user = null) {
    mockAuthState = { user, authFetch: mockAuthFetch };
    return ({ children }) => <NotificationsProvider>{children}</NotificationsProvider>;
}

const CLIENT_USER = { sub: 'client@example.com', email: 'client@example.com', isCoach: false };
const COACH_USER  = { sub: 'coach@example.com',  email: 'coach@example.com',  isCoach: true  };

function mockUnreadResponse(overrides = {}) {
    mockAuthFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
            totalUnread: 2,
            unreadWorkoutIds: ['sw-1', 'sw-2'],
            unreadClientEmails: [],
            ...overrides,
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test123]' });
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({
        totalUnread: 0, unreadWorkoutIds: [], unreadClientEmails: [],
    }) });
});

// ─── Initial state when logged out ───────────────────────────────────────────

describe('NotificationsContext — logged out', () => {
    it('starts with zero unread and empty sets when user is null', async () => {
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(null) });
        await waitFor(() => expect(result.current).not.toBeNull());
        expect(result.current.totalUnread).toBe(0);
        expect(result.current.unreadWorkoutIds.size).toBe(0);
        expect(result.current.unreadClientEmails.size).toBe(0);
    });

    it('does not call authFetch when user is null', async () => {
        renderHook(() => useNotifications(), { wrapper: makeWrapper(null) });
        await waitFor(() => {});
        expect(mockAuthFetch).not.toHaveBeenCalled();
    });
});

// ─── fetchUnread ──────────────────────────────────────────────────────────────

describe('NotificationsContext — fetchUnread', () => {
    it('calls /notifications/unread after sign-in', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => {
            expect(mockAuthFetch).toHaveBeenCalledWith(
                expect.stringContaining('/notifications/unread'),
            );
        });
    });

    it('populates unreadWorkoutIds from the response', async () => {
        mockUnreadResponse({ totalUnread: 2, unreadWorkoutIds: ['sw-1', 'sw-2'] });
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(result.current.unreadWorkoutIds.size).toBe(2));
        expect(result.current.unreadWorkoutIds.has('sw-1')).toBe(true);
        expect(result.current.unreadWorkoutIds.has('sw-2')).toBe(true);
    });

    it('sets totalUnread correctly', async () => {
        mockUnreadResponse({ totalUnread: 3, unreadWorkoutIds: ['a', 'b', 'c'] });
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(result.current.totalUnread).toBe(3));
    });

    it('populates unreadClientEmails for coaches', async () => {
        mockUnreadResponse({
            totalUnread: 1,
            unreadWorkoutIds: ['sw-1'],
            unreadClientEmails: ['client@example.com'],
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(COACH_USER) });
        await waitFor(() => expect(result.current.unreadClientEmails.size).toBe(1));
        expect(result.current.unreadClientEmails.has('client@example.com')).toBe(true);
    });

    it('defaults unreadClientEmails to empty set when API omits the field', async () => {
        mockAuthFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ totalUnread: 1, unreadWorkoutIds: ['sw-1'] }), // no unreadClientEmails key
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(result.current.totalUnread).toBe(1));
        expect(result.current.unreadClientEmails.size).toBe(0);
    });

    it('does not throw when the API call fails', async () => {
        mockAuthFetch.mockRejectedValue(new Error('Network error'));
        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => {}); // let effects settle
        // State should remain at defaults — no crash
        expect(result.current.totalUnread).toBe(0);
    });

    it('clears state immediately when user signs out', async () => {
        mockUnreadResponse({ totalUnread: 2, unreadWorkoutIds: ['sw-1', 'sw-2'] });

        // Start signed in
        const { result, rerender } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(result.current.totalUnread).toBe(2));

        // Sign out — change mockAuthState to null user and rerender
        mockAuthState = { user: null, authFetch: mockAuthFetch };
        rerender({});

        await waitFor(() => {
            expect(result.current.totalUnread).toBe(0);
            expect(result.current.unreadWorkoutIds.size).toBe(0);
            expect(result.current.unreadClientEmails.size).toBe(0);
        });
    });
});

// ─── App foreground refetch ───────────────────────────────────────────────────

// Count only calls to /notifications/unread (excludes push-token registration)
function unreadCallCount() {
    return mockAuthFetch.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/notifications/unread'),
    ).length;
}

describe('NotificationsContext — app foreground refetch', () => {
    it('refetches unread when app returns to foreground', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(unreadCallCount()).toBe(1));

        mockUnreadResponse({ totalUnread: 5, unreadWorkoutIds: ['a', 'b', 'c', 'd', 'e'] });

        act(() => {
            appStateListener?.('active');
        });

        await waitFor(() => expect(unreadCallCount()).toBe(2));
    });

    it('does not refetch when app goes to background (inactive/background state)', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(unreadCallCount()).toBe(1));

        act(() => {
            appStateListener?.('background');
            appStateListener?.('inactive');
        });

        // Should still be 1 — only 'active' triggers a refetch
        await waitFor(() => expect(unreadCallCount()).toBe(1));
    });

    it('does not refetch on foreground when user is null', async () => {
        renderHook(() => useNotifications(), { wrapper: makeWrapper(null) });
        await waitFor(() => {});

        act(() => { appStateListener?.('active'); });

        await waitFor(() => expect(mockAuthFetch).not.toHaveBeenCalled());
    });
});

// ─── Push notification received listener ──────────────────────────────────────

describe('NotificationsContext — incoming push notification', () => {
    it('refetches unread when a foreground notification is received', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(unreadCallCount()).toBe(1));

        // Grab the callback that was registered with addNotificationReceivedListener
        const notifCallback = mockAddNotificationReceivedListener.mock.calls[0]?.[0];
        expect(notifCallback).toBeDefined();

        mockUnreadResponse({ totalUnread: 1, unreadWorkoutIds: ['sw-new'] });
        act(() => { notifCallback({ request: { content: { data: {} } } }); });

        await waitFor(() => expect(unreadCallCount()).toBe(2));
    });
});

// ─── Push token registration ──────────────────────────────────────────────────

describe('NotificationsContext — push token registration', () => {
    it('registers push token after sign-in', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });

        await waitFor(() => {
            const tokenCalls = mockAuthFetch.mock.calls.filter(([url]) =>
                typeof url === 'string' && url.includes('/notifications/push-token'),
            );
            expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('sends the token string and platform in the request body', async () => {
        mockUnreadResponse();
        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });

        await waitFor(() => {
            const tokenCall = mockAuthFetch.mock.calls.find(([url]) =>
                typeof url === 'string' && url.includes('/notifications/push-token'),
            );
            expect(tokenCall).toBeDefined();
            const body = JSON.parse(tokenCall[1].body);
            expect(body.token).toBe('ExponentPushToken[test123]');
            expect(body.platform).toBeDefined();
        });
    });

    it('does not register token when permission is denied', async () => {
        mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
        mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
        mockUnreadResponse();

        renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => {});

        const tokenCalls = mockAuthFetch.mock.calls.filter(([url]) =>
            typeof url === 'string' && url.includes('/notifications/push-token'),
        );
        expect(tokenCalls).toHaveLength(0);
    });

    it('does not register token when user is null', async () => {
        renderHook(() => useNotifications(), { wrapper: makeWrapper(null) });
        await waitFor(() => {});

        const tokenCalls = mockAuthFetch.mock.calls.filter(([url]) =>
            typeof url === 'string' && url.includes('/notifications/push-token'),
        );
        expect(tokenCalls).toHaveLength(0);
    });
});

// ─── markRead ─────────────────────────────────────────────────────────────────

describe('NotificationsContext — markRead', () => {
    async function renderSignedIn() {
        mockAuthFetch
            .mockResolvedValueOnce({ // initial fetchUnread
                ok: true,
                json: async () => ({
                    totalUnread: 2,
                    unreadWorkoutIds: ['sw-1', 'sw-2'],
                    unreadClientEmails: [],
                }),
            })
            .mockResolvedValue({ // subsequent calls (PATCH + refetch)
                ok: true,
                json: async () => ({
                    totalUnread: 1,
                    unreadWorkoutIds: ['sw-2'],
                    unreadClientEmails: [],
                }),
            });

        const hook = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(hook.result.current.unreadWorkoutIds.size).toBe(2));
        return hook;
    }

    it('optimistically removes the workout ID from unreadWorkoutIds', async () => {
        const { result } = await renderSignedIn();

        act(() => { result.current.markRead('sw-1'); });

        // Optimistic update happens synchronously
        expect(result.current.unreadWorkoutIds.has('sw-1')).toBe(false);
        expect(result.current.unreadWorkoutIds.has('sw-2')).toBe(true);
    });

    it('calls PATCH /notifications/read with the workout ID', async () => {
        const { result } = await renderSignedIn();

        await act(async () => { await result.current.markRead('sw-1'); });

        const patchCall = mockAuthFetch.mock.calls.find(([url, opts]) =>
            typeof url === 'string' &&
            url.includes('/notifications/read') &&
            opts?.method === 'PATCH',
        );
        expect(patchCall).toBeDefined();
        expect(JSON.parse(patchCall[1].body).scheduledWorkoutId).toBe('sw-1');
    });

    it('refetches unread after marking read to sync totalUnread', async () => {
        const { result } = await renderSignedIn();
        const callsBefore = mockAuthFetch.mock.calls.length;

        await act(async () => { await result.current.markRead('sw-1'); });

        // Should have called authFetch at least once more (the PATCH + the refetch)
        expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('is a no-op when called with a falsy ID', async () => {
        const { result } = await renderSignedIn();
        const callsBefore = mockAuthFetch.mock.calls.length;

        act(() => { result.current.markRead(null); });
        act(() => { result.current.markRead(''); });

        // No additional API calls
        expect(mockAuthFetch.mock.calls.length).toBe(callsBefore);
    });

    it('does not crash when the PATCH call fails', async () => {
        mockAuthFetch
            .mockResolvedValueOnce({ // initial fetchUnread
                ok: true,
                json: async () => ({ totalUnread: 1, unreadWorkoutIds: ['sw-1'], unreadClientEmails: [] }),
            })
            .mockRejectedValueOnce(new Error('Network error')); // PATCH fails

        const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper(CLIENT_USER) });
        await waitFor(() => expect(result.current.unreadWorkoutIds.size).toBe(1));

        await act(async () => { await result.current.markRead('sw-1'); });

        // Optimistic update still applied — no crash
        expect(result.current.unreadWorkoutIds.has('sw-1')).toBe(false);
    });
});
