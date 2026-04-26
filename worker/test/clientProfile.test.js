import { env } from 'cloudflare:test';
import worker from '../src/worker.js';
import {
    setupSchema, clearData, seedCoach, seedClient,
    seedAthleteProfile, seedMovementPattern,
    coachToken, clientToken, get, post, patch,
} from './helpers.js';

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
});

// ─── GET /clients/:email/profile ──────────────────────────────────────────────

describe('GET /clients/:email/profile', () => {
    it('returns null profile and default rpe_display when no profile exists', async () => {
        const token = await coachToken();
        const res = await worker.fetch(get('/clients/client@example.com/profile', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.athleteProfile).toBeNull();
        expect(body.rpeDisplay).toBe('numeric');
        expect(Array.isArray(body.connectedDevices)).toBe(true);
    });

    it('returns existing athlete profile', async () => {
        await seedAthleteProfile();
        const token = await coachToken();
        const res = await worker.fetch(get('/clients/client@example.com/profile', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.athleteProfile.experience_level).toBe('intermediate');
        expect(body.athleteProfile.training_focus).toBe('strength');
    });

    it('returns 403 for non-coach', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/clients/client@example.com/profile', token), env);
        expect(res.status).toBe(403);
    });

    it('returns 403 when coach does not own client', async () => {
        await env.DB.prepare(
            `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, emailConfirmed, coachedBy)
             VALUES ('other@example.com', 'Other', 'Client', 0, '', 'imperial', 1, 'someoneelse@example.com')`
        ).run();
        const token = await coachToken();
        const res = await worker.fetch(get('/clients/other@example.com/profile', token), env);
        expect(res.status).toBe(403);
    });

    it('returns 404 for unknown client', async () => {
        const token = await coachToken();
        const res = await worker.fetch(get('/clients/nobody@example.com/profile', token), env);
        expect(res.status).toBe(404);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(get('/clients/client@example.com/profile'), env);
        expect(res.status).toBe(401);
    });
});

// ─── PATCH /clients/:email/profile ───────────────────────────────────────────

describe('PATCH /clients/:email/profile', () => {
    it('creates athlete profile when none exists', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            experience_level: 'advanced',
            training_focus: 'hypertrophy',
            sport: 'Powerlifting',
        }, token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.athleteProfile.experience_level).toBe('advanced');
        expect(body.athleteProfile.sport).toBe('Powerlifting');
    });

    it('updates existing profile without overwriting untouched fields', async () => {
        await seedAthleteProfile({ sport: 'CrossFit', private_notes: 'Keep private' });
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            experience_level: 'elite',
        }, token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.athleteProfile.experience_level).toBe('elite');
        expect(body.athleteProfile.sport).toBe('CrossFit');
        expect(body.athleteProfile.private_notes).toBe('Keep private');
    });

    it('updates rpe_display on the clients table', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            rpe_display: 'descriptive',
        }, token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.rpeDisplay).toBe('descriptive');

        const row = await env.DB.prepare('SELECT rpe_display FROM clients WHERE email = ?')
            .bind('client@example.com').first();
        expect(row.rpe_display).toBe('descriptive');
    });

    it('saves limitations as JSON array', async () => {
        const token = await coachToken();
        const limitations = [{
            id: 'lim-1',
            regions: ['right_shoulder'],
            patterns_affected: ['overhead_press'],
            severity: 'avoid',
            notes: 'AC joint',
            since: '2025-09',
            until: null,
            is_active: true,
        }];
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            limitations,
        }, token), env);
        expect(res.status).toBe(200);

        const row = await env.DB.prepare('SELECT limitations FROM athlete_profiles WHERE clientEmail = ?')
            .bind('client@example.com').first();
        const parsed = JSON.parse(row.limitations);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].regions).toEqual(['right_shoulder']);
    });

    it('rejects invalid experience_level', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            experience_level: 'god_tier',
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('rejects invalid training_focus', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            training_focus: 'winning',
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('rejects invalid rpe_display', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            rpe_display: 'emoji',
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('rejects non-array limitations', async () => {
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            limitations: 'bad',
        }, token), env);
        expect(res.status).toBe(400);
    });

    it('returns 403 for non-coach', async () => {
        const token = await clientToken();
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {
            experience_level: 'beginner',
        }, token), env);
        expect(res.status).toBe(403);
    });

    it('returns 403 when coach does not own client', async () => {
        await env.DB.prepare(
            `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, emailConfirmed, coachedBy)
             VALUES ('other@example.com','O','C', 0, '', 'imperial', 1, 'someoneelse@example.com')`
        ).run();
        const token = await coachToken();
        const res = await worker.fetch(patch('/clients/other@example.com/profile', {
            experience_level: 'beginner',
        }, token), env);
        expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(patch('/clients/client@example.com/profile', {}), env);
        expect(res.status).toBe(401);
    });
});

// ─── GET /movement-patterns ───────────────────────────────────────────────────

describe('GET /movement-patterns', () => {
    beforeEach(async () => {
        await seedMovementPattern({ id: 'mp-1', name: 'overhead_press', label: 'Overhead Press', display_order: 1 });
        await seedMovementPattern({ id: 'mp-2', name: 'horizontal_push', label: 'Horizontal Push', display_order: 2 });
    });

    it('returns all patterns ordered by display_order', async () => {
        const token = await coachToken();
        const res = await worker.fetch(get('/movement-patterns', token), env);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].name).toBe('overhead_press');
        expect(body[1].name).toBe('horizontal_push');
    });

    it('returns 403 for non-coach', async () => {
        const token = await clientToken();
        const res = await worker.fetch(get('/movement-patterns', token), env);
        expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
        const res = await worker.fetch(get('/movement-patterns'), env);
        expect(res.status).toBe(401);
    });
});
