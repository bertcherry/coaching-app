/**
 * worker/test/history.test.js
 *
 * Tests for workout history endpoints.
 *   POST /history/batch            (handleHistoryBatch)
 *   GET  /history/exercise-summary (handleExerciseSummary)
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { handleHistoryBatch, handleExerciseSummary } from '../src/history.js';
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

    it('is idempotent — duplicate IDs are silently ignored (ON CONFLICT DO NOTHING)', async () => {
        const tok = await clientToken();
        const record = {
            id: 'rec-dupe',
            clientId: 'client@example.com',
            workoutId: 'w1', exerciseId: 'ex1',
            set: 1, reps: 8, dateTime: '2099-01-01T10:00:00Z',
        };
        // Insert twice
        await handleHistoryBatch(post('/history/batch', { records: [record] }, tok), env);
        const res = await handleHistoryBatch(post('/history/batch', { records: [record] }, tok), env);
        const body = await res.json();
        // Second insert is a no-op but not a failure
        expect(body.succeeded).toContain('rec-dupe');

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
