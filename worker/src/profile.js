/**
 * profile.js
 * Location: worker/src/profile.js
 *
 * Authenticated endpoints for account self-service.
 *
 * PATCH /profile/name     — update fname + lname
 * PATCH /profile/email    — change email (requires password confirmation)
 * PATCH /profile/password — change password (requires current password)
 * PATCH /profile/unit     — update unitDefault (imperial | metric)
 */

import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

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

// ─── PATCH /profile/name ──────────────────────────────────────────────────────

export async function handleUpdateName(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { fname, lname } = await request.json();

    if (!fname?.trim() || !lname?.trim()) {
        return json({ error: 'fname and lname are required' }, 400);
    }

    await env.DB.prepare(
        'UPDATE clients SET fname = ?, lname = ? WHERE email = ?'
    ).bind(fname.trim(), lname.trim(), caller.email).run();

    return json({ message: 'Name updated' });
}

// ─── PATCH /profile/email ─────────────────────────────────────────────────────

export async function handleUpdateEmail(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { newEmail, password } = await request.json();

    if (!newEmail?.trim() || !password) {
        return json({ error: 'newEmail and password are required' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
        return json({ error: 'Invalid email address' }, 400);
    }

    const normalizedNew = newEmail.trim().toLowerCase();

    // Verify current password
    const client = await env.DB.prepare(
        'SELECT pw FROM clients WHERE email = ?'
    ).bind(caller.email).first();

    if (!client) return json({ error: 'Account not found' }, 404);

    const valid = await bcrypt.compare(password, client.pw);
    if (!valid) return json({ error: 'Current password is incorrect' }, 401);

    // Check new email not already taken
    const existing = await env.DB.prepare(
        'SELECT email FROM clients WHERE email = ?'
    ).bind(normalizedNew).first();

    if (existing) return json({ error: 'That email address is already in use' }, 409);

    // Update email and invalidate all refresh tokens (force re-login)
    await env.DB.prepare(
        'UPDATE clients SET email = ? WHERE email = ?'
    ).bind(normalizedNew, caller.email).run();

    await env.DB.prepare(
        'DELETE FROM refresh_tokens WHERE client_id = ?'
    ).bind(caller.email).run();

    return json({ message: 'Email updated. Please sign in with your new email.' });
}

// ─── PATCH /profile/password ──────────────────────────────────────────────────

export async function handleUpdatePassword(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
        return json({ error: 'currentPassword and newPassword are required' }, 400);
    }

    if (newPassword.length < 8) {
        return json({ error: 'New password must be at least 8 characters' }, 400);
    }

    const client = await env.DB.prepare(
        'SELECT pw FROM clients WHERE email = ?'
    ).bind(caller.email).first();

    if (!client) return json({ error: 'Account not found' }, 404);

    const valid = await bcrypt.compare(currentPassword, client.pw);
    if (!valid) return json({ error: 'Current password is incorrect' }, 401);

    const hashed = await bcrypt.hash(newPassword, 12);

    await env.DB.prepare(
        'UPDATE clients SET pw = ? WHERE email = ?'
    ).bind(hashed, caller.email).run();

    return json({ message: 'Password updated' });
}

// ─── PATCH /profile/unit ──────────────────────────────────────────────────────

export async function handleUpdateUnit(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { unitDefault } = await request.json();

    if (unitDefault !== 'imperial' && unitDefault !== 'metric') {
        return json({ error: 'unitDefault must be "imperial" or "metric"' }, 400);
    }

    await env.DB.prepare(
        'UPDATE clients SET unitDefault = ? WHERE email = ?'
    ).bind(unitDefault, caller.email).run();

    return json({ message: 'Unit preference updated' });
}

// ─── GET /profile/notification-settings ──────────────────────────────────────

const DEFAULT_NOTIFICATION_SETTINGS = {
    new_workout:       { push: true, badge: true },
    workout_completed: { push: true, badge: true },
    workout_skipped:   { push: true, badge: true },
};

export async function handleGetNotificationSettings(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const client = await env.DB.prepare(
        'SELECT notificationSettings FROM clients WHERE email = ?'
    ).bind(caller.email).first();

    let parsed = DEFAULT_NOTIFICATION_SETTINGS;
    if (client?.notificationSettings) {
        try {
            parsed = { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(client.notificationSettings) };
        } catch {}
    }

    return json({ settings: parsed });
}

// ─── PATCH /profile/notification-settings ────────────────────────────────────

const VALID_TYPES = ['new_workout', 'workout_completed', 'workout_skipped'];

export async function handleUpdateNotificationSettings(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const { settings } = await request.json();
    if (!settings || typeof settings !== 'object') {
        return json({ error: 'settings object is required' }, 400);
    }

    // Only keep known types; each value must have push/badge booleans
    const sanitized = {};
    for (const type of VALID_TYPES) {
        if (settings[type]) {
            sanitized[type] = {
                push:  typeof settings[type].push  === 'boolean' ? settings[type].push  : true,
                badge: typeof settings[type].badge === 'boolean' ? settings[type].badge : true,
            };
        }
    }

    await env.DB.prepare(
        'UPDATE clients SET notificationSettings = ? WHERE email = ?'
    ).bind(JSON.stringify(sanitized), caller.email).run();

    return json({ message: 'Notification settings updated' });
}