/**
 * worker/test/coach.test.js
 *
 * Tests for coach management endpoints.
 *   POST /coach/add-client  (handleAddClient)
 *   GET  /coach/clients     (handleGetClients)
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { handleAddClient, handleGetClients } from '../src/coach.js';
import {
    setupSchema, clearData, seedCoach, seedClient,
    makeToken, coachToken, clientToken,
    post, get,
    mockExternalFetch,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    mockExternalFetch(vi);
});
afterEach(() => vi.unstubAllGlobals());

// ─── POST /coach/add-client ───────────────────────────────────────────────────

describe('POST /coach/add-client', () => {
    it('returns 401 without auth', async () => {
        const res = await handleAddClient(post('/coach/add-client', { fname: 'A', lname: 'B', email: 'a@b.com' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-coach callers', async () => {
        await seedClient();
        const tok = await clientToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'A', lname: 'B', email: 'new@example.com' }, tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 400 for missing fields', async () => {
        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'Alice', lname: 'Smith' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'Alice', lname: 'Smith', email: 'not-an-email' }, tok), env);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/invalid email/i);
    });

    it('returns 409 when client email is already in this coach\'s roster', async () => {
        await seedClient({ email: 'existing@example.com', coachedBy: 'coach@example.com' });
        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'Dupe', lname: 'User', email: 'existing@example.com' }, tok), env);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/already in your roster/i);
    });

    it('returns 409 when email belongs to a client of another coach', async () => {
        // Seed a second coach and their client
        await seedCoach({ email: 'coach2@example.com' });
        await seedClient({ email: 'theirclient@example.com', coachedBy: 'coach2@example.com' });

        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'Stolen', lname: 'Client', email: 'theirclient@example.com' }, tok), env);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/already exists/i);
    });

    it('returns 201 and inserts a pending client row', async () => {
        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'New', lname: 'Client', email: 'newclient@example.com' }, tok), env);
        expect(res.status).toBe(201);
        const row = await env.DB.prepare('SELECT * FROM clients WHERE email = ?').bind('newclient@example.com').first();
        expect(row).not.toBeNull();
        expect(row.coachedBy).toBe('coach@example.com');
        expect(row.pw).toBe(''); // no password yet — pending registration
        expect(row.accessCode).toBeTruthy();
    });

    it('normalizes email to lowercase', async () => {
        const tok = await coachToken();
        await handleAddClient(post('/coach/add-client', { fname: 'New', lname: 'User', email: 'UPPER@EXAMPLE.COM' }, tok), env);
        const row = await env.DB.prepare('SELECT email FROM clients WHERE email = ?').bind('upper@example.com').first();
        expect(row).not.toBeNull();
    });

    it('rolls back the client insert when email sending fails', async () => {
        // Override fetch to simulate Resend failure
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const tok = await coachToken();
        const res = await handleAddClient(post('/coach/add-client', { fname: 'Fail', lname: 'User', email: 'failclient@example.com' }, tok), env);
        expect(res.status).toBe(500);
        const row = await env.DB.prepare('SELECT email FROM clients WHERE email = ?').bind('failclient@example.com').first();
        expect(row).toBeNull(); // rolled back
    });
});

// ─── GET /coach/clients ───────────────────────────────────────────────────────

describe('GET /coach/clients', () => {
    it('returns 401 without auth', async () => {
        const res = await handleGetClients(get('/coach/clients'), env);
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-coach callers', async () => {
        await seedClient();
        const tok = await clientToken();
        const res = await handleGetClients(get('/coach/clients', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns empty list when coach has no clients', async () => {
        const tok = await coachToken();
        const res = await handleGetClients(get('/coach/clients', tok), env);
        expect(res.status).toBe(200);
        expect((await res.json()).clients).toHaveLength(0);
    });

    it('returns only this coach\'s clients', async () => {
        await seedClient({ email: 'mine@example.com', coachedBy: 'coach@example.com' });
        await seedCoach({ email: 'coach2@example.com' });
        await seedClient({ email: 'theirs@example.com', coachedBy: 'coach2@example.com' });

        const tok = await coachToken();
        const res = await handleGetClients(get('/coach/clients', tok), env);
        const { clients } = await res.json();
        expect(clients).toHaveLength(1);
        expect(clients[0].email).toBe('mine@example.com');
    });

    it('returns clients ordered by lname ASC, fname ASC', async () => {
        await seedClient({ email: 'c@example.com', fname: 'Charlie', lname: 'Zebra', coachedBy: 'coach@example.com' });
        await seedClient({ email: 'a@example.com', fname: 'Alice', lname: 'Apple', coachedBy: 'coach@example.com' });
        await seedClient({ email: 'b@example.com', fname: 'Bob', lname: 'Apple', coachedBy: 'coach@example.com' });

        const tok = await coachToken();
        const { clients } = await (await handleGetClients(get('/coach/clients', tok), env)).json();
        expect(clients[0].email).toBe('a@example.com'); // Apple, Alice
        expect(clients[1].email).toBe('b@example.com'); // Apple, Bob
        expect(clients[2].email).toBe('c@example.com'); // Zebra, Charlie
    });

    it('includes emailConfirmed status for each client', async () => {
        await seedClient({ email: 'confirmed@example.com', emailConfirmed: 1, coachedBy: 'coach@example.com' });
        const tok = await coachToken();
        const { clients } = await (await handleGetClients(get('/coach/clients', tok), env)).json();
        expect(typeof clients[0].emailConfirmed).toBe('number');
    });
});
