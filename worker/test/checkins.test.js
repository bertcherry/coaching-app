import { env } from 'cloudflare:test';
import worker from '../src/worker.js';
import {
    setupSchema, clearData, seedCoach, seedClient, seedWorkout, seedCheckin,
    coachToken, clientToken, get, post,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
});

// ─── POST /checkins ───────────────────────────────────────────────────────────

describe('POST /checkins', () => {
    it('creates a new check-in and returns 201', async () => {
        const token = await clientToken();
        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'pre_workout',
            readiness: 4,
            sleep_quality: 3,
            energy: 5,
            recovery: 3,
            mental_focus: 4,
        }, token), env);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.clientEmail).toBe('client@example.com');
        expect(body.readiness).toBe(4);
        expect(body.type).toBe('pre_workout');
    });

    it('upserts on duplicate (clientEmail, date, type)', async () => {
        const token = await clientToken();
        await seedCheckin({ date: '2099-12-31', readiness: 2 });

        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'pre_workout',
            readiness: 5,
            sleep_quality: 5,
            energy: 5,
            recovery: 5,
            mental_focus: 5,
        }, token), env);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.readiness).toBe(5);

        const rows = await env.DB.prepare('SELECT COUNT(*) as n FROM checkins WHERE clientEmail = ? AND date = ?')
            .bind('client@example.com', '2099-12-31').first();
        expect(rows.n).toBe(1);
    });

    it('allows rest_day type', async () => {
        const token = await clientToken();
        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'rest_day',
            readiness: 3,
        }, token), env);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.type).toBe('rest_day');
    });

    it('rejects invalid type', async () => {
        const token = await clientToken();
        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'bad_type',
            readiness: 3,
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('rejects scale value out of range', async () => {
        const token = await clientToken();
        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'pre_workout',
            readiness: 6,
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('rejects missing date', async () => {
        const token = await clientToken();
        const res = await worker.fetch(post('/checkins', { type: 'pre_workout', readiness: 3 }, token), env);
        expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(post('/checkins', { date: '2099-12-31', type: 'pre_workout' }), env);
        expect(res.status).toBe(401);
    });

    it('stores linked scheduled_workout_id when provided', async () => {
        const token = await clientToken();
        await seedWorkout({ id: 'sw-1', scheduledDate: '2099-12-31' });
        const res = await worker.fetch(post('/checkins', {
            date: '2099-12-31',
            type: 'pre_workout',
            readiness: 4,
            scheduled_workout_id: 'sw-1',
        }, token), env);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.scheduled_workout_id).toBe('sw-1');
    });
});

// ─── GET /checkins/today ──────────────────────────────────────────────────────

describe('GET /checkins/today', () => {
    it('returns null when no check-in exists for the date', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/checkins/today?date=2099-12-31', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toBeNull();
    });

    it('returns existing check-in for the client', async () => {
        const token = await clientToken();
        await seedCheckin({ date: '2099-12-31' });
        const res = await worker.fetch(get('/checkins/today?date=2099-12-31', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.clientEmail).toBe('client@example.com');
        expect(body.date).toBe('2099-12-31');
    });

    it('allows coach to query their client', async () => {
        const token = await coachToken();
        await seedCheckin({ date: '2099-12-31' });
        const res = await worker.fetch(
            get('/checkins/today?date=2099-12-31&clientEmail=client@example.com', token), env
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.clientEmail).toBe('client@example.com');
    });

    it('forbids client querying another client', async () => {
        const token = await clientToken();
        const res = await worker.fetch(
            get('/checkins/today?date=2099-12-31&clientEmail=other@example.com', token), env
        );
        expect(res.status).toBe(403);
    });

    it('returns 400 without date param', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/checkins/today', token), env);
        expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(get('/checkins/today?date=2099-12-31'), env);
        expect(res.status).toBe(401);
    });
});

// ─── GET /checkins ────────────────────────────────────────────────────────────

describe('GET /checkins', () => {
    beforeEach(async () => {
        await seedCheckin({ id: 'c1', date: '2099-12-29', type: 'pre_workout' });
        await seedCheckin({ id: 'c2', date: '2099-12-30', type: 'rest_day' });
        await seedCheckin({ id: 'c3', date: '2099-12-31', type: 'pre_workout' });
    });

    it('returns all check-ins for the client', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/checkins', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(3);
    });

    it('filters by from date', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/checkins?from=2099-12-30', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
    });

    it('filters by to date', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/checkins?to=2099-12-30', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
    });

    it('allows coach to list their client check-ins', async () => {
        const token = await coachToken();
        const res = await worker.fetch(
            get('/checkins?clientEmail=client@example.com', token), env
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(3);
    });

    it('forbids coach querying an unrelated client', async () => {
        await env.DB.prepare(
            `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, emailConfirmed) VALUES (?, ?, ?, 0, '', 'imperial', 1)`
        ).bind('other@example.com', 'Other', 'Client').run();
        const token = await coachToken();
        const res = await worker.fetch(get('/checkins?clientEmail=other@example.com', token), env);
        expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(get('/checkins'), env);
        expect(res.status).toBe(401);
    });
});
