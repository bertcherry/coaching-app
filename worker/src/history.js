/**
 * worker/src/history.js
 *
 * Handlers for workout history endpoints.
 */

import { jwtVerify } from 'jose';

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function requireAuth(request, env) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) throw json({ error: 'Unauthorized' }, 401);
    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        throw json({ error: 'Unauthorized' }, 401);
    }
}

/**
 * GET /history/exercise-summary?clientEmail=&exerciseId=
 *
 * Returns the most recent set logged for a given client + exercise, plus
 * the most recent coach note stored against that exercise.
 *
 * Used by CreateWorkout to:
 *   - Show last weight/reps/RPE as helper context when setting recommendations
 *   - Pre-populate coach notes with the previous note for continuity
 *
 * Response:
 * {
 *   lastSet: { weight, weightUnit, reps, rpe, note, dateTime } | null,
 *   lastCoachNote: string | null
 * }
 */
export async function handleExerciseSummary(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const exerciseId  = url.searchParams.get('exerciseId');

    if (!clientEmail || !exerciseId) {
        return json({ error: 'clientEmail and exerciseId are required' }, 400);
    }

    // Coaches can query for their own clients; clients can query for themselves
    if (!caller.isCoach && caller.email !== clientEmail) {
        return json({ error: 'Forbidden' }, 403);
    }
    if (caller.isCoach) {
        const client = await env.DB.prepare(
            'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
        ).bind(clientEmail, caller.email).first();
        if (!client) return json({ error: 'Client not found' }, 404);
    }

    // Most recent set logged for this exercise (exclude skipped sets for recommendations)
    const lastSet = await env.DB.prepare(`
        SELECT weight, weightUnit, reps, rpe, note, dateTime
        FROM history
        WHERE clientId = ? AND exerciseId = ? AND (skipped IS NULL OR skipped = 0)
        ORDER BY dateTime DESC
        LIMIT 1
    `).bind(clientEmail, exerciseId).first();

    // Most recent coach note for this exercise (stored in scheduled_workout_notes table if present,
    // or fall back to the note column in history which coaches may have set)
    // We check the dedicated coach_exercise_notes table first; fall back gracefully if it doesn't exist.
    let lastCoachNote = null;
    try {
        const noteRow = await env.DB.prepare(`
            SELECT note
            FROM coach_exercise_notes
            WHERE clientEmail = ? AND exerciseId = ?
            ORDER BY updatedAt DESC
            LIMIT 1
        `).bind(clientEmail, exerciseId).first();
        lastCoachNote = noteRow?.note ?? null;
    } catch {
        // Table may not exist yet — not a fatal error
        lastCoachNote = null;
    }

    return json({
        lastSet: lastSet ?? null,
        lastCoachNote,
    });
}

export async function handleHistoryBatch(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { records } = await request.json();
    if (!Array.isArray(records) || records.length === 0) return json({ error: 'records array is required' }, 400);
    const succeeded = [];
    const failed    = [];
    const syncedAt  = new Date().toISOString();
    for (const r of records) {
        if (r.clientId !== caller.email) { failed.push(r.id); continue; }
        try {
            await env.DB.prepare(`INSERT INTO history (id, dateTime, clientId, workoutId, exerciseId, "set", weight, weightUnit, reps, rpe, note, syncedAt, countType, prescribed, prescribedMax, unit, skipped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`).bind(r.id, r.dateTime, r.clientId, r.workoutId, r.exerciseId, r.set, r.weight ?? null, r.weightUnit ?? 'lbs', r.reps ?? null, r.rpe ?? null, r.note ?? null, syncedAt, r.countType ?? null, r.prescribed ?? null, r.prescribedMax ?? null, r.unit ?? null, r.skipped ? 1 : 0).run();
            succeeded.push(r.id);
        } catch (err) {
            console.error(`Failed to insert history record ${r.id}:`, err);
            failed.push(r.id);
        }
    }
    return json({ succeeded, failed });
}