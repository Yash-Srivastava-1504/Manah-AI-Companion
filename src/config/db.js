'use strict';
const path = require('path');
const fs   = require('fs');

// Node.js 22.5+ built-in SQLite — no native compilation needed.
// In Node 22 this needed --experimental-sqlite; Node 23.4+ it is stable.
// Node 24 ships it fully stable.
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || './data/manah.db';

// Ensure data directory exists (skip for :memory: databases used in tests)
if (DB_PATH !== ':memory:') {
  const dbDir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

let db;

function initDB() {
  const location = DB_PATH === ':memory:' ? ':memory:' : path.resolve(DB_PATH);
  db = new DatabaseSync(location);

  // Enable WAL mode and foreign keys
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Run migrations — idempotent (IF NOT EXISTS everywhere)
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL DEFAULT 'User',
      language      TEXT    NOT NULL DEFAULT 'hinglish',
      tone          TEXT    NOT NULL DEFAULT 'friend',
      avatar        TEXT    NOT NULL DEFAULT '🙂',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL DEFAULT 'New Conversation',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      last_message_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender      TEXT    NOT NULL CHECK(sender IN ('user','assistant')),
      text        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    -- Memory (conversation summaries)
    CREATE TABLE IF NOT EXISTS memory (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id  INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      summary     TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memory_user ON memory(user_id);

    -- Moods table
    CREATE TABLE IF NOT EXISTS moods (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        TEXT    NOT NULL,
      level       INTEGER NOT NULL CHECK(level BETWEEN 0 AND 4),
      note        TEXT,
      tags        TEXT    DEFAULT '[]'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_moods_user_date ON moods(user_id, date);

    -- Per-user settings
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme         TEXT    NOT NULL DEFAULT 'light',
      notifications INTEGER NOT NULL DEFAULT 1,
      notif_time    TEXT    NOT NULL DEFAULT 'evening',
      companion     TEXT    NOT NULL DEFAULT 'friend',
      anonymous     INTEGER NOT NULL DEFAULT 0,
      weekly_report INTEGER NOT NULL DEFAULT 1
    );

    -- Audit / action logs
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT    NOT NULL,
      detail      TEXT    DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_user   ON logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);

    -- Refresh token store
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT    UNIQUE NOT NULL,
      expires_at  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
  `);

  if (DB_PATH !== ':memory:') {
    console.log('[DB] SQLite initialised at', path.resolve(DB_PATH));
  }
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialised. Call initDB() first.');
  return db;
}

module.exports = { initDB, getDB };
