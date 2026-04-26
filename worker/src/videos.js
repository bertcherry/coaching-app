/**
 * videos.js
 *
 * POST   /videos/upload                     — client uploads a set video (multipart)
 * POST   /videos/stream-webhook             — Cloudflare Stream calls this when ingest completes
 * GET    /videos                            — get videos for a scheduled workout + exercise
 * GET    /videos/review-queue              — coach: unreviewed ready videos across all clients
 * GET    /videos/reviewed                  — coach: reviewed videos with filters
 * GET    /videos/exercise-history          — coach: all videos+annotations for a client+exercise
 * POST   /videos/:id/annotations           — coach: save annotation (auto-marks reviewed)
 * GET    /videos/:id/annotations           — get annotations for a video
 * PATCH  /videos/:id/reviewed              — coach: explicitly mark video reviewed
 */

import { jwtVerify } from 'jose';
import { emitNotification } from './notifications.js';

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

async function requireCoach(request, env) {
    const payload = await requireAuth(request, env);
    if (!payload.isCoach) throw json({ error: 'Forbidden: coaches only' }, 403);
    return payload;
}

function streamPlaybackUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/manifest/video.m3u8`;
}

function streamThumbnailUrl(streamId) {
    return `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${streamId}/thumbnails/thumbnail.jpg`;
}

function attachStreamUrls(video) {
    return {
        ...video,
        setSnapshot: typeof video.setSnapshot === 'string'
            ? JSON.parse(video.setSnapshot || '{}')
            : (video.setSnapshot ?? {}),
        streamUrl: video.streamId ? streamPlaybackUrl(video.streamId) : null,
        thumbnailUrl: video.streamId ? streamThumbnailUrl(video.streamId) : null,
    };
}

// ─── Stream webhook signature verification ────────────────────────────────────

async function verifyStreamWebhook(request, env) {
    const sig = request.headers.get('Webhook-Signature') || '';
    const body = await request.text();

    const parts = {};
    for (const part of sig.split(',')) {
        const idx = part.indexOf('=');
        if (idx > 0) parts[part.slice(0, idx)] = part.slice(idx + 1);
    }

    const timestamp = parts.time;
    const signature = parts.sig1;

    if (!timestamp || !signature || !env.STREAM_WEBHOOK_SECRET) return null;

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(env.STREAM_WEBHOOK_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const sigBytes = new Uint8Array(signature.match(/.{2}/g).map(b => parseInt(b, 16)));
    const messageBytes = new TextEncoder().encode(`${timestamp}.${body}`);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, messageBytes);
    if (!valid) return null;

    try { return JSON.parse(body); } catch { return null; }
}

// ─── POST /videos/upload ──────────────────────────────────────────────────────

export async function handleVideoUpload(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }

    let formData;
    try {
        formData = await request.formData();
    } catch {
        return json({ error: 'Expected multipart/form-data' }, 400);
    }

    const file = formData.get('video');
    const scheduledWorkoutId = formData.get('scheduledWorkoutId');
    const exerciseId = formData.get('exerciseId');
    const setNumber = parseInt(formData.get('setNumber') || '0', 10);
    const historyId = formData.get('historyId') || null;
    const setSnapshotRaw = formData.get('setSnapshot') || '{}';

    if (!file || !scheduledWorkoutId || !exerciseId || !setNumber) {
        return json({ error: 'video, scheduledWorkoutId, exerciseId, and setNumber are required' }, 400);
    }

    let setSnapshot;
    try {
        setSnapshot = JSON.parse(setSnapshotRaw);
    } catch {
        return json({ error: 'setSnapshot must be valid JSON' }, 400);
    }

    const workout = await env.DB.prepare(
        'SELECT clientEmail FROM scheduled_workouts WHERE id = ?'
    ).bind(scheduledWorkoutId).first();

    if (!workout) return json({ error: 'Workout not found' }, 404);

    if (!caller.isCoach && workout.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }

    const videoId = crypto.randomUUID();
    const r2Key = `${workout.clientEmail}/${videoId}`;
    const now = new Date().toISOString();
    const contentType = file.type || 'video/mp4';

    let arrayBuffer;
    try {
        arrayBuffer = await file.arrayBuffer();
    } catch {
        return json({ error: 'Failed to read video data' }, 400);
    }

    // 1. Save to R2 (source of truth)
    try {
        await env.VIDEOS_BUCKET.put(r2Key, arrayBuffer, {
            httpMetadata: { contentType },
        });
    } catch (e) {
        console.error('[handleVideoUpload] R2 put failed:', e?.message ?? e);
        return json({ error: 'Failed to store video' }, 500);
    }

    // 2. Upload to Cloudflare Stream for playback
    let streamId = null;
    let uploadStatus = 'processing';

    try {
        const streamForm = new FormData();
        streamForm.append('file', new Blob([arrayBuffer], { type: contentType }), 'video.mp4');
        streamForm.append('meta', JSON.stringify({
            name: `[client] ${setSnapshot.exerciseName || exerciseId} - ${workout.clientEmail}`,
        }));

        const streamRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`,
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
                body: streamForm,
            }
        );

        if (streamRes.ok) {
            const { result } = await streamRes.json();
            streamId = result.uid;
        } else {
            const errText = await streamRes.text();
            console.error('[handleVideoUpload] Stream upload failed:', errText);
            uploadStatus = 'error';
        }
    } catch (e) {
        console.error('[handleVideoUpload] Stream upload error:', e?.message ?? e);
        uploadStatus = 'error';
    }

    // 3. Write D1 record — always, even if Stream failed (R2 is source of truth)
    await env.DB.prepare(
        `INSERT INTO videos (id, clientEmail, scheduledWorkoutId, exerciseId, setNumber, historyId, r2Key, streamId, uploadStatus, setSnapshot, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        videoId,
        workout.clientEmail,
        scheduledWorkoutId,
        exerciseId,
        setNumber,
        historyId,
        r2Key,
        streamId,
        uploadStatus,
        JSON.stringify(setSnapshot),
        now
    ).run();

    return json({ videoId, streamId, uploadStatus }, 201);
}

// ─── POST /videos/stream-webhook ─────────────────────────────────────────────

export async function handleStreamWebhook(request, env) {
    const data = await verifyStreamWebhook(request, env);
    if (!data) return json({ error: 'Invalid webhook signature' }, 401);

    const uid = data?.uid;
    const state = data?.status?.state; // 'ready' | 'error' | 'inprogress' | 'queued'

    if (!uid || (state !== 'ready' && state !== 'error')) return json({ ok: true });

    const video = await env.DB.prepare(
        'SELECT id, clientEmail, scheduledWorkoutId, uploadStatus, setSnapshot FROM videos WHERE streamId = ?'
    ).bind(uid).first();

    if (!video || video.uploadStatus === 'ready') return json({ ok: true });

    const newStatus = state === 'ready' ? 'ready' : 'error';
    await env.DB.prepare('UPDATE videos SET uploadStatus = ? WHERE id = ?').bind(newStatus, video.id).run();

    if (state === 'ready') {
        const client = await env.DB.prepare(
            'SELECT fname, lname, coachedBy FROM clients WHERE email = ?'
        ).bind(video.clientEmail).first();

        const setSnapshot = JSON.parse(video.setSnapshot || '{}');

        if (client?.coachedBy) {
            try {
                await emitNotification(env.DB, env, {
                    recipientEmail: client.coachedBy,
                    type: 'video_uploaded',
                    scheduledWorkoutId: video.scheduledWorkoutId,
                    payload: {
                        clientEmail: video.clientEmail,
                        clientName: `${client.fname} ${client.lname}`,
                        exerciseName: setSnapshot.exerciseName || 'exercise',
                        videoId: video.id,
                    },
                });
            } catch (e) {
                console.error('[handleStreamWebhook] emitNotification failed:', e?.message ?? e);
            }
        }
    }

    return json({ ok: true });
}

// ─── GET /videos ──────────────────────────────────────────────────────────────

export async function handleGetVideos(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }

    const url = new URL(request.url);
    const scheduledWorkoutId = url.searchParams.get('scheduledWorkoutId');
    const exerciseId = url.searchParams.get('exerciseId');

    if (!scheduledWorkoutId) return json({ error: 'scheduledWorkoutId is required' }, 400);

    const conditions = ['scheduledWorkoutId = ?'];
    const params = [scheduledWorkoutId];

    if (!caller.isCoach) {
        conditions.push('clientEmail = ?');
        params.push(caller.email);
    }
    if (exerciseId) {
        conditions.push('exerciseId = ?');
        params.push(exerciseId);
    }

    const { results } = await env.DB.prepare(
        `SELECT * FROM videos WHERE ${conditions.join(' AND ')} ORDER BY setNumber ASC`
    ).bind(...params).all();

    return json({ videos: results.map(attachStreamUrls) });
}

// ─── GET /videos/review-queue ─────────────────────────────────────────────────

export async function handleGetReviewQueue(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); } catch (e) { return e; }

    const { results } = await env.DB.prepare(
        `SELECT v.*, c.fname, c.lname
         FROM videos v
         JOIN clients c ON c.email = v.clientEmail
         WHERE c.coachedBy = ? AND v.uploadStatus = 'ready' AND v.reviewedAt IS NULL
         ORDER BY v.createdAt DESC`
    ).bind(coach.email).all();

    const videos = results.map(v => ({
        ...attachStreamUrls(v),
        clientName: `${v.fname} ${v.lname}`,
    }));

    return json({ videos });
}

// ─── GET /videos/reviewed ─────────────────────────────────────────────────────

export async function handleGetReviewed(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); } catch (e) { return e; }

    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail') || null;
    const exerciseSearch = (url.searchParams.get('exerciseSearch') || '').trim();
    const dateFrom = url.searchParams.get('dateFrom') || null;
    const dateTo = url.searchParams.get('dateTo') || null;
    const rpeMin = url.searchParams.get('rpeMin') !== null && url.searchParams.get('rpeMin') !== ''
        ? parseFloat(url.searchParams.get('rpeMin')) : null;
    const rpeMax = url.searchParams.get('rpeMax') !== null && url.searchParams.get('rpeMax') !== ''
        ? parseFloat(url.searchParams.get('rpeMax')) : null;
    const annotationSearch = (url.searchParams.get('annotationSearch') || '').trim();
    const hasNoAnnotation = url.searchParams.get('hasNoAnnotation') === 'true';

    const conditions = [`c.coachedBy = ?`, `v.uploadStatus = 'ready'`, `v.reviewedAt IS NOT NULL`];
    const params = [coach.email];

    if (clientEmail) {
        conditions.push('v.clientEmail = ?');
        params.push(clientEmail);
    }
    if (exerciseSearch) {
        conditions.push(`json_extract(v.setSnapshot, '$.exerciseName') LIKE ?`);
        params.push(`%${exerciseSearch}%`);
    }
    if (dateFrom) {
        conditions.push('v.createdAt >= ?');
        params.push(dateFrom);
    }
    if (dateTo) {
        conditions.push('v.createdAt <= ?');
        params.push(`${dateTo}T23:59:59Z`);
    }
    if (rpeMin !== null) {
        conditions.push(`CAST(json_extract(v.setSnapshot, '$.rpe') AS REAL) >= ?`);
        params.push(rpeMin);
    }
    if (rpeMax !== null) {
        conditions.push(`CAST(json_extract(v.setSnapshot, '$.rpe') AS REAL) <= ?`);
        params.push(rpeMax);
    }
    if (annotationSearch) {
        const like = `%${annotationSearch}%`;
        conditions.push(
            `EXISTS (SELECT 1 FROM video_annotations va WHERE va.videoId = v.id
             AND (va.observation LIKE ? OR va.rootCause LIKE ? OR va.cue LIKE ? OR va.programming LIKE ?))`
        );
        params.push(like, like, like, like);
    }
    if (hasNoAnnotation) {
        conditions.push(`NOT EXISTS (SELECT 1 FROM video_annotations va WHERE va.videoId = v.id)`);
    }

    const { results: videoRows } = await env.DB.prepare(
        `SELECT v.*, c.fname, c.lname FROM videos v
         JOIN clients c ON c.email = v.clientEmail
         WHERE ${conditions.join(' AND ')}
         ORDER BY v.createdAt DESC`
    ).bind(...params).all();

    if (videoRows.length === 0) return json({ videos: [] });

    // Fetch all annotations in one query then group
    const ids = videoRows.map(v => v.id);
    const { results: annotationRows } = await env.DB.prepare(
        `SELECT * FROM video_annotations WHERE videoId IN (${ids.map(() => '?').join(',')}) ORDER BY timestampSeconds ASC`
    ).bind(...ids).all();

    const annotsByVideo = {};
    for (const a of annotationRows) {
        if (!annotsByVideo[a.videoId]) annotsByVideo[a.videoId] = [];
        annotsByVideo[a.videoId].push({
            id: a.id,
            timestampSeconds: a.timestampSeconds,
            observation: a.observation,
            rootCause: a.rootCause,
            cue: a.cue,
            programming: a.programming,
            createdAt: a.createdAt,
        });
    }

    const videos = videoRows.map(v => ({
        ...attachStreamUrls(v),
        clientName: `${v.fname} ${v.lname}`,
        annotations: annotsByVideo[v.id] || [],
    }));

    return json({ videos });
}

// ─── GET /videos/exercise-history ─────────────────────────────────────────────

export async function handleGetExerciseHistory(request, env) {
    let coach;
    try { coach = await requireCoach(request, env); } catch (e) { return e; }

    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const exerciseId = url.searchParams.get('exerciseId');

    if (!clientEmail || !exerciseId) {
        return json({ error: 'clientEmail and exerciseId are required' }, 400);
    }

    const client = await env.DB.prepare(
        'SELECT fname, lname FROM clients WHERE email = ? AND coachedBy = ?'
    ).bind(clientEmail, coach.email).first();

    if (!client) return json({ error: 'Client not found' }, 404);

    const { results } = await env.DB.prepare(
        `SELECT v.*, va.id as annotationId, va.timestampSeconds, va.observation,
                va.rootCause, va.cue, va.programming, va.createdAt as annotationCreatedAt
         FROM videos v
         LEFT JOIN video_annotations va ON va.videoId = v.id
         WHERE v.clientEmail = ? AND v.exerciseId = ? AND v.uploadStatus = 'ready'
         ORDER BY v.createdAt DESC, va.timestampSeconds ASC`
    ).bind(clientEmail, exerciseId).all();

    // Group annotations under their video
    const videoMap = new Map();
    for (const row of results) {
        if (!videoMap.has(row.id)) {
            videoMap.set(row.id, {
                ...attachStreamUrls(row),
                annotations: [],
            });
        }
        if (row.annotationId) {
            videoMap.get(row.id).annotations.push({
                id: row.annotationId,
                timestampSeconds: row.timestampSeconds,
                observation: row.observation,
                rootCause: row.rootCause,
                cue: row.cue,
                programming: row.programming,
                createdAt: row.annotationCreatedAt,
            });
        }
    }

    return json({
        videos: [...videoMap.values()],
        clientName: `${client.fname} ${client.lname}`,
    });
}

// ─── POST /videos/:id/annotations ────────────────────────────────────────────

export async function handleCreateAnnotation(videoId, request, env) {
    let coach;
    try { coach = await requireCoach(request, env); } catch (e) { return e; }

    const video = await env.DB.prepare(
        'SELECT id, clientEmail FROM videos WHERE id = ?'
    ).bind(videoId).first();

    if (!video) return json({ error: 'Video not found' }, 404);

    const client = await env.DB.prepare(
        'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
    ).bind(video.clientEmail, coach.email).first();

    if (!client) return json({ error: 'Forbidden' }, 403);

    const body = await request.json();
    const { timestampSeconds, observation, rootCause, cue, programming } = body;

    if (timestampSeconds == null) return json({ error: 'timestampSeconds is required' }, 400);

    const annotationId = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(
        `INSERT INTO video_annotations (id, videoId, coachEmail, timestampSeconds, observation, rootCause, cue, programming, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        annotationId,
        videoId,
        coach.email,
        timestampSeconds,
        observation || null,
        rootCause || null,
        cue || null,
        programming || null,
        now
    ).run();

    // Auto-mark reviewed on first annotation
    await env.DB.prepare(
        'UPDATE videos SET reviewedAt = ? WHERE id = ? AND reviewedAt IS NULL'
    ).bind(now, videoId).run();

    return json({ annotationId }, 201);
}

// ─── GET /videos/:id/annotations ─────────────────────────────────────────────

export async function handleGetAnnotations(videoId, request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }

    const video = await env.DB.prepare(
        'SELECT id, clientEmail FROM videos WHERE id = ?'
    ).bind(videoId).first();

    if (!video) return json({ error: 'Video not found' }, 404);

    if (!caller.isCoach && video.clientEmail !== caller.email) {
        return json({ error: 'Forbidden' }, 403);
    }

    const { results } = await env.DB.prepare(
        'SELECT * FROM video_annotations WHERE videoId = ? ORDER BY timestampSeconds ASC'
    ).bind(videoId).all();

    return json({ annotations: results });
}

// ─── PATCH /videos/:id/reviewed ──────────────────────────────────────────────

export async function handleMarkReviewed(videoId, request, env) {
    let coach;
    try { coach = await requireCoach(request, env); } catch (e) { return e; }

    const video = await env.DB.prepare(
        'SELECT id, clientEmail FROM videos WHERE id = ?'
    ).bind(videoId).first();

    if (!video) return json({ error: 'Video not found' }, 404);

    const client = await env.DB.prepare(
        'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
    ).bind(video.clientEmail, coach.email).first();

    if (!client) return json({ error: 'Forbidden' }, 403);

    const now = new Date().toISOString();
    await env.DB.prepare(
        'UPDATE videos SET reviewedAt = ? WHERE id = ? AND reviewedAt IS NULL'
    ).bind(now, videoId).run();

    return json({ message: 'Marked as reviewed' });
}
