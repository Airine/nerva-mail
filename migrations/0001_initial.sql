CREATE TABLE IF NOT EXISTS namespaces (
  namespace_id TEXT PRIMARY KEY,
  owner_did TEXT NOT NULL,
  relay_endpoint TEXT NOT NULL,
  did_document_hash TEXT,
  policy_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  did TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  mailbox_id TEXT NOT NULL,
  display_name TEXT,
  public_key_jwk TEXT NOT NULL,
  service_endpoint TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  recipient_dids TEXT NOT NULL,
  thread TEXT,
  body_object_key TEXT NOT NULL,
  postage_credits INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  cursor TEXT NOT NULL,
  priority_score INTEGER NOT NULL DEFAULT 100,
  postage_credits INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  lease_until INTEGER,
  acked_at INTEGER,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(message_id)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_mailbox_cursor ON deliveries(mailbox_id, cursor);
CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id);

CREATE TABLE IF NOT EXISTS credit_accounts (
  did TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  llm_token_quota INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_entries (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  bucket TEXT NOT NULL,
  message_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_entries_did_created ON credit_entries(did, created_at);

CREATE TABLE IF NOT EXISTS postage_holds (
  message_id TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  recipient_did TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, sender_did)
);

CREATE TABLE IF NOT EXISTS blob_uploads (
  id TEXT PRIMARY KEY,
  owner_did TEXT NOT NULL,
  cid TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size INTEGER,
  media_type TEXT,
  created_at INTEGER NOT NULL
);
