-- One row. There is one of you, and one notebook.
CREATE TABLE IF NOT EXISTS state (
  id      TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  payload TEXT    NOT NULL,
  updated TEXT    NOT NULL
);
