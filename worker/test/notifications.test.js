/**
 * worker/test/notifications.test.js
 *
 * Tests for notification endpoints and the emitNotification helper.
 *   POST  /notifications/push-token
 *   GET   /notifications/unread
 *   PATCH /notifications/read
 *   emitNotification() (internal helper, exported for testing)
 */

/**
 * @jest-environment node
 */

import { env } from 'cloudflare:test';
import {
    emitNotification,
    handleRegisterPushToken,
    handleGetUnread,
    handleMarkRead,
} from '../src/notifications.js';
import {
    setupSchema, clearData, seedCoach, seedClient,
    coachToken, clientToken,
    post, patch, get,
    mockExternalFetch,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
    mockExternalFetch();
});
afterEach(() => jest.restoreAllMocks());

// ─── POST /notifications/push-token ──────────────────────────────────────────

describe('POST /notifications/push-token', () => {
    it('returns 401 without auth', async () => {
        const res = await handleRegisterPushToken(post('/notifications/push-token', { token: 'ExponentPushToken[abc]' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when token is missing', async () => {
        const tok = await clientToken();
        const res = await handleRegisterPushToken(post('/notifications/push-token', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('inserts a new push token and returns 200', async () => {
        const tok = await clientToken();
        const res = await handleRegisterPushToken(post('/notifications/push-token', { token: 'ExponentPushToken[abc123]', platform: 'ios' }, tok), env);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT * FROM push_tokens WHERE token = ?').bind('ExponentPushToken[abc123]').first();
        expect(row.userEmail).toBe('client@example.com');
        expect(row.platform).toBe('ios');
    });

    it('upserts when the same token is re-registered', async () => {
        const tok = await clientToken();
        await handleRegisterPushToken(post('/notifications/push-token', { token: 'ExponentPushToken[abc123]' }, tok), env);
        await handleRegisterPushToken(post('/notifications/push-token', { token: 'ExponentPushToken[abc123]' }, tok), env);
        const { results } = await env.DB.prepare('SELECT * FROM push_tokens WHERE token = ?').bind('ExponentPushToken[abc123]').all();
        expect(results).toHaveLength(1);
    });

    it('updates userEmail when an existing token is claimed by a new user', async () => {
        const clientTok = await clientToken();
        const coachTok = await coachToken();
        await handleRegisterPushToken(post('/notifications/push-token', { token: 'shared-device-token' }, clientTok), env);
        await handleRegisterPushToken(post('/notifications/push-token', { token: 'shared-device-token' }, coachTok), env);
        const row = await env.DB.prepare('SELECT userEmail FROM push_tokens WHERE token = ?').bind('shared-device-token').first();
        expect(row.userEmail).toBe('coach@example.com');
    });
});

// ─── GET /notifications/unread ────────────────────────────────────────────────

describe('GET /notifications/unread', () => {
    it('returns 401 without auth', async () => {
        const res = await handleGetUnread(get('/notifications/unread'), env);
        expect(res.status).toBe(401);
    });

    it('returns empty arrays and zero total when no events', async () => {
        const tok = await clientToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.totalUnread).toBe(0);
        expect(body.unreadWorkoutIds).toHaveLength(0);
        expect(body.unreadClientEmails).toHaveLength(0);
    });

    it('returns unread workout IDs for the authenticated user', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev1', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now'))`
        ).run();
        const tok = await clientToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        const body = await res.json();
        expect(body.totalUnread).toBe(1);
        expect(body.unreadWorkoutIds).toContain('sw-1');
    });

    it('does not include events from other users', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev1', 'coach@example.com', 'new_workout', 'sw-1', '{}', datetime('now'))`
        ).run();
        const tok = await clientToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        const body = await res.json();
        expect(body.totalUnread).toBe(0);
    });

    it('does not include already-read events', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt, readAt)
             VALUES ('ev1', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now'), datetime('now'))`
        ).run();
        const tok = await clientToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        const body = await res.json();
        expect(body.totalUnread).toBe(0);
    });

    it('coach receives unreadClientEmails from payload', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev1', 'coach@example.com', 'workout_completed', 'sw-1',
                     '{"clientEmail":"client@example.com"}', datetime('now'))`
        ).run();
        const tok = await coachToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        const body = await res.json();
        expect(body.unreadClientEmails).toContain('client@example.com');
    });

    it('deduplicates workout IDs when multiple events share one workout', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev1', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now')),
                    ('ev2', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now'))`
        ).run();
        const tok = await clientToken();
        const res = await handleGetUnread(get('/notifications/unread', tok), env);
        const body = await res.json();
        expect(body.unreadWorkoutIds).toHaveLength(1);
        expect(body.totalUnread).toBe(2); // count is raw, IDs are deduped
    });
});

// ─── PATCH /notifications/read ────────────────────────────────────────────────

describe('PATCH /notifications/read', () => {
    beforeEach(async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev1', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now')),
                    ('ev2', 'client@example.com', 'new_workout', 'sw-1', '{}', datetime('now'))`
        ).run();
    });

    it('returns 401 without auth', async () => {
        const res = await handleMarkRead(patch('/notifications/read', { scheduledWorkoutId: 'sw-1' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when scheduledWorkoutId is missing', async () => {
        const tok = await clientToken();
        const res = await handleMarkRead(patch('/notifications/read', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('marks all matching unread events as read', async () => {
        const tok = await clientToken();
        await handleMarkRead(patch('/notifications/read', { scheduledWorkoutId: 'sw-1' }, tok), env);
        const { results } = await env.DB.prepare(
            `SELECT * FROM notification_events WHERE scheduledWorkoutId = ? AND readAt IS NULL`
        ).bind('sw-1').all();
        expect(results).toHaveLength(0);
    });

    it('does not mark events belonging to another user', async () => {
        await env.DB.prepare(
            `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
             VALUES ('ev3', 'coach@example.com', 'new_workout', 'sw-1', '{}', datetime('now'))`
        ).run();
        const tok = await clientToken();
        await handleMarkRead(patch('/notifications/read', { scheduledWorkoutId: 'sw-1' }, tok), env);
        const row = await env.DB.prepare(
            `SELECT readAt FROM notification_events WHERE id = 'ev3'`
        ).first();
        expect(row.readAt).toBeNull();
    });
});

// ─── emitNotification ─────────────────────────────────────────────────────────

describe('emitNotification', () => {
    it('inserts a notification_events row', async () => {
        await emitNotification(env.DB, env, {
            recipientEmail: 'client@example.com',
            type: 'new_workout',
            scheduledWorkoutId: 'sw-test',
            payload: { workoutName: 'Legs', scheduledDate: '2099-12-25', coachName: 'Test Coach' },
        });
        const row = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE scheduledWorkoutId = ?'
        ).bind('sw-test').first();
        expect(row).not.toBeNull();
        expect(row.type).toBe('new_workout');
        expect(row.readAt).toBeNull();
    });

    it('always inserts the event row even when push is disabled for the type', async () => {
        // Disable push for new_workout
        await env.DB.prepare('UPDATE clients SET notificationSettings = ? WHERE email = ?')
            .bind(JSON.stringify({ new_workout: { push: false, badge: true } }), 'client@example.com').run();

        await emitNotification(env.DB, env, {
            recipientEmail: 'client@example.com',
            type: 'new_workout',
            scheduledWorkoutId: 'sw-test',
            payload: { workoutName: 'Legs', coachName: 'Coach' },
        });

        const { results } = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE recipientEmail = ?'
        ).bind('client@example.com').all();
        expect(results).toHaveLength(1);
    });

    it('does not attempt push when user has no registered tokens', async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch');
        await emitNotification(env.DB, env, {
            recipientEmail: 'client@example.com',
            type: 'new_workout',
            scheduledWorkoutId: 'sw-test',
            payload: { workoutName: 'Legs', coachName: 'Coach' },
        });
        // fetch should not have been called for push (no tokens)
        const pushCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('exp.host'));
        expect(pushCalls).toHaveLength(0);
    });

    it('sends push when token is registered and push is enabled', async () => {
        await env.DB.prepare(
            `INSERT INTO push_tokens (id, userEmail, token, updatedAt) VALUES (?, ?, ?, datetime('now'))`
        ).bind('pt1', 'client@example.com', 'ExponentPushToken[test]').run();

        const fetchSpy = jest.spyOn(globalThis, 'fetch');
        await emitNotification(env.DB, env, {
            recipientEmail: 'client@example.com',
            type: 'new_workout',
            scheduledWorkoutId: 'sw-test',
            payload: { workoutName: 'Legs', scheduledDate: null, coachName: 'Coach' },
        });
        const pushCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('exp.host'));
        expect(pushCalls).toHaveLength(1);
    });
});
