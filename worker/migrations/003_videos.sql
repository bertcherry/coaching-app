-- Migration 003: client video uploads and coach annotations
-- Apply with:
--   wrangler d1 execute cherry-coaching-app --file=migrations/003_videos.sql
-- Staging:
--   wrangler d1 execute coaching-app-dev --file=migrations/003_videos.sql

CREATE TABLE videos (
    id                  TEXT PRIMARY KEY,
    clientEmail         TEXT NOT NULL,
    scheduledWorkoutId  TEXT NOT NULL,
    exerciseId          TEXT NOT NULL,
    setNumber           INTEGER NOT NULL,
    historyId           TEXT,                       -- links to history.id (UUID generated client-side)
    r2Key               TEXT NOT NULL,
    streamId            TEXT,                       -- NULL until Stream finishes ingesting
    uploadStatus        TEXT NOT NULL DEFAULT 'pending', -- pending | processing | ready | error
    setSnapshot         TEXT NOT NULL,              -- JSON: weight, weightUnit, reps, rpe, clientNote, coachNotes at upload time
    reviewedAt          TEXT,                       -- NULL = unreviewed; set when coach annotates or marks reviewed
    createdAt           TEXT NOT NULL
);

CREATE INDEX idx_videos_client       ON videos(clientEmail);
CREATE INDEX idx_videos_exercise     ON videos(clientEmail, exerciseId);
CREATE INDEX idx_videos_workout      ON videos(scheduledWorkoutId);
CREATE INDEX idx_videos_unreviewed   ON videos(uploadStatus, reviewedAt);
CREATE INDEX idx_videos_history      ON videos(historyId);

CREATE TABLE video_annotations (
    id                  TEXT PRIMARY KEY,
    videoId             TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    coachEmail          TEXT NOT NULL,
    timestampSeconds    REAL NOT NULL,
    observation         TEXT,
    rootCause           TEXT,
    cue                 TEXT,
    programming         TEXT,
    createdAt           TEXT NOT NULL
);

CREATE INDEX idx_annotations_video   ON video_annotations(videoId);
CREATE INDEX idx_annotations_coach   ON video_annotations(coachEmail);
