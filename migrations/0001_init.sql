-- Closer accounts on Cloudflare D1. Only the Worker can reach this database
-- (through its DB binding), so there is no public key or row security to manage.
-- Times are ISO 8601 UTC text, booleans are 0/1.

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  partner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_admin INTEGER NOT NULL DEFAULT 0,
  safety_restricted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX profiles_partner_id_idx ON profiles(partner_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_profile ON sessions(profile_id);

CREATE TABLE answers (
  couple_id TEXT NOT NULL,
  card_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (couple_id, card_key, user_id)
);
CREATE INDEX answers_created_at ON answers(created_at);
CREATE INDEX answers_user ON answers(user_id);

CREATE TABLE favorites (
  couple_id TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (couple_id, question)
);

CREATE TABLE terms_acceptances (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_blocks (
  blocker TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX user_blocks_reverse ON user_blocks(blocked, blocker);

CREATE TABLE user_activity (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_active_at TEXT NOT NULL
);

-- Bumped whenever a couple's saved data is deleted, so delayed saves from a
-- room's outbox can't bring it back.
CREATE TABLE room_generations (
  couple_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0)
);

-- Receipts for saves from a room's outbox, so a retried save applies once.
CREATE TABLE room_operations (
  couple_id TEXT NOT NULL REFERENCES room_generations(couple_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  PRIMARY KEY (couple_id, generation, user_id, operation_id)
);
CREATE INDEX room_operations_user_id_idx ON room_operations(user_id);

-- Rooms of deleted accounts whose Durable Object still has to be wiped.
CREATE TABLE room_cleanup_jobs (
  couple_id TEXT PRIMARY KEY,
  queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX room_cleanup_jobs_queue ON room_cleanup_jobs(queued_at, couple_id);

-- Restricted or blocked accounts can never be linked, whatever code path links them.
CREATE TRIGGER enforce_safe_link BEFORE UPDATE OF partner_id ON profiles
WHEN NEW.partner_id IS NOT NULL AND (
  NEW.safety_restricted = 1
  OR EXISTS (SELECT 1 FROM profiles WHERE id = NEW.partner_id AND safety_restricted = 1)
  OR EXISTS (SELECT 1 FROM user_blocks WHERE (blocker = NEW.id AND blocked = NEW.partner_id) OR (blocker = NEW.partner_id AND blocked = NEW.id))
)
BEGIN
  SELECT RAISE(ABORT, 'These accounts cannot be linked.');
END;
