/**
 * worker/test/videos.test.js
 *
 * Tests for video endpoints:
 *   POST   /videos/upload
 *   POST   /videos/stream-webhook
 *   GET    /videos
 *   GET    /videos/review-queue
 *   GET    /videos/reviewed
 *   GET    /videos/exercise-history
 *   POST   /videos/:id/annotations
 *   GET    /videos/:id/annotations
 *   PATCH  /videos/:id/reviewed
 */

/** @jest-environment node */

import { vi } from 'vitest';
import { env } from 'cloudflare:test';
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
} from '../src/videos.js';
import {
    setupSchema, clearData,
    seedCoach, seedClient, seedWorkout, seedVideo, seedAnnotation,
    coachToken, clientToken, makeToken,
    get, post, patch, formPost,
    mockExternalFetch,
} from './helpers.js';

// Minimal video blob for upload tests
const FAKE_VIDEO = new Blob([new Uint8Array(16)], { type: 'video/mp4' });
const SNAPSHOT = JSON.stringify({ exerciseName: 'Back Squat', weight: 135, weightUnit: 'lbs', reps: 5, rpe: 8 });

// Mock VIDEOS_BUCKET on env (in-memory R2 mock)
function mockR2(successPut = true) {
    env.VIDEOS_BUCKET = {
        put: vi.fn().mockResolvedValue(successPut ? {} : Promise.reject(new Error('R2 error'))),
        get: vi.fn(),
        delete: vi.fn(),
    };
}

// Mock Stream API to return a uid
function mockStreamSuccess(uid = 'stream-test-uid') {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ result: { uid } }), { status: 200 })
    );
}

function mockStreamFailure() {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('stream error', { status: 500 })
    );
}

beforeAll(async () => { await setupSchema(); });
beforeEach(async () => {
    await clearData();
    await seedCoach();
    await seedClient();
    await seedWorkout({ id: 'workout-id-1', status: 'scheduled' });
    mockR2();
});
afterEach(() => { vi.restoreAllMocks(); });

// ─── POST /videos/upload ──────────────────────────────────────────────────────

describe('POST /videos/upload', () => {
    it('returns 401 without auth', async () => {
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', { method: 'POST', body: form }),
            env
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when required fields are missing', async () => {
        const tok = await clientToken();
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        // missing scheduledWorkoutId, exerciseId, setNumber
        const res = await handleVideoUpload(formPost('/videos/upload', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 when workout not found', async () => {
        const tok = await clientToken();
        mockStreamSuccess();
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        form.append('scheduledWorkoutId', 'ghost-workout');
        form.append('exerciseId', 'ex-1');
        form.append('setNumber', '1');
        form.append('setSnapshot', SNAPSHOT);
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tok}` },
                body: form,
            }),
            env
        );
        expect(res.status).toBe(404);
    });

    it('returns 403 when client tries to upload to another client\'s workout', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        await seedWorkout({ id: 'other-workout', clientEmail: 'other@example.com', status: 'scheduled' });
        mockStreamSuccess();
        const tok = await clientToken(); // client@example.com
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        form.append('scheduledWorkoutId', 'other-workout');
        form.append('exerciseId', 'ex-1');
        form.append('setNumber', '1');
        form.append('setSnapshot', SNAPSHOT);
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tok}` },
                body: form,
            }),
            env
        );
        expect(res.status).toBe(403);
    });

    it('creates a D1 record and returns 201 on success', async () => {
        mockStreamSuccess('uid-abc');
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        form.append('scheduledWorkoutId', 'workout-id-1');
        form.append('exerciseId', 'ex-back-squat');
        form.append('setNumber', '2');
        form.append('setSnapshot', SNAPSHOT);
        const tok = await clientToken();
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tok}` },
                body: form,
            }),
            env
        );
        expect(res.status).toBe(201);
        const { videoId, streamId, uploadStatus } = await res.json();
        expect(videoId).toBeTruthy();
        expect(streamId).toBe('uid-abc');
        expect(uploadStatus).toBe('processing');

        const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(videoId).first();
        expect(row.clientEmail).toBe('client@example.com');
        expect(row.exerciseId).toBe('ex-back-squat');
        expect(row.setNumber).toBe(2);
        expect(row.streamId).toBe('uid-abc');
        expect(row.uploadStatus).toBe('processing');
        expect(row.r2Key).toContain('client@example.com');
        expect(env.VIDEOS_BUCKET.put).toHaveBeenCalledOnce();
    });

    it('sets uploadStatus to error and still creates D1 record if Stream upload fails', async () => {
        mockStreamFailure();
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        form.append('scheduledWorkoutId', 'workout-id-1');
        form.append('exerciseId', 'ex-1');
        form.append('setNumber', '1');
        form.append('setSnapshot', SNAPSHOT);
        const tok = await clientToken();
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tok}` },
                body: form,
            }),
            env
        );
        expect(res.status).toBe(201);
        const { videoId, uploadStatus } = await res.json();
        expect(uploadStatus).toBe('error');
        const row = await env.DB.prepare('SELECT uploadStatus FROM videos WHERE id = ?').bind(videoId).first();
        expect(row.uploadStatus).toBe('error');
        expect(env.VIDEOS_BUCKET.put).toHaveBeenCalledOnce(); // R2 still saved
    });

    it('allows coach to upload on behalf of their client', async () => {
        mockStreamSuccess('uid-coach');
        const form = new FormData();
        form.append('video', FAKE_VIDEO, 'video.mp4');
        form.append('scheduledWorkoutId', 'workout-id-1');
        form.append('exerciseId', 'ex-1');
        form.append('setNumber', '1');
        form.append('setSnapshot', SNAPSHOT);
        const tok = await coachToken();
        const res = await handleVideoUpload(
            new Request('https://worker.test/videos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tok}` },
                body: form,
            }),
            env
        );
        expect(res.status).toBe(201);
    });
});

// ─── POST /videos/stream-webhook ─────────────────────────────────────────────

describe('POST /videos/stream-webhook', () => {
    beforeEach(async () => {
        await seedVideo({ uploadStatus: 'processing', streamId: 'stream-uid-1' });
        mockExternalFetch(); // for emitNotification push call
    });

    async function makeWebhookRequest(body, secret = 'test-webhook-secret') {
        const bodyStr = JSON.stringify(body);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = `${timestamp}.${bodyStr}`;
        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
        const sig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        return new Request('https://worker.test/videos/stream-webhook', {
            method: 'POST',
            headers: { 'Webhook-Signature': `time=${timestamp},sig1=${sig}` },
            body: bodyStr,
        });
    }

    it('returns 401 with invalid signature', async () => {
        const req = new Request('https://worker.test/videos/stream-webhook', {
            method: 'POST',
            headers: { 'Webhook-Signature': 'time=123,sig1=badsig' },
            body: JSON.stringify({ uid: 'stream-uid-1', status: { state: 'ready' } }),
        });
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const res = await handleStreamWebhook(req, env);
        expect(res.status).toBe(401);
    });

    it('updates uploadStatus to ready and emits notification', async () => {
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const req = await makeWebhookRequest({ uid: 'stream-uid-1', status: { state: 'ready' } });
        const res = await handleStreamWebhook(req, env);
        expect(res.status).toBe(200);

        const row = await env.DB.prepare('SELECT uploadStatus FROM videos WHERE streamId = ?').bind('stream-uid-1').first();
        expect(row.uploadStatus).toBe('ready');

        const { results } = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE recipientEmail = ? AND type = ?'
        ).bind('coach@example.com', 'video_uploaded').all();
        expect(results).toHaveLength(1);
        const payload = JSON.parse(results[0].payload);
        expect(payload.clientEmail).toBe('client@example.com');
        expect(payload.exerciseName).toBe('Back Squat');
    });

    it('updates uploadStatus to error on error state', async () => {
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const req = await makeWebhookRequest({ uid: 'stream-uid-1', status: { state: 'error' } });
        await handleStreamWebhook(req, env);
        const row = await env.DB.prepare('SELECT uploadStatus FROM videos WHERE streamId = ?').bind('stream-uid-1').first();
        expect(row.uploadStatus).toBe('error');
    });

    it('ignores intermediate states (inprogress, queued)', async () => {
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const req = await makeWebhookRequest({ uid: 'stream-uid-1', status: { state: 'inprogress' } });
        await handleStreamWebhook(req, env);
        const row = await env.DB.prepare('SELECT uploadStatus FROM videos WHERE streamId = ?').bind('stream-uid-1').first();
        expect(row.uploadStatus).toBe('processing'); // unchanged
    });

    it('ignores unknown stream UIDs gracefully', async () => {
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const req = await makeWebhookRequest({ uid: 'unknown-uid', status: { state: 'ready' } });
        const res = await handleStreamWebhook(req, env);
        expect(res.status).toBe(200);
    });

    it('does not double-process an already-ready video', async () => {
        await env.DB.prepare("UPDATE videos SET uploadStatus = 'ready' WHERE id = 'video-id-1'").run();
        env.STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
        const req = await makeWebhookRequest({ uid: 'stream-uid-1', status: { state: 'ready' } });
        await handleStreamWebhook(req, env);
        // Notification should not be emitted again
        const { results } = await env.DB.prepare(
            'SELECT * FROM notification_events WHERE type = ?'
        ).bind('video_uploaded').all();
        expect(results).toHaveLength(0);
    });
});

// ─── GET /videos ──────────────────────────────────────────────────────────────

describe('GET /videos', () => {
    beforeEach(async () => { await seedVideo(); });

    it('returns 401 without auth', async () => {
        const res = await handleGetVideos(get('/videos?scheduledWorkoutId=workout-id-1'), env);
        expect(res.status).toBe(401);
    });

    it('returns 400 when scheduledWorkoutId missing', async () => {
        const tok = await clientToken();
        const res = await handleGetVideos(get('/videos', tok), env);
        expect(res.status).toBe(400);
    });

    it('returns videos for a scheduled workout', async () => {
        const tok = await clientToken();
        const res = await handleGetVideos(get('/videos?scheduledWorkoutId=workout-id-1', tok), env);
        expect(res.status).toBe(200);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
        expect(videos[0].id).toBe('video-id-1');
        expect(videos[0].streamUrl).toContain('stream-uid-1');
        expect(videos[0].setSnapshot.exerciseName).toBe('Back Squat');
    });

    it('client cannot see another client\'s videos', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await makeToken({ sub: 'other@example.com', email: 'other@example.com', isCoach: false, fname: 'O', lname: 'T', unitDefault: 'imperial' });
        const res = await handleGetVideos(get('/videos?scheduledWorkoutId=workout-id-1', tok), env);
        expect(res.status).toBe(200);
        const { videos } = await res.json();
        expect(videos).toHaveLength(0); // filtered out
    });

    it('coach can see their client\'s videos', async () => {
        const tok = await coachToken();
        const res = await handleGetVideos(get('/videos?scheduledWorkoutId=workout-id-1', tok), env);
        expect(res.status).toBe(200);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
    });

    it('filters by exerciseId when provided', async () => {
        await seedVideo({ id: 'video-id-2', exerciseId: 'ex-other', streamId: 'stream-2', r2Key: 'k2' });
        const tok = await clientToken();
        const res = await handleGetVideos(get('/videos?scheduledWorkoutId=workout-id-1&exerciseId=ex-1', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
        expect(videos[0].exerciseId).toBe('ex-1');
    });
});

// ─── GET /videos/review-queue ─────────────────────────────────────────────────

describe('GET /videos/review-queue', () => {
    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns empty list when nothing is unreviewed', async () => {
        const tok = await coachToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        expect(res.status).toBe(200);
        const { videos } = await res.json();
        expect(videos).toHaveLength(0);
    });

    it('returns unreviewed ready videos with client name and setSnapshot', async () => {
        await seedVideo();
        const tok = await coachToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
        expect(videos[0].clientName).toBe('Test Client');
        expect(videos[0].setSnapshot.exerciseName).toBe('Back Squat');
        expect(videos[0].thumbnailUrl).toContain('stream-uid-1');
    });

    it('does not include already-reviewed videos', async () => {
        await seedVideo({ reviewedAt: new Date().toISOString() });
        const tok = await coachToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(0);
    });

    it('does not include videos still processing', async () => {
        await seedVideo({ uploadStatus: 'processing', streamId: null });
        const tok = await coachToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(0);
    });

    it('only returns videos for this coach\'s clients', async () => {
        await seedCoach({ email: 'other-coach@example.com' });
        await seedClient({ email: 'other-client@example.com', coachedBy: 'other-coach@example.com' });
        await seedWorkout({ id: 'other-workout', clientEmail: 'other-client@example.com' });
        await seedVideo({ id: 'other-video', clientEmail: 'other-client@example.com', scheduledWorkoutId: 'other-workout', r2Key: 'k2', streamId: 's2' });
        await seedVideo(); // coach@example.com's client

        const tok = await coachToken();
        const res = await handleGetReviewQueue(get('/videos/review-queue', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
        expect(videos[0].clientEmail).toBe('client@example.com');
    });
});

// ─── GET /videos/reviewed ─────────────────────────────────────────────────────

describe('GET /videos/reviewed', () => {
    beforeEach(async () => {
        await seedVideo({ reviewedAt: new Date().toISOString() });
        await seedAnnotation();
    });

    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleGetReviewed(get('/videos/reviewed', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns reviewed videos with annotations', async () => {
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed', tok), env);
        expect(res.status).toBe(200);
        const { videos } = await res.json();
        expect(videos).toHaveLength(1);
        expect(videos[0].annotations).toHaveLength(1);
        expect(videos[0].annotations[0].observation).toBe('knee valgus, right');
    });

    it('does not include unreviewed videos', async () => {
        await seedVideo({ id: 'video-id-2', reviewedAt: null, streamId: 's2', r2Key: 'k2' });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed', tok), env);
        const { videos } = await res.json();
        expect(videos.every(v => v.id !== 'video-id-2')).toBe(true);
    });

    it('filters by clientEmail', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        await seedWorkout({ id: 'w2', clientEmail: 'other@example.com' });
        await seedVideo({ id: 'v2', clientEmail: 'other@example.com', scheduledWorkoutId: 'w2', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString() });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?clientEmail=client@example.com', tok), env);
        const { videos } = await res.json();
        expect(videos.every(v => v.clientEmail === 'client@example.com')).toBe(true);
    });

    it('filters by exerciseSearch', async () => {
        await seedVideo({ id: 'v2', exerciseId: 'ex-deadlift', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString(),
            setSnapshot: JSON.stringify({ exerciseName: 'Deadlift', weight: 225, rpe: 9 }) });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?exerciseSearch=squat', tok), env);
        const { videos } = await res.json();
        expect(videos.some(v => v.id === 'video-id-1')).toBe(true);  // Back Squat matches
        expect(videos.some(v => v.id === 'v2')).toBe(false);          // Deadlift does not match
    });

    it('filters by annotationSearch across all annotation fields', async () => {
        await seedVideo({ id: 'v2', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString() });
        await seedAnnotation({ id: 'a2', videoId: 'v2', observation: 'forward lean' });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?annotationSearch=valgus', tok), env);
        const { videos } = await res.json();
        expect(videos.some(v => v.id === 'video-id-1')).toBe(true);
        expect(videos.some(v => v.id === 'v2')).toBe(false);
    });

    it('filters by hasNoAnnotation', async () => {
        await seedVideo({ id: 'v2', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString() });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?hasNoAnnotation=true', tok), env);
        const { videos } = await res.json();
        expect(videos.some(v => v.id === 'v2')).toBe(true);
        expect(videos.some(v => v.id === 'video-id-1')).toBe(false); // has annotation
    });

    it('filters by RPE range', async () => {
        await seedVideo({ id: 'v2', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString(),
            setSnapshot: JSON.stringify({ exerciseName: 'Squat', rpe: 6 }) });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?rpeMin=7', tok), env);
        const { videos } = await res.json();
        expect(videos.some(v => v.id === 'video-id-1')).toBe(true); // rpe 8
        expect(videos.some(v => v.id === 'v2')).toBe(false); // rpe 6
    });

    it('filters by dateFrom and dateTo', async () => {
        await seedVideo({ id: 'v2', r2Key: 'k2', streamId: 's2', reviewedAt: new Date().toISOString(),
            createdAt: '2020-01-01T00:00:00.000Z' });
        const tok = await coachToken();
        const res = await handleGetReviewed(get('/videos/reviewed?dateFrom=2025-01-01', tok), env);
        const { videos } = await res.json();
        expect(videos.some(v => v.id === 'v2')).toBe(false); // too old
    });
});

// ─── GET /videos/exercise-history ─────────────────────────────────────────────

describe('GET /videos/exercise-history', () => {
    beforeEach(async () => {
        await seedVideo();
        await seedAnnotation();
    });

    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleGetExerciseHistory(get('/videos/exercise-history?clientEmail=client@example.com&exerciseId=ex-1', tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 400 when params missing', async () => {
        const tok = await coachToken();
        const res = await handleGetExerciseHistory(get('/videos/exercise-history?clientEmail=client@example.com', tok), env);
        expect(res.status).toBe(400);
    });

    it('returns 404 for client not belonging to coach', async () => {
        await seedClient({ email: 'stranger@example.com', coachedBy: null });
        const tok = await coachToken();
        const res = await handleGetExerciseHistory(get('/videos/exercise-history?clientEmail=stranger@example.com&exerciseId=ex-1', tok), env);
        expect(res.status).toBe(404);
    });

    it('returns videos grouped with annotations', async () => {
        const tok = await coachToken();
        const res = await handleGetExerciseHistory(get('/videos/exercise-history?clientEmail=client@example.com&exerciseId=ex-1', tok), env);
        expect(res.status).toBe(200);
        const { videos, clientName } = await res.json();
        expect(clientName).toBe('Test Client');
        expect(videos).toHaveLength(1);
        expect(videos[0].annotations).toHaveLength(1);
        expect(videos[0].annotations[0].cue).toBe('screw feet into floor');
    });

    it('returns empty list for exercise with no videos', async () => {
        const tok = await coachToken();
        const res = await handleGetExerciseHistory(get('/videos/exercise-history?clientEmail=client@example.com&exerciseId=ex-other', tok), env);
        const { videos } = await res.json();
        expect(videos).toHaveLength(0);
    });
});

// ─── POST /videos/:id/annotations ────────────────────────────────────────────

describe('POST /videos/:id/annotations', () => {
    beforeEach(async () => { await seedVideo(); });

    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', { timestampSeconds: 1.0 }, tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 404 for unknown video', async () => {
        const tok = await coachToken();
        const res = await handleCreateAnnotation('ghost', post('/videos/ghost/annotations', { timestampSeconds: 1.0 }, tok), env);
        expect(res.status).toBe(404);
    });

    it('returns 400 when timestampSeconds missing', async () => {
        const tok = await coachToken();
        const res = await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', {}, tok), env);
        expect(res.status).toBe(400);
    });

    it('creates annotation and returns 201', async () => {
        const tok = await coachToken();
        const res = await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', {
            timestampSeconds: 3.5,
            observation: 'knee valgus',
            rootCause: 'hip restriction',
            cue: 'push knees out',
            programming: 'add clamshells',
        }, tok), env);
        expect(res.status).toBe(201);
        const { annotationId } = await res.json();
        expect(annotationId).toBeTruthy();

        const row = await env.DB.prepare('SELECT * FROM video_annotations WHERE id = ?').bind(annotationId).first();
        expect(row.videoId).toBe('video-id-1');
        expect(row.observation).toBe('knee valgus');
        expect(row.rootCause).toBe('hip restriction');
    });

    it('auto-marks video as reviewed on first annotation', async () => {
        const tok = await coachToken();
        await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', { timestampSeconds: 1.0 }, tok), env);
        const row = await env.DB.prepare('SELECT reviewedAt FROM videos WHERE id = ?').bind('video-id-1').first();
        expect(row.reviewedAt).not.toBeNull();
    });

    it('does not overwrite reviewedAt if already set', async () => {
        const original = '2025-01-01T00:00:00.000Z';
        await env.DB.prepare('UPDATE videos SET reviewedAt = ? WHERE id = ?').bind(original, 'video-id-1').run();
        const tok = await coachToken();
        await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', { timestampSeconds: 2.0 }, tok), env);
        const row = await env.DB.prepare('SELECT reviewedAt FROM videos WHERE id = ?').bind('video-id-1').first();
        expect(row.reviewedAt).toBe(original);
    });

    it('returns 403 when coach does not own the client', async () => {
        await seedCoach({ email: 'other-coach@example.com' });
        const tok = await makeToken({ sub: 'other-coach@example.com', email: 'other-coach@example.com', isCoach: true, fname: 'O', lname: 'C', unitDefault: 'imperial' });
        const res = await handleCreateAnnotation('video-id-1', post('/videos/video-id-1/annotations', { timestampSeconds: 1.0 }, tok), env);
        expect(res.status).toBe(403);
    });
});

// ─── GET /videos/:id/annotations ─────────────────────────────────────────────

describe('GET /videos/:id/annotations', () => {
    beforeEach(async () => {
        await seedVideo();
        await seedAnnotation();
    });

    it('returns 401 without auth', async () => {
        const res = await handleGetAnnotations('video-id-1', get('/videos/video-id-1/annotations'), env);
        expect(res.status).toBe(401);
    });

    it('returns 404 for unknown video', async () => {
        const tok = await coachToken();
        const res = await handleGetAnnotations('ghost', get('/videos/ghost/annotations', tok), env);
        expect(res.status).toBe(404);
    });

    it('returns 403 when non-owner client requests', async () => {
        await seedClient({ email: 'other@example.com', coachedBy: 'coach@example.com' });
        const tok = await makeToken({ sub: 'other@example.com', email: 'other@example.com', isCoach: false, fname: 'O', lname: 'T', unitDefault: 'imperial' });
        const res = await handleGetAnnotations('video-id-1', get('/videos/video-id-1/annotations', tok), env);
        expect(res.status).toBe(403);
    });

    it('client can see annotations on their own video', async () => {
        const tok = await clientToken();
        const res = await handleGetAnnotations('video-id-1', get('/videos/video-id-1/annotations', tok), env);
        expect(res.status).toBe(200);
        const { annotations } = await res.json();
        expect(annotations).toHaveLength(1);
    });

    it('returns annotations ordered by timestampSeconds', async () => {
        await seedAnnotation({ id: 'a2', timestampSeconds: 1.0, observation: 'early' });
        await seedAnnotation({ id: 'a3', timestampSeconds: 5.0, observation: 'late' });
        const tok = await coachToken();
        const res = await handleGetAnnotations('video-id-1', get('/videos/video-id-1/annotations', tok), env);
        const { annotations } = await res.json();
        expect(annotations[0].timestampSeconds).toBeLessThan(annotations[1].timestampSeconds);
    });
});

// ─── PATCH /videos/:id/reviewed ──────────────────────────────────────────────

describe('PATCH /videos/:id/reviewed', () => {
    beforeEach(async () => { await seedVideo(); });

    it('returns 403 for non-coach', async () => {
        const tok = await clientToken();
        const res = await handleMarkReviewed('video-id-1', patch('/videos/video-id-1/reviewed', {}, tok), env);
        expect(res.status).toBe(403);
    });

    it('returns 404 for unknown video', async () => {
        const tok = await coachToken();
        const res = await handleMarkReviewed('ghost', patch('/videos/ghost/reviewed', {}, tok), env);
        expect(res.status).toBe(404);
    });

    it('sets reviewedAt timestamp', async () => {
        const tok = await coachToken();
        const res = await handleMarkReviewed('video-id-1', patch('/videos/video-id-1/reviewed', {}, tok), env);
        expect(res.status).toBe(200);
        const row = await env.DB.prepare('SELECT reviewedAt FROM videos WHERE id = ?').bind('video-id-1').first();
        expect(row.reviewedAt).not.toBeNull();
    });

    it('is idempotent — does not overwrite existing reviewedAt', async () => {
        const original = '2025-01-01T00:00:00.000Z';
        await env.DB.prepare('UPDATE videos SET reviewedAt = ? WHERE id = ?').bind(original, 'video-id-1').run();
        const tok = await coachToken();
        await handleMarkReviewed('video-id-1', patch('/videos/video-id-1/reviewed', {}, tok), env);
        const row = await env.DB.prepare('SELECT reviewedAt FROM videos WHERE id = ?').bind('video-id-1').first();
        expect(row.reviewedAt).toBe(original);
    });

    it('returns 403 when coach does not own the client', async () => {
        await seedCoach({ email: 'intruder@example.com' });
        const tok = await makeToken({ sub: 'intruder@example.com', email: 'intruder@example.com', isCoach: true, fname: 'I', lname: 'C', unitDefault: 'imperial' });
        const res = await handleMarkReviewed('video-id-1', patch('/videos/video-id-1/reviewed', {}, tok), env);
        expect(res.status).toBe(403);
    });
});
