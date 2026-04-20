/**
 * worker/test/schedule.test.js
 *
 * Tests for schedule endpoints:
 *   POST /workouts/save       (handleSaveWorkout)
 *   GET  /schedule  (handleGetSchedule)
 *   POST /schedule/assign   (handleAssignWorkout)
 *   POST /schedule/move     (handleMoveWorkout)
 *   POST /schedule/skip     (handleSkipWorkout)
 *   POST /schedule/copy     (handleCopyWorkout)
 *   POST /schedule/complete (handleScheduleComplete)
 */

/**
 * @jest-environment node
 */

import { env } from 'cloudflare:test';
import { handleGetSchedule } from '../src/schedule.js';
import { handleAssignWorkout, handleMoveWorkout, handleSkipWorkout, handleCopyWorkout, handleScheduleComplete, handleSaveWorkout } from '../src/worker.js';
import {
    setupSchema, clearData, seedCoach, seedClient, seedWorkout,
    makeToken, coachToken, clientToken,
    post, get,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
});

// ─── GET /schedule ────────────────────────────────────────────────────────────

describe('GET /schedule', () => {
    it('returns 401 without auth', async () => {
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com&month=2099-12'), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when clientEmail or month missing', async () => {
        const tok = await clientToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com', tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 403 when client tries to see another client', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await clientToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=other@example.com&month=2099-12', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns workouts for the requested month', async () => {
        await seedWorkout({ id: 'w1', scheduledDate: '2099-12-15' });
        await seedWorkout({ id: 'w2', scheduledDate: '2099-11-01' }); // different month
        const tok = await clientToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com&month=2099-12&tz=UTC', tok), env);
        expect(res.status).toBe(200);
        const { workouts } = await res.json();
        expect(workouts).toHaveLength(1);
        expect(workouts[0].id).toBe('w1');
    });

    it('marks past scheduled workouts as missed', async () => {
        await seedWorkout({ id: 'past', scheduledDate: '2020-01-01', status: 'scheduled' });
        const tok = await clientToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com&month=2020-01&tz=UTC', tok), env);
        const { workouts } = await res.json();
        expect(workouts[0].status).toBe('missed');
        // Also persisted to DB
        const row = await env.DB.prepare('SELECT status FROM scheduled_workouts WHERE id = ?').bind('past').first();
        expect(row.status).toBe('missed');
    });

    it('does NOT mark month-only workouts as missed', async () => {
        await seedWorkout({ id: 'month-only', scheduledDate: '2020-01', status: 'scheduled' });
        const tok = await clientToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com&month=2020-01&tz=UTC', tok), env);
        const { workouts } = await res.json();
        expect(workouts[0].status).toBe('scheduled');
    });

    it('coach can see their own client\'s schedule', async () => {
        await seedWorkout({ id: 'w1', scheduledDate: '2099-12-15' });
        const tok = await coachToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=client@example.com&month=2099-12&tz=UTC', tok), env);
        expect(res.status).toBe(200);
    });

    it('coach cannot see a client they do not coach', async () => {
        await seedClient({ email: 'unrelated@example.com', coachedBy: null });
        const tok = await coachToken();
        const res = await handleGetSchedule(get('/schedule?clientEmail=unrelated@example.com&month=2099-12&tz=UTC', tok), env);
        expect(res.status).toBe(404);
    });
});

// ─── POST /schedule/assign ────────────────────────────────────────────────────

describe('POST /schedule/assign', () => {
    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Test',
        }, tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 400 for missing required fields', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1',
        }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 if client does not belong to coach', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: null });
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'other@example.com', workoutId: 'w1', workoutName: 'Test',
        }, tok), env);
        expect(res.status).toBe(404);
    });

    it('returns 201 and creates a scheduled workout (no date)', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
        }, tok), env);
        expect(res.status).toBe(201);
        const { id } = await res.json();
        const row = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
        expect(row.workoutName).toBe('Leg Day');
        expect(row.status).toBe('scheduled');
    });

    it('returns 201 with a future YYYY-MM-DD date', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
            scheduledDate: '2099-12-25',
        }, tok), env);
        expect(res.status).toBe(201);
    });

    it('returns 422 for a past YYYY-MM-DD date', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
            scheduledDate: '2020-01-01',
        }, tok), env);
        expect(res.status).toBe(422);
    });

    it('returns 400 for invalid date format', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
            scheduledDate: '25/12/2099',
        }, tok), env);
        expect(res.status).toBe(400);
    });

    it('accepts YYYY-MM month-only date', async () => {
        const tok = await coachToken();
        const res = await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
            scheduledDate: '2099-12',
        }, tok), env);
        expect(res.status).toBe(201);
    });

    it('creates a notification event on assign', async () => {
        const tok = await coachToken();
        await handleAssignWorkout(post('/schedule/assign', {
            clientEmail: 'client@example.com', workoutId: 'w1', workoutName: 'Leg Day',
        }, tok), env);
        const { results } = await env.DB.prepare('SELECT * FROM notification_events WHERE recipientEmail = ?').bind('client@example.com').all();
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('new_workout');
    });
});

// ─── POST /schedule/move ──────────────────────────────────────────────────────

describe('POST /schedule/move', () => {
    beforeEach(async () => { await seedWorkout({ id: 'sw1', scheduledDate: '2099-12-15', status: 'scheduled' }); });

    it('returns 401 without auth', async () => {
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20', today: '2026-01-01' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 for missing fields', async () => {
        const tok = await clientToken();
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid newDate format', async () => {
        const tok = await clientToken();
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '20/12/2099', today: '2026-01-01' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workout', async () => {
        const tok = await clientToken();
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'ghost', newDate: '2099-12-20', today: '2026-01-01' }, tok), env);
        expect(res.status).toBe(404);
    });

    it('returns 403 when client tries to move another client\'s workout', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await makeToken({ sub: 'other@example.com', email: 'other@example.com', isCoach: false, fname: 'O', lname: 'T', unitDefault: 'imperial' });
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20', today: '2026-01-01' }, tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 422 when moving to a past date', async () => {
        const tok = await clientToken();
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2020-01-01', today: '2026-01-01' }, tok), env);
        expect(res.status).toBe(422);
    });

    it('returns 422 when workout is completed', async () => {
        await env.DB.prepare("UPDATE scheduled_workouts SET status = 'completed' WHERE id = ?").bind('sw1').run();
        const tok = await clientToken();
        const res = await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20', today: '2026-01-01' }, tok), env);
        expect(res.status).toBe(422);
    });

    it('updates scheduledDate and stores originalDate', async () => {
        const tok = await clientToken();
        await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20', today: '2026-01-01' }, tok), env);
        const row = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind('sw1').first();
        expect(row.scheduledDate).toBe('2099-12-20');
        expect(row.originalDate).toBe('2099-12-15');
    });

    it('restores status to scheduled when moving a skipped workout', async () => {
        await env.DB.prepare("UPDATE scheduled_workouts SET status = 'skipped' WHERE id = ?").bind('sw1').run();
        const tok = await clientToken();
        await handleMoveWorkout(post('/schedule/move', { id: 'sw1', newDate: '2099-12-20', today: '2026-01-01' }, tok), env);
        const row = await env.DB.prepare('SELECT status FROM scheduled_workouts WHERE id = ?').bind('sw1').first();
        expect(row.status).toBe('scheduled');
    });
});

// ─── POST /schedule/skip ──────────────────────────────────────────────────────

describe('POST /schedule/skip', () => {
    beforeEach(async () => { await seedWorkout({ id: 'sw1', scheduledDate: '2099-12-15' }); });

    it('returns 401 without auth', async () => {
        const res = await handleSkipWorkout(post('/schedule/skip', { id: 'sw1' }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 for missing id', async () => {
        const tok = await clientToken();
        const res = await handleSkipWorkout(post('/schedule/skip', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workout', async () => {
        const tok = await clientToken();
        const res = await handleSkipWorkout(post('/schedule/skip', { id: 'ghost' }, tok), env);
        expect(res.status).toBe(404);
    });

    it('returns 422 when workout is already completed', async () => {
        await env.DB.prepare("UPDATE scheduled_workouts SET status = 'completed' WHERE id = ?").bind('sw1').run();
        const tok = await clientToken();
        const res = await handleSkipWorkout(post('/schedule/skip', { id: 'sw1' }, tok), env);
        expect(res.status).toBe(422);
    });

    it('marks workout as skipped with optional reason', async () => {
        const tok = await clientToken();
        await handleSkipWorkout(post('/schedule/skip', { id: 'sw1', reason: 'feeling sick' }, tok), env);
        const row = await env.DB.prepare('SELECT status, skipReason FROM scheduled_workouts WHERE id = ?').bind('sw1').first();
        expect(row.status).toBe('skipped');
        expect(row.skipReason).toBe('feeling sick');
    });

    it('emits a notification to the coach on skip', async () => {
        const tok = await clientToken();
        await handleSkipWorkout(post('/schedule/skip', { id: 'sw1' }, tok), env);
        const { results } = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE recipientEmail = ? AND type = ?'
        ).bind('coach@example.com', 'workout_skipped').all();
        expect(results).toHaveLength(1);
    });
});

// ─── POST /schedule/copy ──────────────────────────────────────────────────────

describe('POST /schedule/copy', () => {
    beforeEach(async () => { await seedWorkout({ id: 'sw1', scheduledDate: '2099-12-15' }); });

    it('returns 400 for missing fields', async () => {
        const tok = await clientToken();
        const res = await handleCopyWorkout(post('/schedule/copy', { id: 'sw1' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid date format', async () => {
        const tok = await clientToken();
        const res = await handleCopyWorkout(post('/schedule/copy', { id: 'sw1', newDate: '20-12-2099' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('creates a new scheduled workout with copiedFrom set', async () => {
        const tok = await clientToken();
        const res = await handleCopyWorkout(post('/schedule/copy', { id: 'sw1', newDate: '2099-12-20' }, tok), env);
        expect(res.status).toBe(201);
        const { newId } = await res.json();
        const row = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(newId).first();
        expect(row.copiedFrom).toBe('sw1');
        expect(row.scheduledDate).toBe('2099-12-20');
        expect(row.status).toBe('scheduled');
    });
});

// ─── POST /schedule/complete ──────────────────────────────────────────────────

describe('POST /schedule/complete', () => {
    beforeEach(async () => { await seedWorkout({ id: 'sw1', scheduledDate: '2099-12-15' }); });

    it('returns 400 for missing id', async () => {
        const tok = await clientToken();
        const res = await handleScheduleComplete(post('/schedule/complete', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workout', async () => {
        const tok = await clientToken();
        const res = await handleScheduleComplete(post('/schedule/complete', { id: 'ghost' }, tok), env);
        expect(res.status).toBe(404);
    });

    it('marks workout as completed', async () => {
        const tok = await clientToken();
        await handleScheduleComplete(post('/schedule/complete', { id: 'sw1', completedAt: '2099-12-15T10:00:00Z' }, tok), env);
        const row = await env.DB.prepare('SELECT status, completedAt FROM scheduled_workouts WHERE id = ?').bind('sw1').first();
        expect(row.status).toBe('completed');
        expect(row.completedAt).toBe('2099-12-15T10:00:00Z');
    });

    it('emits a notification to the coach on completion', async () => {
        const tok = await clientToken();
        await handleScheduleComplete(post('/schedule/complete', { id: 'sw1' }, tok), env);
        const { results } = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE recipientEmail = ? AND type = ?'
        ).bind('coach@example.com', 'workout_completed').all();
        expect(results).toHaveLength(1);
    });
});

// ─── POST /workouts/save ──────────────────────────────────────────────────────

describe('POST /workouts/save', () => {
    const WORKOUT_PAYLOAD = {
        id: 'wk-test-1',
        workoutName: 'Monthly Push Day',
        createdBy: 'coach@example.com',
        data: [{ timed: false, circuit: true, data: [{ name: 'Press', setsMin: 3 }] }],
    };

    it('saves a new workout and returns 200', async () => {
        const res = await handleSaveWorkout(post('/workouts/save', WORKOUT_PAYLOAD), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('wk-test-1');
    });

    it('re-saving the same id (after a failed schedule/assign) returns 200, not an error', async () => {
        // First save — succeeds
        await handleSaveWorkout(post('/workouts/save', WORKOUT_PAYLOAD), env);

        // Second save with same id (simulates user retrying after a failed schedule/assign)
        const res = await handleSaveWorkout(post('/workouts/save', WORKOUT_PAYLOAD), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('wk-test-1');
    });

    it('re-save updates the workout name in the DB', async () => {
        await handleSaveWorkout(post('/workouts/save', WORKOUT_PAYLOAD), env);
        await handleSaveWorkout(post('/workouts/save', { ...WORKOUT_PAYLOAD, workoutName: 'Updated Name' }), env);
        const row = await env.DB.prepare('SELECT workoutName FROM workouts WHERE id = ?').bind('wk-test-1').first();
        expect(row.workoutName).toBe('Updated Name');
    });

    it('returns 400 when id is missing', async () => {
        const res = await handleSaveWorkout(post('/workouts/save', { workoutName: 'No ID', data: [] }), env);
        expect(res.status).toBe(400);
    });
});
