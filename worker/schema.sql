-- One row. There is one of you, and one notebook.
CREATE TABLE IF NOT EXISTS state (
  id      TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  payload TEXT    NOT NULL,
  updated TEXT    NOT NULL
);

-- The edit history: one row per record per save, appended by the Worker (worker/src/history.js).
-- `at` is the device's own clock in epoch ms; `local` is the same moment on the writer's
-- wall clock ("2026-10-28T15:49"), so time-of-day needs no timezone arithmetic later.
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       INTEGER NOT NULL,
  local    TEXT,
  tz       TEXT,
  key      TEXT    NOT NULL,
  kind     TEXT    NOT NULL,
  action   TEXT    NOT NULL,
  words    INTEGER NOT NULL,
  delta    INTEGER NOT NULL,
  device   TEXT,
  version  INTEGER,
  received TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
