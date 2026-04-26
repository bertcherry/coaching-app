import { jwtVerify } from 'jose';
import { handleLogin, handleRegister, handleRefresh, handleLogout, handleForgotPassword, handleResetPassword } from './auth-worker';
import { handleAddClient, handleGetClients } from './coach';
import {
    handleSearchDemos,
    handleGetDemo,
    handleGetUnfilmed,
    handleGetAllDemos,
    handleCreateDemo,
    handleUpdateDemo,
    handleUpdateStreamId,
    handleGetStreamUploadUrl,
} from './demos';
import { handleHistoryBatch, handleExerciseSummary, handleWorkoutHistory } from './history';
import { handleUpdateName, handleUpdateEmail, handleUpdatePassword, handleUpdateUnit, handleUpdateNotificationSettings, handleGetNotificationSettings } from './profile';
import { handleGetSchedule } from './schedule';
import { emitNotification, handleRegisterPushToken, handleGetUnread, handleMarkRead } from './notifications';
import { handleCheckinUpsert, handleCheckinToday, handleCheckinList } from './checkins';
import { handleGetClientProfile, handlePatchClientProfile, handleGetMovementPatterns } from './clientProfile';
import {
    handleVideoUpload,
    handleStreamWebhook,
    handleGetVideos,
    handleGetReviewQueue,
    handleGetReviewed,
    handleGetExerciseHistory,
    handleCreateAnnotation,
    handleGetAnnotations,
    handleMarkReviewed,
} from './videos';

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

function todayForTimezone(tz) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
        return new Date().toISOString().split('T')[0]; // UTC fallback
    }
}

// ─── Workout handlers (unchanged) ─────────────────────────────────────────────

export async function handleSaveWorkout(request, env) {
    try { await requireAuth(request, env); } catch (e) { return e; }
    const body = await request.json();
    const { id, workoutName, createdBy, data } = body;
    if (!id || !data) return json({ error: 'id and data are required' }, 400);
    const success = (await env.DB.prepare(
        'INSERT OR REPLACE INTO workouts (id, data, workoutName, createdBy) VALUES (?, ?, ?, ?)'
    ).bind(id, JSON.stringify(data), workoutName ?? null, createdBy ?? null).run()).success;
    if (!success) return json({ error: 'Failed to save workout' }, 400);
    await env.DB.prepare(
        'UPDATE scheduled_workouts SET workoutName = ? WHERE workoutId = ?'
    ).bind(workoutName ?? null, id).run();
    return json({ message: 'Workout saved', id });
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

// ─── Schedule handlers  ───────────────────────────────────────────

export async function handleAssignWorkout(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); }
    catch (e) { return e; }
 
    const { clientEmail, workoutId, workoutName, scheduledDate } = await request.json();
 
    if (!clientEmail || !workoutId || !workoutName) {
        return json({ error: 'clientEmail, workoutId, and workoutName are required' }, 400);
    }
 
    // Verify the client belongs to this coach
    const client = await env.DB.prepare(
        'SELECT email, timezone FROM clients WHERE email = ? AND coachedBy = ?'
    ).bind(clientEmail, coach.email).first();
 
    if (!client) return json({ error: 'Client not found' }, 404);
 
    // If a date was provided, validate format and that it hasn't passed.
    // Accepts YYYY-MM-DD (specific date) or YYYY-MM (month-only, unscheduled).
    // This is the authoritative check — the UI check is for UX only.
    if (scheduledDate) {
        const isFullDate  = /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate);
        const isMonthOnly = /^\d{4}-\d{2}$/.test(scheduledDate);

        if (!isFullDate && !isMonthOnly) {
            return json({ error: 'scheduledDate must be YYYY-MM-DD or YYYY-MM' }, 400);
        }

        const clientTimezone  = client.timezone ?? 'UTC';
        const clientToday     = todayForTimezone(clientTimezone);
        const clientThisMonth = clientToday.substring(0, 7);

        if (isFullDate && scheduledDate < clientToday) {
            return json({
                error: `Cannot schedule a workout on ${scheduledDate} — that date has already passed for this client (their current date is ${clientToday} in ${clientTimezone}).`
            }, 422);
        }

        if (isMonthOnly && scheduledDate < clientThisMonth) {
            return json({
                error: `Cannot assign a workout to ${scheduledDate} — that month has already passed for this client (their current month is ${clientThisMonth} in ${clientTimezone}).`
            }, 422);
        }
    }
 
    const id = crypto.randomUUID();
    try {
        await env.DB.prepare(
            `INSERT INTO scheduled_workouts (id, clientEmail, workoutId, workoutName, scheduledDate, status)
             VALUES (?, ?, ?, ?, ?, 'scheduled')`
        ).bind(id, clientEmail, workoutId, workoutName, scheduledDate ?? null).run();
    } catch (e) {
        console.error('[handleAssignWorkout] INSERT failed:', e?.message ?? e, { clientEmail, workoutId, scheduledDate });
        return json({ error: `Failed to schedule workout: ${e?.message ?? 'unknown error'}` }, 500);
    }

    try {
        await emitNotification(env.DB, env, {
            recipientEmail: clientEmail,
            type: 'new_workout',
            scheduledWorkoutId: id,
            payload: {
                workoutName,
                scheduledDate: scheduledDate ?? null,
                coachName: `${coach.fname} ${coach.lname}`,
            },
        });
    } catch (e) {
        console.error('[handleAssignWorkout] emitNotification failed:', e?.message ?? e);
    }

    return json({ message: 'Workout assigned', id }, 201);
}

export async function handleMoveWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, newDate, today } = await request.json();
    if (!id || !newDate || !today) return json({ error: 'id, newDate, and today are required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return json({ error: 'newDate must be YYYY-MM-DD' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    if (workout.status === 'completed') return json({ error: 'Completed workouts cannot be moved' }, 422);
    if (newDate < today) return json({ error: 'Cannot move a workout to a past date' }, 422);
    const originalDate = workout.originalDate ?? workout.scheduledDate;
    const newStatus = (workout.status === 'skipped' || workout.status === 'missed') ? 'scheduled' : workout.status;
    await env.DB.prepare(`UPDATE scheduled_workouts SET scheduledDate = ?, originalDate = ?, status = ?, skipReason = null WHERE id = ?`).bind(newDate, originalDate, newStatus, id).run();
    return json({ message: 'Workout moved', id, newDate });
}

export async function handleSkipWorkout(request, env) {
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

    const clientRecord = await env.DB.prepare(
        'SELECT fname, lname, coachedBy FROM clients WHERE email = ?'
    ).bind(workout.clientEmail).first();
    if (clientRecord?.coachedBy) {
        try {
            await emitNotification(env.DB, env, {
                recipientEmail: clientRecord.coachedBy,
                type: 'workout_skipped',
                scheduledWorkoutId: id,
                payload: {
                    workoutName: workout.workoutName,
                    scheduledDate: workout.scheduledDate,
                    clientEmail: workout.clientEmail,
                    clientName: `${clientRecord.fname} ${clientRecord.lname}`,
                    skipReason: reason ?? null,
                },
            });
        } catch (e) {
            console.error('[handleSkipWorkout] emitNotification failed:', e?.message ?? e);
        }
    }

    return json({ message: 'Workout skipped', id });
}

export async function handleCopyWorkout(request, env) {
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

export async function handleScheduleComplete(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id, completedAt } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare(`UPDATE scheduled_workouts SET status = 'completed', completedAt = ? WHERE id = ?`).bind(completedAt ?? new Date().toISOString(), id).run();

    const clientRecord = await env.DB.prepare(
        'SELECT fname, lname, coachedBy FROM clients WHERE email = ?'
    ).bind(workout.clientEmail).first();
    if (clientRecord?.coachedBy) {
        try {
            await emitNotification(env.DB, env, {
                recipientEmail: clientRecord.coachedBy,
                type: 'workout_completed',
                scheduledWorkoutId: id,
                payload: {
                    workoutName: workout.workoutName,
                    scheduledDate: workout.scheduledDate,
                    clientEmail: workout.clientEmail,
                    clientName: `${clientRecord.fname} ${clientRecord.lname}`,
                },
            });
        } catch (e) {
            console.error('[handleScheduleComplete] emitNotification failed:', e?.message ?? e);
        }
    }

    return json({ message: 'Workout marked complete', id });
}

export async function handleDeleteWorkout(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }
    const { id } = await request.json();
    if (!id) return json({ error: 'id is required' }, 400);
    const workout = await env.DB.prepare('SELECT * FROM scheduled_workouts WHERE id = ?').bind(id).first();
    if (!workout) return json({ error: 'Workout not found' }, 404);
    if (!caller.isCoach && workout.clientEmail !== caller.email) return json({ error: 'Forbidden' }, 403);
    if (workout.status === 'completed') return json({ error: 'Completed workouts cannot be deleted' }, 422);
    await env.DB.prepare('DELETE FROM scheduled_workouts WHERE id = ?').bind(id).run();
    return json({ message: 'Workout deleted', id });
}

// ─── Main router ──────────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        const url      = new URL(request.url);
        const method   = request.method;
        const pathname = url.pathname;

        // ── Client profile routes ─────────────────────────────────────────────

        const clientProfileMatch = pathname.match(/^\/clients\/([^/]+)\/profile$/);
        if (method === 'GET' && clientProfileMatch) {
            return handleGetClientProfile(decodeURIComponent(clientProfileMatch[1]), request, env);
        }
        if (method === 'PATCH' && clientProfileMatch) {
            return handlePatchClientProfile(decodeURIComponent(clientProfileMatch[1]), request, env);
        }
        if (method === 'GET' && pathname === '/movement-patterns') {
            return handleGetMovementPatterns(request, env);
        }

        // ── Demos routes ──────────────────────────────────────────────────────

        if (method === 'GET' && pathname === '/demos/search') {
            return handleSearchDemos(request, env);
        }
        if (method === 'GET' && pathname === '/demos/unfilmed') {
            return handleGetUnfilmed(request, env);
        }
        if (method === 'GET' && pathname === '/demos') {
            return handleGetAllDemos(request, env);
        }
        if (method === 'POST' && pathname === '/demos') {
            return handleCreateDemo(request, env);
        }
        // POST /demos/:id/stream-upload-url
        const streamUploadUrlMatch = pathname.match(/^\/demos\/([^/]+)\/stream-upload-url$/);
        if (method === 'POST' && streamUploadUrlMatch) {
            return handleGetStreamUploadUrl(streamUploadUrlMatch[1], request, env);
        }
        // PATCH /demos/:id/stream
        const streamPatchMatch = pathname.match(/^\/demos\/([^/]+)\/stream$/);
        if (method === 'PATCH' && streamPatchMatch) {
            return handleUpdateStreamId(streamPatchMatch[1], request, env);
        }
        // PATCH /demos/:id (update name/description)
        const demoPatchMatch = pathname.match(/^\/demos\/([^/]+)$/);
        if (method === 'PATCH' && demoPatchMatch) {
            return handleUpdateDemo(demoPatchMatch[1], request, env);
        }
        // GET /demos/:id  (after the named sub-routes above)
        const demoGetMatch = pathname.match(/^\/demos\/([^/]+)$/);
        if (method === 'GET' && demoGetMatch) {
            return handleGetDemo(demoGetMatch[1], env);
        }

        // ── Video routes ──────────────────────────────────────────────────────

        if (method === 'POST' && pathname === '/videos/upload') {
            return handleVideoUpload(request, env);
        }
        if (method === 'POST' && pathname === '/videos/stream-webhook') {
            return handleStreamWebhook(request, env);
        }
        if (method === 'GET' && pathname === '/videos/review-queue') {
            return handleGetReviewQueue(request, env);
        }
        if (method === 'GET' && pathname === '/videos/reviewed') {
            return handleGetReviewed(request, env);
        }
        if (method === 'GET' && pathname === '/videos/exercise-history') {
            return handleGetExerciseHistory(request, env);
        }
        if (method === 'GET' && pathname === '/videos') {
            return handleGetVideos(request, env);
        }
        // POST /videos/:id/annotations
        const videoAnnotationsPostMatch = pathname.match(/^\/videos\/([^/]+)\/annotations$/);
        if (method === 'POST' && videoAnnotationsPostMatch) {
            return handleCreateAnnotation(videoAnnotationsPostMatch[1], request, env);
        }
        // GET /videos/:id/annotations
        const videoAnnotationsGetMatch = pathname.match(/^\/videos\/([^/]+)\/annotations$/);
        if (method === 'GET' && videoAnnotationsGetMatch) {
            return handleGetAnnotations(videoAnnotationsGetMatch[1], request, env);
        }
        // PATCH /videos/:id/reviewed
        const videoReviewedMatch = pathname.match(/^\/videos\/([^/]+)\/reviewed$/);
        if (method === 'PATCH' && videoReviewedMatch) {
            return handleMarkReviewed(videoReviewedMatch[1], request, env);
        }

        // ── Auth routes ───────────────────────────────────────────────────────

        const patchRoutes = {
            '/profile/name':                     handleUpdateName,
            '/profile/email':                    handleUpdateEmail,
            '/profile/password':                 handleUpdatePassword,
            '/profile/unit':                     handleUpdateUnit,
            '/profile/notification-settings':    handleUpdateNotificationSettings,
            '/notifications/read':               handleMarkRead,
        }

        const postRoutes = {
            '/auth/login':                handleLogin,
            '/auth/register':             handleRegister,
            '/auth/refresh':              handleRefresh,
            '/auth/logout':               handleLogout,
            '/auth/forgot-password':      handleForgotPassword,
            '/auth/reset-password':       handleResetPassword,
            '/coach/add-client':          handleAddClient,
            '/schedule/assign':           handleAssignWorkout,
            '/schedule/move':             handleMoveWorkout,
            '/schedule/skip':             handleSkipWorkout,
            '/schedule/copy':             handleCopyWorkout,
            '/schedule/complete':         handleScheduleComplete,
            '/schedule/delete':           handleDeleteWorkout,
            '/history/batch':             handleHistoryBatch,
            '/workouts/save':             handleSaveWorkout,
            '/notifications/push-token':  handleRegisterPushToken,
            '/checkins':                  handleCheckinUpsert,
        };

        const getRoutes = {
            '/coach/clients':                        handleGetClients,
            '/schedule':                             handleGetSchedule,
            '/workouts/templates':                   handleGetTemplates,
            '/history/exercise-summary':             handleExerciseSummary,
            '/history/workout':                      handleWorkoutHistory,
            '/notifications/unread':                 handleGetUnread,
            '/profile/notification-settings':        handleGetNotificationSettings,
            '/checkins/today':                       handleCheckinToday,
            '/checkins':                             handleCheckinList,
        };

        if (method === 'PATCH' && patchRoutes[pathname]) {
            return patchRoutes[pathname](request, env);
        }
        if (method === 'POST'  && postRoutes[pathname]) {
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