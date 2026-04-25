/**
 * worker/test/workouts.test.js
 *
 * Tests for workout save/update:
 *   POST /workouts/save  (handleSaveWorkout)
 */

/**
 * @jest-environment node
 */

import { env } from 'cloudflare:test';
import { handleSaveWorkout } from '../src/worker.js';
import {
    setupSchema, clearData, seedCoach, seedClient, seedWorkout,
    coachToken, clientToken,
    post,
} from './helpers.js';

const WORKOUT_DATA = [{ timed: false, circuit: true, data: [{ id: 'ex-1', name: 'Squat', setsMin: 3, countType: 'Reps', countMin: 10 }] }];

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
});

// ─── POST /workouts/save ──────────────────────────────────────────────────────

describe('POST /workouts/save', () => {
    it('returns 401 without auth', async () => {
        const res = await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Test', data: WORKOUT_DATA }), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when id is missing', async () => {
        const tok = await coachToken();
        const res = await handleSaveWorkout(post('/workouts/save', { workoutName: 'Test', data: WORKOUT_DATA }, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 400 when data is missing', async () => {
        const tok = await coachToken();
        const res = await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Test' }, tok), env);
        expect(res.status).toBe(400);
    });

    it('creates a new workout row', async () => {
        const tok = await coachToken();
        const res = await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Push Day', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT * FROM workouts WHERE id = ?').bind('w-1').first();
        expect(row).not.toBeNull();
        expect(row.workoutName).toBe('Push Day');
        expect(JSON.parse(row.data)).toEqual(WORKOUT_DATA);
    });

    it('updates an existing workout row (upsert)', async () => {
        const tok = await coachToken();
        await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Original Name', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);

        const updatedData = [{ timed: false, circuit: true, data: [{ id: 'ex-2', name: 'Deadlift', setsMin: 4, countType: 'Reps', countMin: 5 }] }];
        const res = await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Updated Name', createdBy: 'coach@example.com', data: updatedData }, tok), env);
        expect(res.status).toBe(200);

        const row = await env.DB.prepare('SELECT * FROM workouts WHERE id = ?').bind('w-1').first();
        expect(row.workoutName).toBe('Updated Name');
        expect(JSON.parse(row.data)).toEqual(updatedData);
    });

    it('syncs updated workoutName to scheduled_workouts rows', async () => {
        const tok = await coachToken();
        // Seed the workout and two scheduled instances
        await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Original Name', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);
        await seedWorkout({ id: 'sw-1', workoutId: 'w-1', workoutName: 'Original Name', scheduledDate: '2099-01-01' });
        await seedWorkout({ id: 'sw-2', workoutId: 'w-1', workoutName: 'Original Name', scheduledDate: '2099-02-01' });

        await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Renamed Workout', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);

        const sw1 = await env.DB.prepare('SELECT workoutName FROM scheduled_workouts WHERE id = ?').bind('sw-1').first();
        const sw2 = await env.DB.prepare('SELECT workoutName FROM scheduled_workouts WHERE id = ?').bind('sw-2').first();
        expect(sw1.workoutName).toBe('Renamed Workout');
        expect(sw2.workoutName).toBe('Renamed Workout');
    });

    it('does not affect scheduled_workouts rows for other workouts', async () => {
        const tok = await coachToken();
        await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Workout One', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);
        await handleSaveWorkout(post('/workouts/save', { id: 'w-2', workoutName: 'Workout Two', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);
        await seedWorkout({ id: 'sw-other', workoutId: 'w-2', workoutName: 'Workout Two', scheduledDate: '2099-03-01' });

        await handleSaveWorkout(post('/workouts/save', { id: 'w-1', workoutName: 'Renamed', createdBy: 'coach@example.com', data: WORKOUT_DATA }, tok), env);

        const swOther = await env.DB.prepare('SELECT workoutName FROM scheduled_workouts WHERE id = ?').bind('sw-other').first();
        expect(swOther.workoutName).toBe('Workout Two');
    });

    it('allows a client to save a workout', async () => {
        const tok = await clientToken();
        const res = await handleSaveWorkout(post('/workouts/save', { id: 'w-client', workoutName: 'My Workout', createdBy: 'client@example.com', data: WORKOUT_DATA }, tok), env);
        expect(res.status).toBe(200);
    });
});
