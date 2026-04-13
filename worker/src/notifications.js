/**
 * notifications.js
 * Location: worker/src/notifications.js
 *
 * POST /notifications/push-token  — register/update a device push token
 * GET  /notifications/unread       — fetch unread event counts + IDs for in-app dots
 * PATCH /notifications/read        — mark all events for a scheduledWorkoutId as read
 *
 * Internal helper:
 *   emitNotification(db, env, opts) — create event row + send Expo push if enabled
 */

import { jwtVerify } from 'jose';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const DEFAULT_SETTINGS = {
    new_workout:       { push: true, badge: true },
    workout_completed: { push: true, badge: true },
    workout_skipped:   { push: true, badge: true },
};

function parseSettings(raw) {
    if (!raw) return DEFAULT_SETTINGS;
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function getPushContent(type, payload) {
    switch (type) {
        case 'new_workout':
            return {
                title: 'New Workout',
                body: payload.scheduledDate
                    ? `${payload.workoutName} — ${payload.scheduledDate}`
                    : payload.workoutName,
            };
        case 'workout_completed':
            return {
                title: `${payload.clientName} completed a workout`,
                body: payload.workoutName,
            };
        case 'workout_skipped':
            return {
                title: `${payload.clientName} skipped a workout`,
                body: payload.workoutName,
            };
        default:
            return { title: 'Coaching App', body: 'New activity' };
    }
}

// ─── emitNotification ─────────────────────────────────────────────────────────

/**
 * Creates a notification_events row and sends an Expo push notification
 * if the recipient has push enabled for this event type.
 *
 * @param {object} db
 * @param {object} env - Worker env bindings
 * @param {object} opts
 * @param {string} opts.recipientEmail
 * @param {'new_workout'|'workout_completed'|'workout_skipped'} opts.type
 * @param {string} opts.scheduledWorkoutId
 * @param {object} opts.payload - display context stored in the event row
 */
export async function emitNotification(db, env, { recipientEmail, type, scheduledWorkoutId, payload }) {
    // Fetch recipient's notification settings
    const client = await db.prepare(
        'SELECT notificationSettings FROM clients WHERE email = ?'
    ).bind(recipientEmail).first();

    const settings = parseSettings(client?.notificationSettings);
    const typeSettings = settings[type] ?? { push: true, badge: true };

    // Insert event row (always, regardless of push preference — drives in-app dots)
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
        `INSERT INTO notification_events (id, recipientEmail, type, scheduledWorkoutId, payload, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, recipientEmail, type, scheduledWorkoutId, JSON.stringify(payload), now).run();

    // Skip push if user has it disabled for this type
    if (!typeSettings.push) return;

    // Look up device tokens
    const { results: tokenRows } = await db.prepare(
        'SELECT token FROM push_tokens WHERE userEmail = ?'
    ).bind(recipientEmail).all();

    if (tokenRows.length === 0) return;

    // Compute badge count: count unread events where that type's badge setting is true
    let badge = 0;
    if (typeSettings.badge) {
        const { results: unreadRows } = await db.prepare(
            'SELECT type FROM notification_events WHERE recipientEmail = ? AND readAt IS NULL'
        ).bind(recipientEmail).all();

        const allSettings = parseSettings(client?.notificationSettings);
        badge = unreadRows.filter(e => (allSettings[e.type]?.badge ?? true)).length;
    }

    const { title, body } = getPushContent(type, payload);

    // Build Expo push messages (one per token)
    const messages = tokenRows.map(({ token }) => ({
        to: token,
        title,
        body,
        data: { type, scheduledWorkoutId },
        ...(typeSettings.badge ? { badge } : {}),
    }));

    // Fire and forget — don't let push failures break the API response
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
            },
            body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
        });
    } catch {}
}

// ─── POST /notifications/push-token ──────────────────────────────────────────

export async function handleRegisterPushToken(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { token, platform } = await request.json();
    if (!token) return json({ error: 'token is required' }, 400);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Upsert: if this exact token already exists, update its userEmail + timestamp
    await env.DB.prepare(
        `INSERT INTO push_tokens (id, userEmail, token, platform, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET userEmail = excluded.userEmail, platform = excluded.platform, updatedAt = excluded.updatedAt`
    ).bind(id, caller.email, token, platform ?? null, now).run();

    return json({ message: 'Push token registered' });
}

// ─── GET /notifications/unread ────────────────────────────────────────────────

/**
 * Returns:
 * {
 *   totalUnread: number,
 *   unreadWorkoutIds: string[],       // scheduledWorkoutIds with unread events for this user
 *   unreadClientEmails: string[]      // (coaches only) client emails with any unread events
 * }
 */
export async function handleGetUnread(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { results } = await env.DB.prepare(
        `SELECT scheduledWorkoutId, payload
         FROM notification_events
         WHERE recipientEmail = ? AND readAt IS NULL
         ORDER BY createdAt DESC`
    ).bind(caller.email).all();

    const unreadWorkoutIds = [...new Set(results.map(r => r.scheduledWorkoutId))];

    // For coaches: extract clientEmails from payloads so the client list can show dots
    let unreadClientEmails = [];
    if (caller.isCoach) {
        const emailSet = new Set();
        for (const row of results) {
            try {
                const p = JSON.parse(row.payload);
                if (p.clientEmail) emailSet.add(p.clientEmail);
            } catch {}
        }
        unreadClientEmails = [...emailSet];
    }

    return json({
        totalUnread: results.length,
        unreadWorkoutIds,
        unreadClientEmails,
    });
}

// ─── PATCH /notifications/read ────────────────────────────────────────────────

export async function handleMarkRead(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { scheduledWorkoutId } = await request.json();
    if (!scheduledWorkoutId) return json({ error: 'scheduledWorkoutId is required' }, 400);

    const now = new Date().toISOString();
    await env.DB.prepare(
        `UPDATE notification_events
         SET readAt = ?
         WHERE recipientEmail = ? AND scheduledWorkoutId = ? AND readAt IS NULL`
    ).bind(now, caller.email, scheduledWorkoutId).run();

    return json({ message: 'Marked as read' });
}
