-- Migration 001: notification infrastructure
-- Apply with:
--   wrangler d1 execute cherry-coaching-app --file=migrations/001_notifications.sql
-- Staging:
--   wrangler d1 execute coaching-app-dev --file=migrations/001_notifications.sql

ALTER TABLE clients ADD COLUMN notificationSettings TEXT DEFAULT NULL;

CREATE TABLE notification_events (
    id                  TEXT PRIMARY KEY,
    recipientEmail      TEXT NOT NULL,
    type                TEXT NOT NULL,           -- 'new_workout' | 'workout_completed' | 'workout_skipped'
    scheduledWorkoutId  TEXT NOT NULL,
    payload             TEXT NOT NULL,           -- JSON: display context (workoutName, clientName, date, etc.)
    createdAt           TEXT NOT NULL,
    readAt              TEXT                     -- NULL = unread
);

CREATE INDEX idx_notif_recipient_unread ON notification_events(recipientEmail, readAt);
CREATE INDEX idx_notif_scheduled_workout ON notification_events(scheduledWorkoutId);

CREATE TABLE push_tokens (
    id          TEXT PRIMARY KEY,
    userEmail   TEXT NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT,                            -- 'ios' | 'android'
    updatedAt   TEXT NOT NULL
);

CREATE INDEX idx_push_tokens_user ON push_tokens(userEmail);
