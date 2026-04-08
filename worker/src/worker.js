import { jwtVerify } from 'jose';
import { handleLogin, handleRegister, handleRefresh, handleLogout, handleForgotPassword, handleResetPassword } from './auth-worker';
import { handleAddClient, handleGetClients } from './coach';
import {
    handleSearchDemos,
    handleGetDemo,
    handleGetUnfilmed,
    handleCreateDemo,
    handleUpdateStreamId,
} from './demos';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

async function requireCoach(request, env) {
    const payload = await requireAuth(request, env);
    if (!payload.isCoach) throw json({ error: 'Forbidden: coaches only' }, 403);
    return payload;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// ─── Workout handlers (unchanged) ─────────────────────────────────────────────

async function handleSaveWorkout(request, env) {
    const body = await request.json();
    const { id, workoutName, createdBy, data } = body;
    if (!id || !data) return json({ error: 'id and data are required' }, 400);
    const success = (await env.DB.prepare(
        'INSERT INTO workouts (id, data, workoutName, createdBy) VALUES (?, ?, ?, ?)'
    ).bind(id, JSON.stringify(data), workoutName ?? null, createdBy ?? null).run()).success;
    return success ? json({ message: 'Workout saved', id }) : json({ error: 'Failed to save workout' }, 400);
}

async function handleGetWorkout(id, env) {
    if (!id) return new Response('Not found', { status: 404 });
    const result = await env.DB.prepare('SELECT * FROM workouts WHERE id = ? LIMIT 1').bind(id).first();
    if (!result) return new Response('Not found', { status: 404 });
    return Response.json(JSON.parse(result.data));
}

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
    const orderBy  = sort === 'alpha' ? 'w.workoutName ASC' : 'w.createdAt DESC';
    const searchClause = search ? 'AND w.workoutName LIKE ?' : '';
    const searchParam  = search ? `%${search}%` : null;
    const baseWhere = `WHERE w.createdBy = ? AND NOT EXISTS (SELECT 1 FROM scheduled_workouts sw WHERE sw.workoutId = w.id) ${searchClause}`;
    const countParams = [coach.email, ...(searchParam ? [searchParam] : [])];
    const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM workouts w ${baseWhere}`).bind(...countParams).first();
    const total = countRow?.total ?? 0;
    const { results } = await env.DB.prepare(`SELECT w.id, w.workoutName, w.createdAt, w.data FROM workouts w ${baseWhere} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...countParams, pageSize, offset).all();
    const workouts = results.map(row => ({ ...row, data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data }));
    return json({ workouts, total, page, pageSize });
}

// ─── Schedule handlers (unchanged) ───────────────────────────────────────────

async function handleGetSchedule(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const month       = url.searchParams.get('month');
    if (!clientEmail || !month) return json({ error: 'clientEmail and month are required' }, 400);
    if (!caller.isCoach && caller.email !== clientEmail) return json({ error: 'Forbidden' }, 403);
    if (caller.isCoach) {
        const client = await env.DB.prepare('SELECT email FROM clients WHERE email = ? AND coachedBy = ?').bind(clientEmail, caller.email).first();
        if (!client) return json({ error: 'Client not found' }, 404);
    }
    const { results } = await env.DB.prepare(`SELECT id, clientEmail, workoutId, workoutName, scheduledDate, status, skipReason, completedAt, originalDate, copiedFrom FROM scheduled_workouts WHERE clientEmail = ? AND scheduledDate LIKE ? ORDER BY scheduledDate ASC`).bind(clientEmail, `${month}%`).all();
    return json({ workouts: results });
}

async function handleAssignWorkout(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); }
    catch (e) { return e; }
    const { clientEmail, workoutId, workoutName, scheduledDate } = await request.json();
    if (!clientEmail || !workoutId || !workoutName) return json({ error: 'clientEmail, workoutId, and workoutName are required' }, 400);
    const client = await env.DB.prepare('SELECT email FROM clients WHERE email = ? AND coachedBy = ?').bind(clientEmail, coach.email).first();
    if (!client) return json({ error: 'Client not found' }, 404);
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO scheduled_workouts (id, clientEmail, workoutId, workoutName, scheduledDate, status) VALUES (?, ?, ?, ?, ?, 'scheduled')`).bind(id, clientEmail, workoutId, workoutName, scheduledDate ?? null).run();
    return json({ message: 'Workout assigned', id }, 201);
}

async function handleMoveWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, newDate } = await request.json();
    if (!id || !newDate) return json({ error: 'id and newDate are required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return json({ error: 'newDate must be YYYY-MM-DD' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    if (workout.status === 'completed') return json({ error: 'Completed workouts cannot be moved' }, 422);
    if (newDate < todayISO()) return json({ error: 'Cannot move a workout to a past date' }, 422);
    const originalDate = workout.originalDate ?? workout.scheduledDate;
    const newStatus = (workout.status === 'skipped' || workout.status === 'missed') ? 'scheduled' : workout.status;
    await env.DB.prepare(`UPDATE scheduled_workouts SET scheduledDate = ?, originalDate = ?, status = ?, skipReason = null WHERE id = ?`).bind(newDate, originalDate, newStatus, id).run();
    return json({ message: 'Workout moved', id, newDate });
}

async function handleSkipWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, reason } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    if (workout.status === 'completed') return json({ error: 'Completed workouts cannot be skipped' }, 422);
    await env.DB.prepare(`UPDATE scheduled_workouts SET status = 'skipped', skipReason = ? WHERE id = ?`).bind(reason ?? null, id).run();
    return json({ message: 'Workout skipped', id });
}

async function handleCopyWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, newDate } = await request.json();
    if (!id || !newDate) return json({ error: 'id and newDate are required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return json({ error: 'newDate must be YYYY-MM-DD' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    const newId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO scheduled_workouts (id, clientEmail, workoutId, workoutName, scheduledDate, status, copiedFrom) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`).bind(newId, workout.clientEmail, workout.workoutId, workout.workoutName, newDate, id).run();
    return json({ message: 'Workout copied', newId, newDate }, 201);
}

async function handleScheduleComplete(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, completedAt } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare(`UPDATE scheduled_workouts SET status = 'completed', completedAt = ? WHERE id = ?`).bind(completedAt ?? new Date().toISOString(), id).run();
    return json({ message: 'Workout marked complete', id });
}

async function handleHistoryBatch(request, env) {
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
            await env.DB.prepare(`INSERT INTO history (id, dateTime, clientId, workoutId, exerciseId, set, weight, weightUnit, reps, rpe, note, syncedAt, countType, prescribed, prescribedMax, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`).bind(r.id, r.dateTime, r.clientId, r.workoutId, r.exerciseId, r.set, r.weight ?? null, r.weightUnit ?? 'lbs', r.reps ?? null, r.rpe ?? null, r.note ?? null, syncedAt, r.countType ?? null, r.prescribed ?? null, r.prescribedMax ?? null, r.unit ?? null).run();
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

        // ── Demos routes ──────────────────────────────────────────────────────

        if (method === 'GET' && pathname === '/demos/search') {
            return handleSearchDemos(request, env);
        }
        if (method === 'GET' && pathname === '/demos/unfilmed') {
            return handleGetUnfilmed(request, env);
        }
        if (method === 'POST' && pathname === '/demos') {
            return handleCreateDemo(request, env);
        }
        // PATCH /demos/:id/stream
        const streamPatchMatch = pathname.match(/^\/demos\/([^/]+)\/stream$/);
        if (method === 'PATCH' && streamPatchMatch) {
            return handleUpdateStreamId(streamPatchMatch[1], request, env);
        }
        // GET /demos/:id  (after the named sub-routes above)
        const demoGetMatch = pathname.match(/^\/demos\/([^/]+)$/);
        if (method === 'GET' && demoGetMatch) {
            return handleGetDemo(demoGetMatch[1], env);
        }

        // ── Auth routes ───────────────────────────────────────────────────────

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

        const getRoutes = {
            '/coach/clients':      handleGetClients,
            '/schedule':           handleGetSchedule,
            '/workouts/templates': handleGetTemplates,
        };

        if (method === 'POST' && postRoutes[pathname]) {
            return postRoutes[pathname](request, env);
        }
        if (method === 'GET' && getRoutes[pathname]) {
            return getRoutes[pathname](request, env);
        }
        if (method === 'GET') {
            // Fallback: treat path as workout ID
            const id = pathname.slice(1);
            if (id) return handleGetWorkout(id, env);
        }

        return new Response('Not found', { status: 404 });
    },
};