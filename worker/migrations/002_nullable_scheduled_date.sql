-- Migration 002: allow NULL scheduledDate for unscheduled workouts
-- Apply with:
--   wrangler d1 execute cherry-coaching-app --file=worker/migrations/002_nullable_scheduled_date.sql
-- Staging:
--   wrangler d1 execute coaching-app-dev --file=worker/migrations/002_nullable_scheduled_date.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE scheduled_workouts_new (
    id            TEXT PRIMARY KEY,
    clientEmail   TEXT NOT NULL REFERENCES clients(email),
    workoutId     TEXT NOT NULL,
    workoutName   TEXT NOT NULL,
    scheduledDate TEXT,
    status        TEXT NOT NULL DEFAULT 'scheduled',
    skipReason    TEXT,
    completedAt   TEXT,
    originalDate  TEXT,
    copiedFrom    TEXT REFERENCES scheduled_workouts_new(id)
);

INSERT INTO scheduled_workouts_new
    SELECT id, clientEmail, workoutId, workoutName, scheduledDate, status,
           skipReason, completedAt, originalDate, copiedFrom
    FROM scheduled_workouts;

DROP TABLE scheduled_workouts;

ALTER TABLE scheduled_workouts_new RENAME TO scheduled_workouts;

PRAGMA foreign_keys = ON;
