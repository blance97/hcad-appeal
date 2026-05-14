import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import { COUNTIES } from '../counties.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clients = new Map();

export function getDb(countyId) {
  if (!clients.has(countyId)) {
    const county = COUNTIES[countyId];
    if (!county) throw new Error(`Unknown county: ${countyId}`);
    clients.set(countyId, createClient({ url: `file:${county.db_path}` }));
  }
  return clients.get(countyId);
}

export async function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  const migrations = [
    'ALTER TABLE properties ADD COLUMN prior_total_value INTEGER',
    'ALTER TABLE properties ADD COLUMN nbhd_cd TEXT',
    'CREATE INDEX IF NOT EXISTS idx_properties_nbhd ON properties(nbhd_cd)',
    `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, value TEXT, ip TEXT, ts TEXT DEFAULT (datetime('now')))`,
    'CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)',
    'CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)',
  ];
  for (const county of Object.values(COUNTIES)) {
    const db = getDb(county.id);
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA foreign_keys = ON');
    for (const stmt of statements) { await db.execute(stmt); }
    for (const m of migrations) { try { await db.execute(m); } catch {} }
  }
}
