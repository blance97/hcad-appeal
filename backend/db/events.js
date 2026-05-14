export function logEvent(req, event, value) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '';
  const db = req.db;
  if (!db) return;
  db.execute({ sql: 'INSERT INTO events (event, value, ip) VALUES (?, ?, ?)', args: [event, value ?? null, ip] }).catch(() => {});
}
