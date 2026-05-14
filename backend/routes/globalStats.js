import { Router } from 'express';
import { COUNTIES } from '../counties.js';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (_req, res) => {
  const countyIds = Object.keys(COUNTIES);

  const results = await Promise.all(countyIds.map(async countyId => {
    const db = getDb(countyId);
    const county = COUNTIES[countyId];

    const [searches, views, packets, pdfs, uniqueIps, topSearches, topProperties, daily, dbStats] = await Promise.all([
      counts(db, 'search'),
      counts(db, 'property_view'),
      counts(db, 'packet_generate'),
      counts(db, 'pdf_download'),
      db.execute(`SELECT
        COUNT(DISTINCT CASE WHEN ts >= datetime('now','-1 day')  THEN ip END) AS today,
        COUNT(DISTINCT CASE WHEN ts >= datetime('now','-7 days') THEN ip END) AS week,
        COUNT(DISTINCT ip) AS total
        FROM events`),
      db.execute(`SELECT value AS query, COUNT(*) AS count FROM events WHERE event = 'search' GROUP BY value ORDER BY count DESC LIMIT 10`),
      db.execute(`SELECT value AS account_number, COUNT(*) AS views FROM events WHERE event = 'property_view' GROUP BY value ORDER BY views DESC LIMIT 10`),
      db.execute(`SELECT date(ts) AS day, COUNT(*) AS requests, COUNT(DISTINCT ip) AS unique_visitors FROM events WHERE ts >= datetime('now', '-30 days') GROUP BY day ORDER BY day DESC`),
      db.execute(`SELECT COUNT(*) AS property_count, CAST(AVG(total_value) AS INTEGER) AS avg_value FROM properties WHERE total_value > 0`),
    ]);

    return {
      countyId,
      cad_name: county.cad_name,
      county_name: county.county_name,
      searches: uniquify(searches.rows[0]),
      property_views: uniquify(views.rows[0]),
      packets_generated: uniquify(packets.rows[0]),
      pdfs_downloaded: uniquify(pdfs.rows[0]),
      unique_visitors: uniquify(uniqueIps.rows[0]),
      top_searches: topSearches.rows,
      top_properties: topProperties.rows,
      daily_last_30: daily.rows,
      db: { property_count: Number(dbStats.rows[0]?.property_count || 0), avg_value: Number(dbStats.rows[0]?.avg_value || 0) },
    };
  }));

  const combined = {
    searches: sumMetric(results, 'searches'),
    property_views: sumMetric(results, 'property_views'),
    packets_generated: sumMetric(results, 'packets_generated'),
    pdfs_downloaded: sumMetric(results, 'pdfs_downloaded'),
    unique_visitors: sumMetric(results, 'unique_visitors'),
  };

  res.json({ counties: results, combined });
});

function counts(db, event) {
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

function sumMetric(results, key) {
  return {
    today: results.reduce((s, r) => s + r[key].today, 0),
    week:  results.reduce((s, r) => s + r[key].week, 0),
    total: results.reduce((s, r) => s + r[key].total, 0),
  };
}

export default router;
