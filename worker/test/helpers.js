/**
 * worker/test/helpers.js
 *
 * Shared test utilities: schema setup, data seeding, JWT creation, request builders.
 * Every test file imports from here — keeps individual test files concise.
 */

import { env } from 'cloudflare:test';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';

// ─── JWT helpers ──────────────────────────────────────────────────────────────

export const TEST_JWT_SECRET = 'test-jwt-secret-vitest';
const SECRET_BYTES = new TextEncoder().encode(TEST_JWT_SECRET);

/** Create a signed JWT for the given payload. Expires in 1 hour. */
export async function makeToken(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(SECRET_BYTES);
}

/** Shorthand tokens for the two default seeded users. */
export async function coachToken() {
    return makeToken({ sub: 'coach@example.com', email: 'coach@example.com', fname: 'Test', lname: 'Coach', isCoach: true, unitDefault: 'imperial' });
}
export async function clientToken() {
    return makeToken({ sub: 'client@example.com', email: 'client@example.com', fname: 'Test', lname: 'Client', isCoach: false, unitDefault: 'imperial' });
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

// D1's exec() only handles one statement at a time, so we run DDL individually.
const SCHEMA_STMTS = [
    `CREATE TABLE IF NOT EXISTS clients (
        email                TEXT PRIMARY KEY,
        fname                TEXT NOT NULL,
        lname                TEXT NOT NULL,
        isCoach              INTEGER NOT NULL DEFAULT 0,
        pw                   TEXT NOT NULL DEFAULT '',
        unitDefault          TEXT NOT NULL DEFAULT 'imperial',
        accessCode           TEXT UNIQUE,
        emailConfirmed       INTEGER NOT NULL DEFAULT 0,
        coachedBy            TEXT,
        timezone             TEXT DEFAULT 'UTC',
        notificationSettings TEXT DEFAULT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workouts (
        id          TEXT PRIMARY KEY,
        data        TEXT,
        workoutName TEXT,
        createdBy   TEXT,
        createdAt   TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS scheduled_workouts (
        id            TEXT PRIMARY KEY,
        clientEmail   TEXT NOT NULL,
        workoutId     TEXT NOT NULL,
        workoutName   TEXT NOT NULL,
        scheduledDate TEXT,
        status        TEXT NOT NULL DEFAULT 'scheduled',
        skipReason    TEXT,
        completedAt   TEXT,
        originalDate  TEXT,
        copiedFrom    TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS history (
        id            TEXT PRIMARY KEY,
        dateTime      TEXT,
        clientId      TEXT,
        workoutId     TEXT,
        exerciseId    TEXT,
        "set"         INTEGER,
        weight        INTEGER,
        weightUnit    TEXT,
        note          TEXT,
        rpe           REAL,
        reps          INTEGER,
        syncedAt      TEXT,
        countType     TEXT,
        prescribed    REAL,
        prescribedMax REAL,
        unit          TEXT,
        coachNotes    TEXT,
        skipped       INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
        token      TEXT PRIMARY KEY,
        client_id  TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_codes (
        client_id  TEXT PRIMARY KEY,
        code       TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notification_events (
        id                 TEXT PRIMARY KEY,
        recipientEmail     TEXT NOT NULL,
        type               TEXT NOT NULL,
        scheduledWorkoutId TEXT NOT NULL,
        payload            TEXT NOT NULL,
        createdAt          TEXT NOT NULL,
        readAt             TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS push_tokens (
        id        TEXT PRIMARY KEY,
        userEmail TEXT NOT NULL,
        token     TEXT NOT NULL UNIQUE,
        platform  TEXT,
        updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coach_exercise_notes (
        id          TEXT PRIMARY KEY,
        clientEmail TEXT NOT NULL,
        exerciseId  TEXT NOT NULL,
        note        TEXT NOT NULL,
        updatedAt   TEXT NOT NULL,
        UNIQUE(clientEmail, exerciseId)
    )`,
    `CREATE TABLE IF NOT EXISTS videos (
        id                  TEXT PRIMARY KEY,
        clientEmail         TEXT NOT NULL,
        scheduledWorkoutId  TEXT NOT NULL,
        exerciseId          TEXT NOT NULL,
        setNumber           INTEGER NOT NULL,
        historyId           TEXT,
        r2Key               TEXT NOT NULL,
        streamId            TEXT,
        uploadStatus        TEXT NOT NULL DEFAULT 'pending',
        setSnapshot         TEXT NOT NULL,
        reviewedAt          TEXT,
        createdAt           TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS video_annotations (
        id               TEXT PRIMARY KEY,
        videoId          TEXT NOT NULL,
        coachEmail       TEXT NOT NULL,
        timestampSeconds REAL NOT NULL,
        observation      TEXT,
        rootCause        TEXT,
        cue              TEXT,
        programming      TEXT,
        createdAt        TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS checkins (
        id                   TEXT PRIMARY KEY,
        clientEmail          TEXT NOT NULL,
        date                 TEXT NOT NULL,
        type                 TEXT NOT NULL,
        readiness            INTEGER,
        sleep_quality        INTEGER,
        energy               INTEGER,
        recovery             INTEGER,
        mental_focus         INTEGER,
        notes                TEXT,
        scheduled_workout_id TEXT,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(clientEmail, date, type)
    )`,
    `CREATE TABLE IF NOT EXISTS wearable_snapshots (
        id              TEXT PRIMARY KEY,
        clientEmail     TEXT NOT NULL,
        date            TEXT NOT NULL,
        source          TEXT NOT NULL,
        hrv_ms          REAL,
        resting_hr      INTEGER,
        sleep_score     REAL,
        recovery_score  REAL,
        raw_payload     TEXT,
        synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(clientEmail, date, source)
    )`,
];

const CLEAR_STMTS = [
    'DELETE FROM video_annotations',
    'DELETE FROM videos',
    'DELETE FROM checkins',
    'DELETE FROM wearable_snapshots',
    'DELETE FROM notification_events',
    'DELETE FROM push_tokens',
    'DELETE FROM history',
    'DELETE FROM coach_exercise_notes',
    'DELETE FROM scheduled_workouts',
    'DELETE FROM workouts',
    'DELETE FROM password_reset_codes',
    'DELETE FROM refresh_tokens',
    'DELETE FROM clients',
];

/** Call in beforeAll — creates tables once per test file. */
export async function setupSchema() {
    for (const sql of SCHEMA_STMTS) {
        await env.DB.prepare(sql).run();
    }
}

/** Call in beforeEach — wipes all rows so tests start clean. */
export async function clearData() {
    for (const sql of CLEAR_STMTS) {
        await env.DB.prepare(sql).run();
    }
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** Insert a coach row. Returns the inserted data. */
export async function seedCoach(overrides = {}) {
    const pw = await bcrypt.hash(overrides.password ?? 'testpassword', 4);
    const data = {
        email: 'coach@example.com',
        fname: 'Test',
        lname: 'Coach',
        isCoach: 1,
        unitDefault: 'imperial',
        emailConfirmed: 1,
        ...overrides,
        pw,
    };
    await env.DB.prepare(
        `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, emailConfirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(data.email, data.fname, data.lname, data.isCoach, data.pw, data.unitDefault, data.emailConfirmed).run();
    return data;
}

/** Insert a client row coached by coach@example.com by default. */
export async function seedClient(overrides = {}) {
    const pw = await bcrypt.hash(overrides.password ?? 'testpassword', 4);
    const data = {
        email: 'client@example.com',
        fname: 'Test',
        lname: 'Client',
        isCoach: 0,
        coachedBy: 'coach@example.com',
        unitDefault: 'imperial',
        timezone: 'UTC',
        emailConfirmed: 1,
        accessCode: null,
        ...overrides,
        pw,
    };
    await env.DB.prepare(
        `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, emailConfirmed, coachedBy, timezone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(data.email, data.fname, data.lname, data.isCoach, data.pw, data.unitDefault, data.emailConfirmed, data.coachedBy, data.timezone).run();
    return data;
}

/** Insert a pending (pre-registered) client row with an access code but no password. */
export async function seedPendingClient(overrides = {}) {
    const data = {
        email: 'pending@example.com',
        fname: '',
        lname: '',
        isCoach: 0,
        coachedBy: 'coach@example.com',
        accessCode: 'TEST-1234',
        emailConfirmed: 0,
        ...overrides,
    };
    await env.DB.prepare(
        `INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, accessCode, emailConfirmed, coachedBy)
         VALUES (?, ?, ?, ?, '', 'imperial', ?, ?, ?)`
    ).bind(data.email, data.fname, data.lname, data.isCoach, data.accessCode, data.emailConfirmed, data.coachedBy).run();
    return data;
}

/** Insert a scheduled workout row. */
export async function seedWorkout(overrides = {}) {
    const data = {
        id: 'workout-id-1',
        clientEmail: 'client@example.com',
        workoutId: 'template-id-1',
        workoutName: 'Test Workout',
        scheduledDate: '2099-12-31',
        status: 'scheduled',
        ...overrides,
    };
    await env.DB.prepare(
        `INSERT INTO scheduled_workouts (id, clientEmail, workoutId, workoutName, scheduledDate, status)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(data.id, data.clientEmail, data.workoutId, data.workoutName, data.scheduledDate, data.status).run();
    return data;
}

// ─── Request builders ─────────────────────────────────────────────────────────

const BASE = 'https://worker.test';

export function req(path, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return new Request(`${BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
}

export function post(path, body, token) {
    return req(path, { method: 'POST', body, token });
}

export function patch(path, body, token) {
    return req(path, { method: 'PATCH', body, token });
}

export function get(path, token) {
    return req(path, { method: 'GET', token });
}

/** Build a multipart/form-data POST request (for video upload). */
export function formPost(path, fields, token) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
    }
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return new Request(`${BASE}${path}`, { method: 'POST', headers, body: form });
}

/** Insert a video row. */
export async function seedVideo(overrides = {}) {
    const data = {
        id: 'video-id-1',
        clientEmail: 'client@example.com',
        scheduledWorkoutId: 'workout-id-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        historyId: null,
        r2Key: 'client@example.com/video-id-1',
        streamId: 'stream-uid-1',
        uploadStatus: 'ready',
        setSnapshot: JSON.stringify({ exerciseName: 'Back Squat', weight: 135, weightUnit: 'lbs', reps: 5, rpe: 8 }),
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
    await env.DB.prepare(
        `INSERT INTO videos (id, clientEmail, scheduledWorkoutId, exerciseId, setNumber, historyId, r2Key, streamId, uploadStatus, setSnapshot, reviewedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        data.id, data.clientEmail, data.scheduledWorkoutId, data.exerciseId,
        data.setNumber, data.historyId, data.r2Key, data.streamId,
        data.uploadStatus, data.setSnapshot, data.reviewedAt, data.createdAt
    ).run();
    return data;
}

/** Insert a video_annotation row. */
export async function seedAnnotation(overrides = {}) {
    const data = {
        id: 'annotation-id-1',
        videoId: 'video-id-1',
        coachEmail: 'coach@example.com',
        timestampSeconds: 3.5,
        observation: 'knee valgus, right',
        rootCause: 'hip, not ankle',
        cue: 'screw feet into floor',
        programming: 'add hip 90/90',
        createdAt: new Date().toISOString(),
        ...overrides,
    };
    await env.DB.prepare(
        `INSERT INTO video_annotations (id, videoId, coachEmail, timestampSeconds, observation, rootCause, cue, programming, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        data.id, data.videoId, data.coachEmail, data.timestampSeconds,
        data.observation, data.rootCause, data.cue, data.programming, data.createdAt
    ).run();
    return data;
}

/** Insert a checkin row. */
export async function seedCheckin(overrides = {}) {
    const data = {
        id: 'checkin-id-1',
        clientEmail: 'client@example.com',
        date: '2099-12-31',
        type: 'pre_workout',
        readiness: 4,
        sleep_quality: 3,
        energy: 4,
        recovery: 3,
        mental_focus: 5,
        notes: null,
        scheduled_workout_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
    await env.DB.prepare(
        `INSERT INTO checkins (id, clientEmail, date, type, readiness, sleep_quality, energy, recovery, mental_focus, notes, scheduled_workout_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        data.id, data.clientEmail, data.date, data.type,
        data.readiness, data.sleep_quality, data.energy, data.recovery, data.mental_focus,
        data.notes, data.scheduled_workout_id, data.created_at, data.updated_at
    ).run();
    return data;
}

// ─── Fetch mock ───────────────────────────────────────────────────────────────

/**
 * Stubs globalThis.fetch to succeed for Resend + Expo push calls.
 * Call in beforeEach for tests that involve email/push sending.
 * Call jest.restoreAllMocks() in afterEach.
 */
export function mockExternalFetch() {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ id: 'mocked' }), { status: 200 })
    );
}
