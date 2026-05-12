import { getDb } from './database.js';

export function logEvent(req, event, value) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '';
  getDb().execute({
    sql: 'INSERT INTO events (event, value, ip) VALUES (?, ?, ?)',
    args: [event, value ?? null, ip],
  }).catch(() => {}); // fire-and-forget, never block the response
}
