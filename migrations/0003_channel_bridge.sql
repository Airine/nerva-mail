CREATE TABLE IF NOT EXISTS channel_identity (
  synthetic_did TEXT PRIMARY KEY,
  transport TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (transport, external_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_identity_external ON channel_identity(transport, external_id);

CREATE TABLE IF NOT EXISTS channel_thread (
  nmail_thread TEXT PRIMARY KEY,
  transport TEXT NOT NULL,
  external_thread_id TEXT NOT NULL,
  agent_did TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (transport, external_thread_id, agent_did)
);

CREATE INDEX IF NOT EXISTS idx_channel_thread_external ON channel_thread(transport, external_thread_id, agent_did);

CREATE TABLE IF NOT EXISTS channel_binding (
  id TEXT PRIMARY KEY,
  owner_did TEXT NOT NULL,
  transport TEXT NOT NULL,
  workspace_or_chat TEXT NOT NULL,
  agent_did TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_did, transport, workspace_or_chat, agent_did)
);

CREATE INDEX IF NOT EXISTS idx_channel_binding_owner ON channel_binding(owner_did);
CREATE INDEX IF NOT EXISTS idx_channel_binding_agent ON channel_binding(agent_did);
