-- The preference centre is the source of truth for who is subscribed to what.
-- Adestra only receives changes via the outbox.

CREATE TABLE contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ui_lang     TEXT NOT NULL DEFAULT 'en',
  -- 'active' | 'bounced' | 'complained'. Bounced/complained contacts must re-confirm.
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per contact per edition (a topic in one language, e.g. 'tax-en').
CREATE TABLE subscriptions (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  edition_id  TEXT NOT NULL,
  -- 'active' | 'unsubscribed'
  status      TEXT NOT NULL,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contact_id, edition_id)
);

-- Append-only evidence of consent: what was asked, what was confirmed, where and when.
CREATE TABLE consent_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  -- 'requested' | 'confirmed' | 'subscribed' | 'unsubscribed' | 'signin_requested' | 'signed_in'
  action      TEXT NOT NULL,
  edition_ids TEXT NOT NULL DEFAULT '[]',
  source      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX consent_events_email ON consent_events(email);

-- Changes waiting to be pushed to Adestra, retried until they succeed.
CREATE TABLE outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  edition_id   TEXT NOT NULL,
  -- 'subscribe' | 'unsubscribe'
  action       TEXT NOT NULL,
  -- 'pending' | 'done' | 'failed'
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  request_log  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);
CREATE INDEX outbox_pending ON outbox(status, id);

-- Prototype only: emails we would have sent, viewable at /dev/mailbox.
CREATE TABLE dev_mail (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
