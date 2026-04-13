/**
 * worker/test/Auth.test.js
 *
 * Tests for all /auth/* endpoints using real in-memory D1.
 * Handlers: handleLogin, handleRegister, handleRefresh, handleLogout,
 *           handleForgotPassword, handleResetPassword
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/worker.js';
import {
    setupSchema, clearData,
    seedCoach, seedClient, seedPendingClient,
    post,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => { await clearData(); });

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
    beforeEach(async () => { await seedCoach(); });

    it('returns 400 when fields are missing', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'coach@example.com' }), env);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/missing/i);
    });

    it('returns 401 for unknown email', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'nobody@example.com', password: 'testpassword' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 401 for wrong password', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'wrongpass' }), env);
        expect(res.status).toBe(401);
    });

    it('returns accessToken + refreshToken on valid credentials', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'testpassword' }), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(typeof body.accessToken).toBe('string');
        expect(typeof body.refreshToken).toBe('string');
    });

    it('access token payload has correct fields', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'testpassword' }), env);
        const { accessToken } = await res.json();
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        expect(payload.sub).toBe('coach@example.com');
        expect(payload.email).toBe('coach@example.com');
        expect(payload.fname).toBe('Test');
        expect(payload.isCoach).toBe(true);
        expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('email matching is case-insensitive', async () => {
        const res = await worker.fetch(post('/auth/login', { email: 'COACH@EXAMPLE.COM', password: 'testpassword' }), env);
        expect(res.status).toBe(200);
    });

    it('stores timezone when provided and valid', async () => {
        await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'testpassword', timezone: 'America/New_York' }), env);
        const row = await env.DB.prepare('SELECT timezone FROM clients WHERE email = ?').bind('coach@example.com').first();
        expect(row.timezone).toBe('America/New_York');
    });

    it('ignores invalid timezone strings', async () => {
        await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'testpassword', timezone: 'Not/A/Real/Zone' }), env);
        // Should not crash — timezone stays as default (no update)
        const res = await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'testpassword' }), env);
        expect(res.status).toBe(200);
    });

    it('isCoach is false for client accounts', async () => {
        await seedClient();
        const res = await worker.fetch(post('/auth/login', { email: 'client@example.com', password: 'testpassword' }), env);
        const { accessToken } = await res.json();
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        expect(payload.isCoach).toBe(false);
    });
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
    beforeEach(async () => {
        await seedCoach();
        await seedPendingClient({ email: 'pending@example.com', accessCode: 'TEST-1234' });
    });

    it('returns 400 when fields are missing', async () => {
        const res = await worker.fetch(post('/auth/register', { email: 'pending@example.com', password: 'pass123' }), env);
        expect(res.status).toBe(400);
    });

    it('returns 403 for wrong access code', async () => {
        const res = await worker.fetch(post('/auth/register', {
            email: 'pending@example.com', password: 'pass123',
            fname: 'New', lname: 'User', accessCode: 'WRONG-CODE',
        }), env);
        expect(res.status).toBe(403);
    });

    it('returns 403 when email does not exist', async () => {
        const res = await worker.fetch(post('/auth/register', {
            email: 'ghost@example.com', password: 'pass123',
            fname: 'Ghost', lname: 'User', accessCode: 'TEST-1234',
        }), env);
        expect(res.status).toBe(403);
    });

    it('returns 201 on valid registration', async () => {
        const res = await worker.fetch(post('/auth/register', {
            email: 'pending@example.com', password: 'securepass',
            fname: 'New', lname: 'Client', accessCode: 'TEST-1234',
        }), env);
        expect(res.status).toBe(201);
        expect((await res.json()).message).toMatch(/registered/i);
    });

    it('normalizes email to lowercase', async () => {
        await worker.fetch(post('/auth/register', {
            email: 'PENDING@EXAMPLE.COM', password: 'securepass',
            fname: 'New', lname: 'Client', accessCode: 'TEST-1234',
        }), env);
        // Login with lowercase email should succeed after register
        const loginRes = await worker.fetch(post('/auth/login', {
            email: 'pending@example.com', password: 'securepass',
        }), env);
        expect(loginRes.status).toBe(200);
    });

    it('returns 409 if account already has a password set', async () => {
        // Register once
        await worker.fetch(post('/auth/register', {
            email: 'pending@example.com', password: 'securepass',
            fname: 'New', lname: 'Client', accessCode: 'TEST-1234',
        }), env);
        // Try again
        const res = await worker.fetch(post('/auth/register', {
            email: 'pending@example.com', password: 'anotherpass',
            fname: 'New', lname: 'Client', accessCode: 'TEST-1234',
        }), env);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/already registered/i);
    });

    it('newly registered account can log in immediately', async () => {
        await worker.fetch(post('/auth/register', {
            email: 'pending@example.com', password: 'securepass',
            fname: 'New', lname: 'Client', accessCode: 'TEST-1234',
        }), env);
        const loginRes = await worker.fetch(post('/auth/login', {
            email: 'pending@example.com', password: 'securepass',
        }), env);
        expect(loginRes.status).toBe(200);
    });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
    beforeEach(async () => { await seedCoach(); });

    it('returns 400 when refreshToken is missing', async () => {
        const res = await worker.fetch(post('/auth/refresh', {}), env);
        expect(res.status).toBe(400);
    });

    it('returns 401 for unknown token', async () => {
        const res = await worker.fetch(post('/auth/refresh', { refreshToken: 'not-real' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 401 for expired token', async () => {
        await env.DB.prepare(
            `INSERT INTO refresh_tokens (token, client_id, expires_at) VALUES (?, ?, ?)`
        ).bind('expired-tok', 'coach@example.com', Date.now() - 1000).run();
        const res = await worker.fetch(post('/auth/refresh', { refreshToken: 'expired-tok' }), env);
        expect(res.status).toBe(401);
    });

    it('returns new accessToken for valid token', async () => {
        await env.DB.prepare(
            `INSERT INTO refresh_tokens (token, client_id, expires_at) VALUES (?, ?, ?)`
        ).bind('valid-tok', 'coach@example.com', Date.now() + 86400000).run();
        const res = await worker.fetch(post('/auth/refresh', { refreshToken: 'valid-tok' }), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(typeof body.accessToken).toBe('string');
        const payload = JSON.parse(atob(body.accessToken.split('.')[1]));
        expect(payload.email).toBe('coach@example.com');
    });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
    beforeEach(async () => { await seedCoach(); });

    it('returns 200 and removes the refresh token', async () => {
        await env.DB.prepare(
            `INSERT INTO refresh_tokens (token, client_id, expires_at) VALUES (?, ?, ?)`
        ).bind('del-tok', 'coach@example.com', Date.now() + 86400000).run();

        const res = await worker.fetch(post('/auth/logout', { refreshToken: 'del-tok' }), env);
        expect(res.status).toBe(200);

        // Refresh should now fail
        const refreshRes = await worker.fetch(post('/auth/refresh', { refreshToken: 'del-tok' }), env);
        expect(refreshRes.status).toBe(401);
    });

    it('returns 200 for unknown token (idempotent)', async () => {
        const res = await worker.fetch(post('/auth/logout', { refreshToken: 'ghost' }), env);
        expect(res.status).toBe(200);
    });

    it('returns 400 when token is missing', async () => {
        const res = await worker.fetch(post('/auth/logout', {}), env);
        expect(res.status).toBe(400);
    });
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
    beforeEach(async () => { await seedCoach(); });

    it('returns 200 for unknown email — no enumeration', async () => {
        const res = await worker.fetch(post('/auth/forgot-password', { email: 'nobody@example.com' }), env);
        expect(res.status).toBe(200);
        expect((await res.json()).message).toMatch(/if that email exists/i);
    });

    it('returns 200 for known email with identical message', async () => {
        const res = await worker.fetch(post('/auth/forgot-password', { email: 'coach@example.com' }), env);
        expect(res.status).toBe(200);
        expect((await res.json()).message).toMatch(/if that email exists/i);
    });

    it('stores a reset code for a known email', async () => {
        await worker.fetch(post('/auth/forgot-password', { email: 'coach@example.com' }), env);
        const row = await env.DB.prepare(`SELECT * FROM password_reset_codes WHERE client_id = ?`).bind('coach@example.com').first();
        expect(row).not.toBeNull();
        expect(row.code).toMatch(/^\d{6}$/);
        expect(row.expires_at).toBeGreaterThan(Date.now());
    });

    it('does NOT store a reset code for an unknown email', async () => {
        await worker.fetch(post('/auth/forgot-password', { email: 'nobody@example.com' }), env);
        const { results } = await env.DB.prepare(`SELECT * FROM password_reset_codes`).all();
        expect(results).toHaveLength(0);
    });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
    const FUTURE = Date.now() + 900000;
    const PAST = Date.now() - 1000;

    beforeEach(async () => { await seedCoach(); });

    it('returns 400 for missing fields', async () => {
        const res = await worker.fetch(post('/auth/reset-password', { email: 'coach@example.com', code: '123456' }), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for unknown email', async () => {
        const res = await worker.fetch(post('/auth/reset-password', {
            email: 'ghost@example.com', code: '123456', newPassword: 'newpass',
        }), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for wrong code', async () => {
        await env.DB.prepare(`INSERT INTO password_reset_codes VALUES (?, ?, ?)`).bind('coach@example.com', '999999', FUTURE).run();
        const res = await worker.fetch(post('/auth/reset-password', {
            email: 'coach@example.com', code: '000000', newPassword: 'newpass123',
        }), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for expired code', async () => {
        await env.DB.prepare(`INSERT INTO password_reset_codes VALUES (?, ?, ?)`).bind('coach@example.com', '123456', PAST).run();
        const res = await worker.fetch(post('/auth/reset-password', {
            email: 'coach@example.com', code: '123456', newPassword: 'newpass123',
        }), env);
        expect(res.status).toBe(400);
    });

    it('returns 200 and new password works on valid code', async () => {
        await env.DB.prepare(`INSERT INTO password_reset_codes VALUES (?, ?, ?)`).bind('coach@example.com', '123456', FUTURE).run();
        const res = await worker.fetch(post('/auth/reset-password', {
            email: 'coach@example.com', code: '123456', newPassword: 'brandnewpass',
        }), env);
        expect(res.status).toBe(200);
        const loginRes = await worker.fetch(post('/auth/login', { email: 'coach@example.com', password: 'brandnewpass' }), env);
        expect(loginRes.status).toBe(200);
    });

    it('reset code is deleted after use (one-time)', async () => {
        await env.DB.prepare(`INSERT INTO password_reset_codes VALUES (?, ?, ?)`).bind('coach@example.com', '123456', FUTURE).run();
        await worker.fetch(post('/auth/reset-password', {
            email: 'coach@example.com', code: '123456', newPassword: 'brandnewpass',
        }), env);
        const res2 = await worker.fetch(post('/auth/reset-password', {
            email: 'coach@example.com', code: '123456', newPassword: 'anotherpass',
        }), env);
        expect(res2.status).toBe(400);
    });
});
