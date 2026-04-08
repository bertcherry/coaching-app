import { jwtVerify } from 'jose';

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function requireCoach(request, env) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) throw json({ error: 'Unauthorized' }, 401);
    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (!payload.isCoach) throw json({ error: 'Forbidden: coaches only' }, 403);
        return payload;
    } catch (err) {
        if (err instanceof Response) throw err;
        throw json({ error: 'Unauthorized' }, 401);
    }
}

/**
 * GET /demos/search?q=bench&limit=10
 * Public — used in CreateWorkout exercise search.
 * Returns id (stable), name, description, hasVideo, streamId.
 * Client uses id for workout storage; only needs streamId for video playback.
 */
export async function handleSearchDemos(request, env) {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const limit = Math.min(20, parseInt(url.searchParams.get('limit') ?? '10'));

    if (!q) return json({ exercises: [] });

    const { results } = await env.DB.prepare(`
        SELECT id, name, description, hasVideo, streamId
        FROM demos
        WHERE name LIKE ?
        ORDER BY name ASC
        LIMIT ?
    `).bind(`%${q}%`, limit).all();

    return json({ exercises: results });
}

/**
 * GET /demos/:id
 * Fetch a single exercise by stable UUID.
 * Returns streamId so the client can construct the Stream URL.
 */
export async function handleGetDemo(id, env) {
    if (!id) return json({ error: 'id required' }, 400);

    const row = await env.DB.prepare(
        'SELECT id, name, description, hasVideo, streamId FROM demos WHERE id = ? LIMIT 1'
    ).bind(id).first();

    if (!row) return json({ error: 'Exercise not found' }, 404);

    return json(row);
}

/**
 * GET /demos/unfilmed?page=1&pageSize=20&search=
 * Coach only — list exercises with no streamId.
 */
export async function handleGetUnfilmed(request, env) {
    try { await requireCoach(request, env); }
    catch (e) { return e; }

    const url = new URL(request.url);
    const page     = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1'));
    const pageSize = Math.min(50, parseInt(url.searchParams.get('pageSize') ?? '20'));
    const search   = (url.searchParams.get('search') ?? '').trim();
    const offset   = (page - 1) * pageSize;

    const searchClause = search ? 'AND name LIKE ?' : '';
    const params = [
        ...(search ? [`%${search}%`] : []),
    ];

    const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM demos WHERE hasVideo = 0 ${searchClause}`
    ).bind(...params).first();

    const total = countRow?.total ?? 0;

    const { results } = await env.DB.prepare(`
        SELECT id, name, description, hasVideo
        FROM demos
        WHERE hasVideo = 0 ${searchClause}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
    `).bind(...params, pageSize, offset).all();

    return json({ exercises: results, total, page, pageSize });
}

/**
 * POST /demos
 * Coach only — create a new exercise.
 * Body: { name, description }
 * streamId is intentionally omitted at creation time — coach films later.
 */
export async function handleCreateDemo(request, env) {
    try { await requireCoach(request, env); }
    catch (e) { return e; }

    const { name, description } = await request.json();

    if (!name?.trim()) return json({ error: 'name is required' }, 400);
    if (!description?.trim()) return json({ error: 'description is required' }, 400);

    // Check for duplicate name (case-insensitive)
    const existing = await env.DB.prepare(
        'SELECT id FROM demos WHERE lower(name) = lower(?)'
    ).bind(name.trim()).first();

    if (existing) {
        return json({ error: 'An exercise with that name already exists', existingId: existing.id }, 409);
    }

    // Generate stable UUID
    const id = crypto.randomUUID();

    await env.DB.prepare(
        'INSERT INTO demos (id, name, description, streamId, hasVideo) VALUES (?, ?, ?, NULL, 0)'
    ).bind(id, name.trim(), description.trim()).run();

    return json({ message: 'Exercise created', id, name: name.trim(), hasVideo: false }, 201);
}

/**
 * PATCH /demos/:id/stream
 * Coach only — update the Cloudflare Stream video ID for an exercise.
 * Body: { streamId }
 * This is the only operation needed when you re-upload a video to Stream.
 * All existing workout references remain valid because they use the stable id.
 */
export async function handleUpdateStreamId(id, request, env) {
    try { await requireCoach(request, env); }
    catch (e) { return e; }

    if (!id) return json({ error: 'id required' }, 400);

    const { streamId } = await request.json();

    const existing = await env.DB.prepare(
        'SELECT id FROM demos WHERE id = ?'
    ).bind(id).first();

    if (!existing) return json({ error: 'Exercise not found' }, 404);

    if (!streamId?.trim()) {
        // Clearing the stream ID (e.g. video removed)
        await env.DB.prepare(
            'UPDATE demos SET streamId = NULL, hasVideo = 0 WHERE id = ?'
        ).bind(id).run();
        return json({ message: 'Stream ID cleared', id, hasVideo: false });
    }

    await env.DB.prepare(
        'UPDATE demos SET streamId = ?, hasVideo = 1 WHERE id = ?'
    ).bind(streamId.trim(), id).run();

    return json({ message: 'Stream ID updated', id, streamId: streamId.trim(), hasVideo: true });
}