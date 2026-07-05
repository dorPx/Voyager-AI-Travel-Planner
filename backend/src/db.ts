import Database from 'better-sqlite3';
import NodeCache from 'node-cache';
import path from 'path';
import { randomUUID } from 'crypto';

// In the container the compiled file lives at dist/backend/src, so the
// __dirname-relative path resolves wrong; DB_PATH (set in docker-compose) wins
// there and points at the mounted volume. Local ts-node-dev keeps the fallback.
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../vacation.db');

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT,
    destination TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_usd REAL,
    trip_type TEXT,
    itinerary_json TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT,
    scraped_at INTEGER,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_key TEXT NOT NULL,
    destination TEXT NOT NULL,
    price REAL NOT NULL,
    observed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_lookup
    ON price_history (destination, hotel_key, observed_at);
`);

// share_id arrived after the first release — migrate existing DBs in place and
// give every pre-existing trip a token so old saves are shareable too.
const tripColumns = (db.prepare(`PRAGMA table_info(trips)`).all() as { name: string }[]).map((c) => c.name);
if (!tripColumns.includes('share_id')) {
  db.exec('ALTER TABLE trips ADD COLUMN share_id TEXT');
}
const unshared = db.prepare('SELECT id FROM trips WHERE share_id IS NULL').all() as { id: string }[];
if (unshared.length) {
  const backfill = db.prepare('UPDATE trips SET share_id = ? WHERE id = ?');
  for (const row of unshared) backfill.run(randomUUID(), row.id);
}

export const cache = new NodeCache({ stdTTL: 10800, checkperiod: 600 });
