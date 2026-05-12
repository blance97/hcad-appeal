import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// If STATS_TOKEN is set, require Authorization: Bearer <token>
router.use((req, res, next) => {
  const token = process.env.STATS_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

router.get('/', async (req, res) => {
  const db = getDb();

  const [searches, views, packets, pdfs, uniqueIps, topProperties, topSearches, daily] =
    await Promise.all([
      counts(db, 'search'),
      counts(db, 'property_view'),
      counts(db, 'packet_generate'),
      counts(db, 'pdf_download'),
      db.execute(`
        SELECT
          COUNT(DISTINCT CASE WHEN ts >= datetime('now','-1 day')  THEN ip END) AS today,
          COUNT(DISTINCT CASE WHEN ts >= datetime('now','-7 days') THEN ip END) AS week,
          COUNT(DISTINCT ip) AS total
        FROM events`),
      db.execute(`
        SELECT value AS account_number, COUNT(*) AS views
        FROM events WHERE event = 'property_view'
        GROUP BY value ORDER BY views DESC LIMIT 10`),
      db.execute(`
        SELECT value AS query, COUNT(*) AS count
        FROM events WHERE event = 'search'
        GROUP BY value ORDER BY count DESC LIMIT 10`),
      db.execute(`
        SELECT date(ts) AS day, COUNT(*) AS requests,
               COUNT(DISTINCT ip) AS unique_visitors
        FROM events
        WHERE ts >= datetime('now', '-30 days')
        GROUP BY day ORDER BY day DESC`),
    ]);

  res.json({
    searches:          uniquify(searches.rows[0]),
    property_views:    uniquify(views.rows[0]),
    packets_generated: uniquify(packets.rows[0]),
    pdfs_downloaded:   uniquify(pdfs.rows[0]),
    unique_visitors:   uniquify(uniqueIps.rows[0]),
    top_properties:    topProperties.rows,
    top_searches:      topSearches.rows,
    daily_last_30:     daily.rows,
  });
});

async function counts(db, event) {
  return db.execute({
    sql: `SELECT
            SUM(CASE WHEN ts >= datetime('now','-1 day')  THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN ts >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS week,
            COUNT(*) AS total
          FROM events WHERE event = ?`,
    args: [event],
  });
}

function uniquify(row) {
  return { today: Number(row?.today || 0), week: Number(row?.week || 0), total: Number(row?.total || 0) };
}

export default router;
