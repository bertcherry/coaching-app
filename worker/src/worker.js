/**
 * index.js  —  cc-workouts Cloudflare Worker
 *
 * Routes:
 *   POST   /                        — save a new workout
 *   GET    /:id                     — get a workout by id
 *   GET    /workouts/templates      — coach's unassigned template workouts
 *   GET    /schedule                — get a client's schedule for a month
 *   POST   /schedule/assign         — coach assigns a workout to a client's calendar
 *   POST   /schedule/move           — move a scheduled workout to a new date
 *   POST   /schedule/skip           — skip a scheduled workout
 *   POST   /schedule/copy           — copy a scheduled workout to a new date
 *   POST   /schedule/complete       — mark a scheduled workout completed
 *   POST   /history/batch           — sync local history records to server
 *
 * Env vars required (set in Cloudflare dashboard → Workers → Settings → Variables):
 *   JWT_SECRET   — long random string used to sign/verify JWTs
 *
 * D1 binding required:
 *   DB  — your D1 database (set in Cloudflare dashboard → Workers → Settings → Bindings)
 *
 * wrangler.toml:
 *   compatibility_date = "2024-01-01"
 *   compatibility_flags = ["nodejs_compat"]
 *
 * npm install jose   (required for JWT verification)
 */

import { jwtVerify } from 'jose';
import { handleLogin, handleRegister, handleRefresh, handleLogout, handleForgotPassword, handleResetPassword } from './auth-worker';
import { handleAddClient, handleGetClients } from './coach';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Verify the Bearer token in the Authorization header.
 * Returns the decoded JWT payload on success.
 * Throws a Response on failure so callers can return it immediately.
 */
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

/** Like requireAuth but also asserts isCoach === true. */
async function requireCoach(request, env) {
    const payload = await requireAuth(request, env);
    if (!payload.isCoach) throw json({ error: 'Forbidden: coaches only' }, 403);
    return payload;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// ─── Workout handlers ─────────────────────────────────────────────────────────

/**
 * POST /
 * Save a new workout to the workouts table.
 * Body: { id, workoutName, createdBy, data }
 */
async function handleSaveWorkout(request, env) {
    const body = await request.json();
    const { id, workoutName, createdBy, data } = body;

    if (!id || !data) {
        return json({ error: 'id and data are required' }, 400);
    }

    const workoutData = JSON.stringify(data);

    const success = (await env.DB.prepare(
        'INSERT INTO workouts (id, data, workoutName, createdBy) VALUES (?, ?, ?, ?)'
    ).bind(id, workoutData, workoutName ?? null, createdBy ?? null).run()).success;

    return success
        ? json({ message: 'Workout saved', id }, 200)
        : json({ error: 'Failed to save workout' }, 400);
}

/**
 * GET /:id
 * Fetch a single workout by its uuid.
 */
async function handleGetWorkout(id, env) {
    if (!id) return new Response('Not found', { status: 404 });

    const result = await env.DB.prepare(
        'SELECT * FROM workouts WHERE id = ? LIMIT 1'
    ).bind(id).first();

    if (!result) return new Response('Not found', { status: 404 });

    return Response.json(JSON.parse(result.data));
}

/**
 * GET /workouts/templates
 * Returns workouts created by this coach that have no scheduled_workouts rows.
 * Query params: page, pageSize, sort (recent|alpha), search
 */
async function handleGetTemplates(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); }
    catch (e) { return e; }

    const url = new URL(request.url);
    const page     = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1'));
    const pageSize = Math.min(50, parseInt(url.searchParams.get('pageSize') ?? '10'));
    const sort     = url.searchParams.get('sort') === 'alpha' ? 'alpha' : 'recent';
    const search   = (url.searchParams.get('search') ?? '').trim();
    const offset   = (page - 1) * pageSize;

    const orderBy      = sort === 'alpha' ? 'w.workoutName ASC' : 'w.createdAt DESC';
    const searchClause = search ? 'AND w.workoutName LIKE ?' : '';
    const searchParam  = search ? `%${search}%` : null;

    const baseWhere = `
        WHERE w.createdBy = ?
          AND NOT EXISTS (
              SELECT 1 FROM scheduled_workouts sw WHERE sw.workoutId = w.id
          )
          ${searchClause}
    `;

    const countParams = [coach.email, ...(searchParam ? [searchParam] : [])];

    const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM workouts w ${baseWhere}`
    ).bind(...countParams).first();

    const total = countRow?.total ?? 0;

    const dataParams = [...countParams, pageSize, offset];
    const { results } = await env.DB.prepare(`
        SELECT w.id, w.workoutName, w.createdAt, w.data
        FROM workouts w
        ${baseWhere}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
    `).bind(...dataParams).all();

    const workouts = results.map(row => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    }));

    return json({ workouts, total, page, pageSize });
}

// ─── Schedule handlers ────────────────────────────────────────────────────────

/**
 * GET /schedule
 * Query params: clientEmail, month (YYYY-MM)
 * Clients fetch their own; coaches fetch their clients'.
 */
async function handleGetSchedule(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const url         = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const month       = url.searchParams.get('month');

    if (!clientEmail || !month) {
        return json({ error: 'clientEmail and month are required' }, 400);
    }

    if (!caller.isCoach && caller.email !== clientEmail) {
        return json({ error: 'Forbidden' }, 403);
    }

    if (caller.isCoach) {
        const client = await env.DB.prepare(
            'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
        ).bind(clientEmail, caller.email).first();
        if (!client) return json({ error: 'Client not found' }, 404);
    }

    const { results } = await env.DB.prepare(`
        SELECT id, clientEmail, workoutId, workoutName, scheduledDate,
               status, skipReason, completedAt, originalDate, copiedFrom
        FROM scheduled_workouts
        WHERE clientEmail = ?
          AND scheduledDate LIKE ?
        ORDER BY scheduledDate ASC
    `).bind(clientEmail, `${month}%`).all();

    return json({ workouts: results });
}

/**
 * POST /schedule/assign
 * Coach assigns a workout to a client's calendar.
 * Body: { clientEmail, workoutId, workoutName, scheduledDate }
 */
async function handleAssignWorkout(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); }
    catch (e) { return e; }

    const { clientEmail, workoutId, workoutName, scheduledDate } = await request.json();

    if (!clientEmail || !workoutId || !workoutName) {
        return json({ error: 'clientEmail, workoutId, and workoutName are required' }, 400);
    }

    const client = await env.DB.prepare(
        'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
    ).bind(clientEmail, coach.email).first();
    if (!client) return json({ error: 'Client not found' }, 404);

    const id = crypto.randomUUID();

    await env.DB.prepare(`
        INSERT INTO scheduled_workouts (id, clientEmail, workoutId, workoutName, scheduledDate, status)
        VALUES (?, ?, ?, ?, ?, 'scheduled')
    `).bind(id, clientEmail, workoutId, workoutName, scheduledDate ?? null).run();

    return json({ message: 'Workout assigned', id }, 201);
}

/**
 * POST /schedule/move
 * Body: { id, newDate }
 * Cannot move completed workouts. Can only move to today or future.
 */
async function handleMoveWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { id, newDate } = await request.json();
    if (!id || !newDate) return json({ error: 'id and newDate are required' }, 400);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        return json({ error: 'newDate must be YYYY-MM-DD' }, 400);
    }

    const workout = await env.DB.prepare(
        'SELECT * FROM scheduled_workouts WHERE id = ?'
    ).bind(id).first();

    if (!workout) return json({ error: 'Workout not found' }, 404);

    if (!caller.isCoach && workout.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }
    if (workout.status === 'completed') {
        return json({ error: 'Completed workouts cannot be moved' }, 422);
    }
    if (newDate < todayISO()) {
        return json({ error: 'Cannot move a workout to a past date' }, 422);
    }

    const originalDate = workout.originalDate ?? workout.scheduledDate;
    const newStatus = (workout.status === 'skipped' || workout.status === 'missed')
        ? 'scheduled'
        : workout.status;

    await env.DB.prepare(`
        UPDATE scheduled_workouts
        SET scheduledDate = ?, originalDate = ?, status = ?, skipReason = null
        WHERE id = ?
    `).bind(newDate, originalDate, newStatus, id).run();

    return json({ message: 'Workout moved', id, newDate });
}

/**
 * POST /schedule/skip
 * Body: { id, reason }
 */
async function handleSkipWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { id, reason } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);

    const workout = await env.DB.prepare(
        'SELECT * FROM scheduled_workouts WHERE id = ?'
    ).bind(id).first();

    if (!workout) return json({ error: 'Workout not found' }, 404);

    if (!caller.isCoach && workout.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }
    if (workout.status === 'completed') {
        return json({ error: 'Completed workouts cannot be skipped' }, 422);
    }

    await env.DB.prepare(`
        UPDATE scheduled_workouts SET status = 'skipped', skipReason = ? WHERE id = ?
    `).bind(reason ?? null, id).run();

    return json({ message: 'Workout skipped', id });
}

/**
 * POST /schedule/copy
 * Body: { id, newDate }
 * Creates a new scheduled_workouts row. Original is untouched.
 */
async function handleCopyWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { id, newDate } = await request.json();
    if (!id || !newDate) return json({ error: 'id and newDate are required' }, 400);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        return json({ error: 'newDate must be YYYY-MM-DD' }, 400);
    }

    const workout = await env.DB.prepare(
        'SELECT * FROM scheduled_workouts WHERE id = ?'
    ).bind(id).first();

    if (!workout) return json({ error: 'Workout not found' }, 404);

    if (!caller.isCoach && workout.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }

    const newId = crypto.randomUUID();

    await env.DB.prepare(`
        INSERT INTO scheduled_workouts
            (id, clientEmail, workoutId, workoutName, scheduledDate, status, copiedFrom)
        VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
    `).bind(newId, workout.clientEmail, workout.workoutId, workout.workoutName, newDate, id).run();

    return json({ message: 'Workout copied', newId, newDate }, 201);
}

/**
 * POST /schedule/complete
 * Body: { id, completedAt }
 */
async function handleScheduleComplete(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { id, completedAt } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);

    const workout = await env.DB.prepare(
        'SELECT * FROM scheduled_workouts WHERE id = ?'
    ).bind(id).first();

    if (!workout) return json({ error: 'Workout not found' }, 404);

    if (!caller.isCoach && workout.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }
    if (caller.isCoach) {
        const client = await env.DB.prepare(
            'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
        ).bind(workout.clientEmail, caller.email).first();
        if (!client) return json({ error: 'Forbidden' }, 403);
    }

    await env.DB.prepare(`
        UPDATE scheduled_workouts SET status = 'completed', completedAt = ? WHERE id = ?
    `).bind(completedAt ?? new Date().toISOString(), id).run();

    return json({ message: 'Workout marked complete', id });
}

// ─── History handler ──────────────────────────────────────────────────────────

/**
 * POST /history/batch
 * Receives an array of history records from the client's local AsyncStorage queue.
 * Inserts each one and reports back which ids succeeded and which failed
 * so the client only retries the failed ones.
 * Body: { records: [HistoryRecord] }
 * Response: { succeeded: [id], failed: [id] }
 */
async function handleHistoryBatch(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { records } = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
        return json({ error: 'records array is required' }, 400);
    }

    const succeeded = [];
    const failed    = [];
    const syncedAt  = new Date().toISOString();

    for (const r of records) {
        // Clients can only write their own records
        if (r.clientId !== caller.email) {
            failed.push(r.id);
            continue;
        }

        try {
            await env.DB.prepare(`
                INSERT INTO history (
                    id, dateTime, clientId, workoutId, exerciseId, set,
                    weight, weightUnit, reps, rpe, note, syncedAt,
                    countType, prescribed, prescribedMax, unit
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO NOTHING
            `).bind(
                r.id,
                r.dateTime,
                r.clientId,
                r.workoutId,
                r.exerciseId,
                r.set,
                r.weight         ?? null,
                r.weightUnit      ?? 'lbs',
                r.reps           ?? null,
                r.rpe            ?? null,
                r.note           ?? null,
                syncedAt,
                r.countType      ?? null,
                r.prescribed     ?? null,
                r.prescribedMax  ?? null,
                r.unit           ?? null,
            ).run();

            succeeded.push(r.id);
        } catch (err) {
            console.error(`Failed to insert history record ${r.id}:`, err);
            failed.push(r.id);
        }
    }

    return json({ succeeded, failed });
}

// ─── Main router ──────────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        const url      = new URL(request.url);
        const method   = request.method;
        const pathname = url.pathname;

        // POST-only auth routes
        const postRoutes = {
            '/auth/login':           handleLogin,
            '/auth/register':        handleRegister,
            '/auth/refresh':         handleRefresh,
            '/auth/logout':          handleLogout,
            '/auth/forgot-password': handleForgotPassword,
            '/auth/reset-password':  handleResetPassword,
            '/coach/add-client':     handleAddClient,
            '/schedule/assign':      handleAssignWorkout,
            '/schedule/move':        handleMoveWorkout,
            '/schedule/skip':        handleSkipWorkout,
            '/schedule/copy':        handleCopyWorkout,
            '/schedule/complete':    handleScheduleComplete,
            '/history/batch':        handleHistoryBatch,
            '/workouts/save':        handleSaveWorkout,
        };
        
        // GET Routes
        const getRoutes = {
            '/coach/clients':       handleGetClients,
            '/schedule':            handleGetSchedule,
            '/workouts/templates':  handleGetTemplates,
        };

        if (method === 'POST' && postRoutes[path]) {
            return postRoutes[path](request, env);
        }

        if (method === 'GET' && getRoutes[path]) {
            return getRoutes[path](request, env);
        }

        if (method === 'GET') {
            const id = pathname.slice(1);
            return handleGetWorkout(id, env);
        }

        return new Response('Not found', { status: 404 });
    },
};