-- Check-ins: pre-workout and rest-day subjective readiness
CREATE TABLE IF NOT EXISTS checkins (
    id                  TEXT PRIMARY KEY,
    clientEmail         TEXT NOT NULL REFERENCES clients(email) ON UPDATE CASCADE ON DELETE CASCADE,
    date                TEXT NOT NULL,
    type                TEXT NOT NULL,
    readiness           INTEGER,
    sleep_quality       INTEGER,
    energy              INTEGER,
    recovery            INTEGER,
    mental_focus        INTEGER,
    notes               TEXT,
    scheduled_workout_id TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(clientEmail, date, type)
);

CREATE INDEX IF NOT EXISTS idx_checkins_client_date ON checkins(clientEmail, date);

-- Stub table for future wearable integrations — schema ready, no UI yet
CREATE TABLE IF NOT EXISTS wearable_snapshots (
    id              TEXT PRIMARY KEY,
    clientEmail     TEXT NOT NULL REFERENCES clients(email) ON UPDATE CASCADE ON DELETE CASCADE,
    date            TEXT NOT NULL,
    source          TEXT NOT NULL,
    hrv_ms          REAL,
    resting_hr      INTEGER,
    sleep_score     REAL,
    recovery_score  REAL,
    raw_payload     TEXT,
    synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(clientEmail, date, source)
);

-- Per-client RPE display preference: 'numeric' (1–10) or 'descriptive' (Easy/Moderate/Hard → 3/6/9)
ALTER TABLE clients ADD COLUMN rpe_display TEXT NOT NULL DEFAULT 'numeric';
