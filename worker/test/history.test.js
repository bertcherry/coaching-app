/**
 * worker/test/history.test.js
 *
 * Tests for workout history endpoints.
 *   POST /history/batch            (handleHistoryBatch)
 *   GET  /history/exercise-summary (handleExerciseSummary)
 *   GET  /history/workout          (handleWorkoutHistory)
 */

/**
 * @jest-environment node
 */

import { env } from 'cloudflare:test';
import { handleHistoryBatch, handleExerciseSummary, handleWorkoutHistory } from '../src/history.js';
import {
    setupSchema, clearData, seedCoach, seedClient,
    makeToken, coachToken, clientToken,
    post, get,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
});

// ─── POST /history/batch ──────────────────────────────────────────────────────

describe('POST /history/batch', () => {
    it('returns 401 without auth', async () => {
        const res = await handleHistoryBatch(post('/history/batch', { records: [] }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when records array is missing or empty', async () => {
        const tok = await clientToken();
        const res = await handleHistoryBatch(post('/history/batch', { records: [] }, tok), env);
        expect(res.status).toBe(400);
    });

    it('inserts valid records and returns them in succeeded', async () => {
        const tok = await clientToken();
        const records = [{
            id: 'rec-1',
            clientId: 'client@example.com',
            workoutId: 'w1',
            exerciseId: 'ex1',
            set: 1,
            reps: 10,
            weight: 100,
            weightUnit: 'lbs',
            dateTime: '2099-01-01T10:00:00Z',
        }];
        const res = await handleHistoryBatch(post('/history/batch', { records }, tok), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.succeeded).toContain('rec-1');
        expect(body.failed).toHaveLength(0);
    });

    it('rejects records whose clientId does not match the caller', async () => {
        const tok = await clientToken();
        const records = [{
            id: 'rec-1',
            clientId: 'someoneelse@example.com', // not the caller
            workoutId: 'w1', exerciseId: 'ex1',
            set: 1, reps: 10, dateTime: '2099-01-01T10:00:00Z',
        }];
        const res = await handleHistoryBatch(post('/history/batch', { records }, tok), env);
        const body = await res.json();
        expect(body.failed).toContain('rec-1');
        expect(body.succeeded).toHaveLength(0);
    });

    it('upserts — re-posting the same ID updates mutable fields', async () => {
        const tok = await clientToken();
        const record = {
            id: 'rec-dupe',
            clientId: 'client@example.com',
            workoutId: 'w1', exerciseId: 'ex1',
            set: 1, reps: 8, weight: 100, weightUnit: 'lbs',
            dateTime: '2099-01-01T10:00:00Z',
        };
        await handleHistoryBatch(post('/history/batch', { records: [record] }, tok), env);

        // Re-post with updated weight and reps
        const updated = { ...record, weight: 110, reps: 9 };
        const res = await handleHistoryBatch(post('/history/batch', { records: [updated] }, tok), env);
        const body = await res.json();
        expect(body.succeeded).toContain('rec-dupe');

        const row = await env.DB.prepare('SELECT weight, reps FROM history WHERE id = ?').bind('rec-dupe').first();
        expect(row.weight).toBe(110);
        expect(row.reps).toBe(9);
        // Still only one row
        const { results } = await env.DB.prepare('SELECT * FROM history WHERE id = ?').bind('rec-dupe').all();
        expect(results).toHaveLength(1);
    });

    it('handles mixed valid and invalid records in one batch', async () => {
        const tok = await clientToken();
        const records = [
            { id: 'ok-1', clientId: 'client@example.com', workoutId: 'w1', exerciseId: 'ex1', set: 1, reps: 5, dateTime: '2099-01-01T10:00:00Z' },
            { id: 'bad-1', clientId: 'hacker@example.com', workoutId: 'w1', exerciseId: 'ex1', set: 1, reps: 5, dateTime: '2099-01-01T10:00:00Z' },
        ];
        const res = await handleHistoryBatch(post('/history/batch', { records }, tok), env);
        const body = await res.json();
        expect(body.succeeded).toContain('ok-1');
        expect(body.failed).toContain('bad-1');
    });

    it('marks sets as skipped when skipped flag is true', async () => {
        const tok = await clientToken();
        await handleHistoryBatch(post('/history/batch', {
            records: [{
                id: 'skipped-1', clientId: 'client@example.com',
                workoutId: 'w1', exerciseId: 'ex1', set: 1, skipped: true,
                dateTime: '2099-01-01T10:00:00Z',
            }]
        }, tok), env);
        const row = await env.DB.prepare('SELECT skipped FROM history WHERE id = ?').bind('skipped-1').first();
        expect(row.skipped).toBe(1);
    });
});

// ─── GET /history/exercise-summary ───────────────────────────────────────────

describe('GET /history/exercise-summary', () => {
    it('returns 401 without auth', async () => {
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com&exerciseId=ex1'), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when params are missing', async () => {
        const tok = await coachToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com', tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 403 when client queries for another client', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await clientToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=other@example.com&exerciseId=ex1', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 404 when coach queries for a client they don\'t coach', async () => {
        await seedClient({ email: 'unrelated@example.com', coachedBy: null });
        const tok = await coachToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=unrelated@example.com&exerciseId=ex1', tok), env);
        expect(res.status).toBe(404);
    });

    it('returns { lastSet: null, lastCoachNote: null } when no history', async () => {
        const tok = await clientToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com&exerciseId=ex1', tok), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.lastSet).toBeNull();
        expect(body.lastCoachNote).toBeNull();
    });

    it('returns the most recent set for the exercise', async () => {
        // Insert two sets — different dates
        await env.DB.prepare(
            `INSERT INTO history (id, dateTime, clientId, exerciseId, workoutId, "set", weight, weightUnit, reps, rpe, skipped)
             VALUES ('h1', '2099-01-01T09:00:00Z', 'client@example.com', 'ex1', 'w1', 1, 80, 'lbs', 5, 7, 0),
                    ('h2', '2099-01-02T09:00:00Z', 'client@example.com', 'ex1', 'w1', 1, 85, 'lbs', 5, 8, 0)`
        ).run();
        const tok = await clientToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com&exerciseId=ex1', tok), env);
        const { lastSet } = await res.json();
        expect(lastSet.weight).toBe(85); // most recent
        expect(lastSet.rpe).toBe(8);
    });

    it('excludes skipped sets from lastSet', async () => {
        await env.DB.prepare(
            `INSERT INTO history (id, dateTime, clientId, exerciseId, workoutId, "set", weight, reps, skipped)
             VALUES ('h1', '2099-01-01T09:00:00Z', 'client@example.com', 'ex1', 'w1', 1, 80, 5, 0),
                    ('h2', '2099-01-02T09:00:00Z', 'client@example.com', 'ex1', 'w1', 1, 90, 0, 1)`
        ).run();
        const tok = await clientToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com&exerciseId=ex1', tok), env);
        const { lastSet } = await res.json();
        expect(lastSet.weight).toBe(80); // skipped set ignored
    });

    it('returns lastCoachNote when one exists', async () => {
        await env.DB.prepare(
            `INSERT INTO coach_exercise_notes (id, clientEmail, exerciseId, note, updatedAt)
             VALUES ('cn1', 'client@example.com', 'ex1', 'Focus on form', datetime('now'))`
        ).run();
        const tok = await coachToken();
        const res = await handleExerciseSummary(get('/history/exercise-summary?clientEmail=client@example.com&exerciseId=ex1', tok), env);
        const { lastCoachNote } = await res.json();
        expect(lastCoachNote).toBe('Focus on form');
    });
});

// ─── GET /history/workout ─────────────────────────────────────────────────────

describe('GET /history/workout', () => {
    async function seedHistory(rows) {
        for (const r of rows) {
            await env.DB.prepare(
                `INSERT INTO history (id, dateTime, clientId, workoutId, exerciseId, "set", weight, weightUnit, reps, rpe, note, skipped)
                 VALUES (?, ?, 'client@example.com', ?, ?, ?, ?, ?, ?, ?, ?, 0)`
            ).bind(r.id, r.dateTime, r.workoutId, r.exerciseId, r.set,
                   r.weight ?? null, r.weightUnit ?? 'lbs', r.reps ?? null,
                   r.rpe ?? null, r.note ?? null).run();
        }
    }

    it('returns 401 without auth', async () => {
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com'), env
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when workoutId is missing', async () => {
        const tok = await clientToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?clientEmail=client@example.com', tok), env
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when clientEmail is missing', async () => {
        const tok = await clientToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1', tok), env
        );
        expect(res.status).toBe(400);
    });

    it('returns 403 when a client queries for another client', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await clientToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=other@example.com', tok), env
        );
        expect(res.status).toBe(403);
    });

    it('returns 404 when coach queries a client they do not coach', async () => {
        await seedClient({ email: 'unrelated@example.com', coachedBy: null });
        const tok = await coachToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=unrelated@example.com', tok), env
        );
        expect(res.status).toBe(404);
    });

    it('returns empty records array when no history exists', async () => {
        const tok = await clientToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.records).toEqual([]);
    });

    it('returns logged sets for the workout', async () => {
        await seedHistory([
            { id: 'h1', dateTime: '2099-01-01T10:00:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 1, weight: 135, reps: 8, rpe: 7 },
            { id: 'h2', dateTime: '2099-01-01T10:01:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 2, weight: 145, reps: 7, rpe: 8 },
        ]);
        const tok = await clientToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        );
        const { records } = await res.json();
        expect(records).toHaveLength(2);
        const set1 = records.find(r => r.set === 1);
        expect(set1.weight).toBe(135);
        expect(set1.rpe).toBe(7);
    });

    it('returns only the most recent record per (exerciseId, set) when duplicates exist', async () => {
        // Two records for the same exercise+set — different dateTimes
        await seedHistory([
            { id: 'h1', dateTime: '2099-01-01T10:00:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 1, weight: 100, reps: 8 },
            { id: 'h2', dateTime: '2099-01-02T10:00:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 1, weight: 110, reps: 9 },
        ]);
        const tok = await clientToken();
        const { records } = await (await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        )).json();
        expect(records).toHaveLength(1);
        expect(records[0].weight).toBe(110); // most recent
    });

    it('excludes skipped sets', async () => {
        await env.DB.prepare(
            `INSERT INTO history (id, dateTime, clientId, workoutId, exerciseId, "set", weight, weightUnit, reps, skipped)
             VALUES ('skip1', '2099-01-01T10:00:00Z', 'client@example.com', 'w1', 'ex1', 1, 100, 'lbs', 5, 1)`
        ).run();
        const tok = await clientToken();
        const { records } = await (await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        )).json();
        expect(records).toHaveLength(0);
    });

    it('does not return sets from a different workout', async () => {
        await seedHistory([
            { id: 'h1', dateTime: '2099-01-01T10:00:00Z', workoutId: 'w-other', exerciseId: 'ex1', set: 1, weight: 200, reps: 5 },
        ]);
        const tok = await clientToken();
        const { records } = await (await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        )).json();
        expect(records).toHaveLength(0);
    });

    it('coach can query for their client', async () => {
        await seedHistory([
            { id: 'h1', dateTime: '2099-01-01T10:00:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 1, weight: 135, reps: 5 },
        ]);
        const tok = await coachToken();
        const res = await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        );
        expect(res.status).toBe(200);
        const { records } = await res.json();
        expect(records).toHaveLength(1);
    });

    it('records include note field', async () => {
        await seedHistory([
            { id: 'h1', dateTime: '2099-01-01T10:00:00Z', workoutId: 'w1', exerciseId: 'ex1', set: 1, weight: 135, reps: 5, note: 'felt strong' },
        ]);
        const tok = await clientToken();
        const { records } = await (await handleWorkoutHistory(
            get('/history/workout?workoutId=w1&clientEmail=client@example.com', tok), env
        )).json();
        expect(records[0].note).toBe('felt strong');
    });
});
