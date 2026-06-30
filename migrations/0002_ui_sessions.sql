CREATE TABLE IF NOT EXISTS login_challenges (
  code TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  did TEXT NOT NULL,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_did_created ON login_challenges(did, created_at);

CREATE TABLE IF NOT EXISTS web_sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  did TEXT NOT NULL,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_web_sessions_did_expires ON web_sessions(did, expires_at);
