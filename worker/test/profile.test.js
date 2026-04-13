/**
 * worker/test/profile.test.js
 *
 * Tests for all /profile/* endpoints.
 * Handlers: handleUpdateName, handleUpdateEmail, handleUpdatePassword,
 *           handleUpdateUnit, handleGetNotificationSettings,
 *           handleUpdateNotificationSettings
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
    handleUpdateName,
    handleUpdateEmail,
    handleUpdatePassword,
    handleUpdateUnit,
    handleGetNotificationSettings,
    handleUpdateNotificationSettings,
} from '../src/profile.js';
import {
    setupSchema, clearData, seedCoach, seedClient,
    makeToken, patch, get,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => { await clearData(); await seedCoach(); });

// Shared env wrapper — lets tests use real D1 + test JWT secret
const e = env;

async function token(isCoach = true) {
    return makeToken({
        sub: isCoach ? 'coach@example.com' : 'client@example.com',
        email: isCoach ? 'coach@example.com' : 'client@example.com',
        fname: 'Test', lname: isCoach ? 'Coach' : 'Client',
        isCoach, unitDefault: 'imperial',
    });
}

// ─── PATCH /profile/name ──────────────────────────────────────────────────────

describe('PATCH /profile/name', () => {
    it('returns 401 without auth', async () => {
        const res = await handleUpdateName(patch('/profile/name', { fname: 'A', lname: 'B' }), e);
        expect(res.status).toBe(401);
    });

    it('returns 400 when fname is empty', async () => {
        const tok = await token();
        const res = await handleUpdateName(patch('/profile/name', { fname: '  ', lname: 'Smith' }, tok), e);
        expect(res.status).toBe(400);
    });

    it('returns 400 when lname is missing', async () => {
        const tok = await token();
        const res = await handleUpdateName(patch('/profile/name', { fname: 'Alice' }, tok), e);
        expect(res.status).toBe(400);
    });

    it('updates name and returns 200', async () => {
        const tok = await token();
        const res = await handleUpdateName(patch('/profile/name', { fname: 'Alice', lname: 'Smith' }, tok), e);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT fname, lname FROM clients WHERE email = ?').bind('coach@example.com').first();
        expect(row.fname).toBe('Alice');
        expect(row.lname).toBe('Smith');
    });

    it('trims whitespace from name fields', async () => {
        const tok = await token();
        await handleUpdateName(patch('/profile/name', { fname: '  Alice  ', lname: '  Smith  ' }, tok), e);
        const row = await env.DB.prepare('SELECT fname, lname FROM clients WHERE email = ?').bind('coach@example.com').first();
        expect(row.fname).toBe('Alice');
        expect(row.lname).toBe('Smith');
    });
});

// ─── PATCH /profile/email ─────────────────────────────────────────────────────

describe('PATCH /profile/email', () => {
    beforeEach(async () => {
        // Seed a refresh token so we can verify it gets invalidated
        await env.DB.prepare(`INSERT INTO refresh_tokens (token, client_id, expires_at) VALUES (?, ?, ?)`)
            .bind('tok-1', 'coach@example.com', Date.now() + 86400000).run();
    });

    it('returns 401 without auth', async () => {
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'x@x.com', password: 'pw' }), e);
        expect(res.status).toBe(401);
    });

    it('returns 400 for missing fields', async () => {
        const tok = await token();
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'new@example.com' }, tok), e);
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
        const tok = await token();
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'not-an-email', password: 'testpassword' }, tok), e);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/invalid email/i);
    });

    it('returns 401 for wrong current password', async () => {
        const tok = await token();
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'new@example.com', password: 'wrongpass' }, tok), e);
        expect(res.status).toBe(401);
    });

    it('returns 409 if new email already taken', async () => {
        await seedClient();
        const tok = await token();
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'client@example.com', password: 'testpassword' }, tok), e);
        expect(res.status).toBe(409);
    });

    it('returns 200 and updates email row', async () => {
        const tok = await token();
        const res = await handleUpdateEmail(patch('/profile/email', { newEmail: 'newemail@example.com', password: 'testpassword' }, tok), e);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT email FROM clients WHERE email = ?').bind('newemail@example.com').first();
        expect(row).not.toBeNull();
    });

    it('invalidates all refresh tokens on email change', async () => {
        const tok = await token();
        await handleUpdateEmail(patch('/profile/email', { newEmail: 'newemail@example.com', password: 'testpassword' }, tok), e);
        const { results } = await env.DB.prepare('SELECT * FROM refresh_tokens WHERE client_id = ?').bind('coach@example.com').all();
        expect(results).toHaveLength(0);
    });
});

// ─── PATCH /profile/password ──────────────────────────────────────────────────

describe('PATCH /profile/password', () => {
    it('returns 401 without auth', async () => {
        const res = await handleUpdatePassword(patch('/profile/password', { currentPassword: 'a', newPassword: 'b' }), e);
        expect(res.status).toBe(401);
    });

    it('returns 400 when fields are missing', async () => {
        const tok = await token();
        const res = await handleUpdatePassword(patch('/profile/password', { currentPassword: 'testpassword' }, tok), e);
        expect(res.status).toBe(400);
    });

    it('returns 400 when new password is shorter than 8 chars', async () => {
        const tok = await token();
        const res = await handleUpdatePassword(patch('/profile/password', { currentPassword: 'testpassword', newPassword: 'short' }, tok), e);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/8 characters/i);
    });

    it('returns 401 when current password is wrong', async () => {
        const tok = await token();
        const res = await handleUpdatePassword(patch('/profile/password', { currentPassword: 'wrongpass', newPassword: 'newpassword123' }, tok), e);
        expect(res.status).toBe(401);
    });

    it('updates password and allows login with new password', async () => {
        const tok = await token();
        const res = await handleUpdatePassword(patch('/profile/password', { currentPassword: 'testpassword', newPassword: 'newpassword123' }, tok), e);
        expect(res.status).toBe(200);

        // Import worker to test login
        const worker = (await import('../src/worker.js')).default;
        const loginRes = await worker.fetch(
            new Request('https://worker.test/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'coach@example.com', password: 'newpassword123' }),
            }),
            env
        );
        expect(loginRes.status).toBe(200);
    });
});

// ─── PATCH /profile/unit ──────────────────────────────────────────────────────

describe('PATCH /profile/unit', () => {
    it('returns 401 without auth', async () => {
        const res = await handleUpdateUnit(patch('/profile/unit', { unitDefault: 'metric' }), e);
        expect(res.status).toBe(401);
    });

    it('returns 400 for invalid unit value', async () => {
        const tok = await token();
        const res = await handleUpdateUnit(patch('/profile/unit', { unitDefault: 'stones' }, tok), e);
        expect(res.status).toBe(400);
    });

    it('accepts "imperial"', async () => {
        const tok = await token();
        const res = await handleUpdateUnit(patch('/profile/unit', { unitDefault: 'imperial' }, tok), e);
        expect(res.status).toBe(200);
    });

    it('accepts "metric" and persists it', async () => {
        const tok = await token();
        await handleUpdateUnit(patch('/profile/unit', { unitDefault: 'metric' }, tok), e);
        const row = await env.DB.prepare('SELECT unitDefault FROM clients WHERE email = ?').bind('coach@example.com').first();
        expect(row.unitDefault).toBe('metric');
    });
});

// ─── GET /profile/notification-settings ──────────────────────────────────────

describe('GET /profile/notification-settings', () => {
    it('returns 401 without auth', async () => {
        const res = await handleGetNotificationSettings(get('/profile/notification-settings'), e);
        expect(res.status).toBe(401);
    });

    it('returns defaults when no settings stored', async () => {
        const tok = await token();
        const res = await handleGetNotificationSettings(get('/profile/notification-settings', tok), e);
        expect(res.status).toBe(200);
        const { settings } = await res.json();
        expect(settings.new_workout).toEqual({ push: true, badge: true });
        expect(settings.workout_completed).toEqual({ push: true, badge: true });
        expect(settings.workout_skipped).toEqual({ push: true, badge: true });
    });

    it('returns stored custom settings merged with defaults', async () => {
        const custom = { new_workout: { push: false, badge: true } };
        await env.DB.prepare('UPDATE clients SET notificationSettings = ? WHERE email = ?')
            .bind(JSON.stringify(custom), 'coach@example.com').run();
        const tok = await token();
        const res = await handleGetNotificationSettings(get('/profile/notification-settings', tok), e);
        const { settings } = await res.json();
        expect(settings.new_workout.push).toBe(false);
        // Other types still defaulted
        expect(settings.workout_completed).toEqual({ push: true, badge: true });
    });
});

// ─── PATCH /profile/notification-settings ────────────────────────────────────

describe('PATCH /profile/notification-settings', () => {
    it('returns 401 without auth', async () => {
        const res = await handleUpdateNotificationSettings(patch('/profile/notification-settings', { settings: {} }), e);
        expect(res.status).toBe(401);
    });

    it('returns 400 when settings is missing', async () => {
        const tok = await token();
        const res = await handleUpdateNotificationSettings(patch('/profile/notification-settings', {}, tok), e);
        expect(res.status).toBe(400);
    });

    it('saves valid settings', async () => {
        const tok = await token();
        const newSettings = {
            new_workout: { push: false, badge: true },
            workout_completed: { push: true, badge: false },
        };
        const res = await handleUpdateNotificationSettings(patch('/profile/notification-settings', { settings: newSettings }, tok), e);
        expect(res.status).toBe(200);

        const row = await env.DB.prepare('SELECT notificationSettings FROM clients WHERE email = ?').bind('coach@example.com').first();
        const stored = JSON.parse(row.notificationSettings);
        expect(stored.new_workout.push).toBe(false);
        expect(stored.workout_completed.badge).toBe(false);
    });

    it('silently drops unknown notification types', async () => {
        const tok = await token();
        const res = await handleUpdateNotificationSettings(patch('/profile/notification-settings', {
            settings: { unknown_type: { push: true, badge: true } }
        }, tok), e);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT notificationSettings FROM clients WHERE email = ?').bind('coach@example.com').first();
        const stored = JSON.parse(row.notificationSettings);
        expect(stored.unknown_type).toBeUndefined();
    });

    it('coerces non-boolean push/badge to true', async () => {
        const tok = await token();
        await handleUpdateNotificationSettings(patch('/profile/notification-settings', {
            settings: { new_workout: { push: 'yes', badge: 0 } }
        }, tok), e);
        const row = await env.DB.prepare('SELECT notificationSettings FROM clients WHERE email = ?').bind('coach@example.com').first();
        const stored = JSON.parse(row.notificationSettings);
        // Non-boolean values default to true
        expect(typeof stored.new_workout.push).toBe('boolean');
        expect(typeof stored.new_workout.badge).toBe('boolean');
    });
});
