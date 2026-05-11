import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '../../data/hcad.db');

let client;

export function getDb() {
  if (!client) {
    client = createClient({ url: `file:${dbPath}` });
  }
  return client;
}

export async function initDb() {
  const db = getDb();
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }

  // Soft migrations for columns added after initial schema
  const migrations = [
    'ALTER TABLE properties ADD COLUMN prior_total_value INTEGER',
    'ALTER TABLE properties ADD COLUMN nbhd_cd TEXT',
    'CREATE INDEX IF NOT EXISTS idx_properties_nbhd ON properties(nbhd_cd)',
  ];
  for (const m of migrations) {
    try { await db.execute(m); } catch { /* column already exists */ }
  }
}
