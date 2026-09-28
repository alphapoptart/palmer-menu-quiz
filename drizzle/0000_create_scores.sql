CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  menu_focus TEXT NOT NULL,
  question_type TEXT NOT NULL,
  round_length TEXT NOT NULL,
  missed_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  question_ids TEXT NOT NULL DEFAULT '[]',
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_created_at
ON scores(created_at);

CREATE INDEX IF NOT EXISTS idx_scores_player_name
ON scores(player_name);

CREATE INDEX IF NOT EXISTS idx_scores_percent
ON scores(percent);

PRAGMA optimize;
