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

const VALID_TYPES = ['pre_workout', 'rest_day'];
const SCALE_KEYS = ['readiness', 'sleep_quality', 'energy', 'recovery', 'mental_focus'];

function validateScale(value, key) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
        throw new Error(`${key} must be an integer between 1 and 5`);
    }
    return n;
}

export async function handleCheckinUpsert(request, env) {
    let user;
    try { user = await requireAuth(request, env); } catch (e) { return e; }
    const body = await request.json();
    const { date, type, notes, scheduled_workout_id } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: 'date is required (YYYY-MM-DD)' }, 400);
    }
    if (!VALID_TYPES.includes(type)) {
        return json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
    }

    let scales;
    try {
        scales = Object.fromEntries(SCALE_KEYS.map(k => [k, validateScale(body[k], k)]));
    } catch (e) {
        return json({ error: e.message }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
        INSERT INTO checkins (id, clientEmail, date, type, readiness, sleep_quality, energy, recovery, mental_focus, notes, scheduled_workout_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(clientEmail, date, type) DO UPDATE SET
            readiness            = excluded.readiness,
            sleep_quality        = excluded.sleep_quality,
            energy               = excluded.energy,
            recovery             = excluded.recovery,
            mental_focus         = excluded.mental_focus,
            notes                = excluded.notes,
            scheduled_workout_id = COALESCE(excluded.scheduled_workout_id, checkins.scheduled_workout_id),
            updated_at           = excluded.updated_at
    `).bind(
        id, user.email, date, type,
        scales.readiness, scales.sleep_quality, scales.energy, scales.recovery, scales.mental_focus,
        notes ?? null, scheduled_workout_id ?? null, now, now
    ).run();

    const checkin = await env.DB.prepare(
        'SELECT * FROM checkins WHERE clientEmail = ? AND date = ? AND type = ?'
    ).bind(user.email, date, type).first();

    return json(checkin, 201);
}

export async function handleCheckinToday(request, env) {
    let user;
    try { user = await requireAuth(request, env); } catch (e) { return e; }
    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail') || user.email;
    const date = url.searchParams.get('date');

    if (!date) return json({ error: 'date query param is required (YYYY-MM-DD)' }, 400);

    if (clientEmail !== user.email) {
        if (!user.isCoach) return json({ error: 'Forbidden' }, 403);
        const client = await env.DB.prepare('SELECT coachedBy FROM clients WHERE email = ?').bind(clientEmail).first();
        if (!client || client.coachedBy !== user.email) return json({ error: 'Forbidden' }, 403);
    }

    const checkin = await env.DB.prepare(
        'SELECT * FROM checkins WHERE clientEmail = ? AND date = ? AND type = ?'
    ).bind(clientEmail, date, 'pre_workout').first();

    return json(checkin ?? null);
}

export async function handleCheckinList(request, env) {
    let user;
    try { user = await requireAuth(request, env); } catch (e) { return e; }
    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let targetEmail = user.email;
    if (user.isCoach && clientEmail) {
        const client = await env.DB.prepare('SELECT coachedBy FROM clients WHERE email = ?').bind(clientEmail).first();
        if (!client || client.coachedBy !== user.email) return json({ error: 'Forbidden' }, 403);
        targetEmail = clientEmail;
    }

    let query = 'SELECT * FROM checkins WHERE clientEmail = ?';
    const params = [targetEmail];
    if (from) { query += ' AND date >= ?'; params.push(from); }
    if (to)   { query += ' AND date <= ?'; params.push(to); }
    query += ' ORDER BY date DESC, created_at DESC';

    const result = await env.DB.prepare(query).bind(...params).all();
    return json(result.results);
}
