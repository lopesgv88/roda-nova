import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { config } from "./config.js";

export const db = new DatabaseSync(
  process.env.DB_PATH ?? path.join(config.dataDir, "wheelai.db"),
);

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  make_norm TEXT NOT NULL,
  model_norm TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('before','after','other')),
  file TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id);
`);

// Migração: créditos e plano por usuário (3 imagens grátis no cadastro)
const userCols = (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((c) => c.name);
if (!userCols.includes("credits")) db.exec("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 3");
if (!userCols.includes("plan")) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
if (!userCols.includes("terms_accepted_at")) db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT");
if (!userCols.includes("terms_version")) db.exec("ALTER TABLE users ADD COLUMN terms_version TEXT");
if (!userCols.includes("subscription_until")) db.exec("ALTER TABLE users ADD COLUMN subscription_until TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  before_file TEXT NOT NULL,
  after_file TEXT NOT NULL,
  color TEXT,
  finish TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  type TEXT NOT NULL,
  product_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
`);
