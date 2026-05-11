import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// Accepts either a neighborhood code (e.g. "8307.09") or a zip code as fallback
router.get('/:code', async (req, res) => {
  const db = getDb();
  const { code } = req.params;

  // Determine if this looks like a neighborhood code (contains a dot) or a zip
  const isNbhd = code.includes('.');
  const col = isNbhd ? 'p.nbhd_cd' : 'p.zip';

  const { rows } = await db.execute({
    sql: `SELECT p.total_value, p.prior_total_value, b.sqft
          FROM properties p
          JOIN buildings b ON b.account_number = p.account_number
          WHERE ${col} = ?
            AND b.sqft > 0
            AND p.total_value > 0`,
    args: [code],
  });

  if (!rows.length) return res.json({ count: 0, avg_value: 0, median_value: 0, avg_sqft: 0, median_yoy: null });

  const count = rows.length;
  const values = rows.map(r => Number(r.total_value));
  const sqfts  = rows.map(r => Number(r.sqft));

  const avg_value   = Math.round(values.reduce((a, b) => a + b, 0) / count);
  const avg_sqft    = Math.round(sqfts.reduce((a, b) => a + b, 0) / count);
  const median_value = median(values);

  const yoyValues = rows
    .filter(r => r.prior_total_value && Number(r.prior_total_value) > 0)
    .map(r => ((Number(r.total_value) - Number(r.prior_total_value)) / Number(r.prior_total_value)) * 100)
    .filter(v => v > -30 && v < 80);

  const median_yoy = yoyValues.length ? Math.round(median(yoyValues) * 10) / 10 : null;
  const avg_yoy    = yoyValues.length ? Math.round((yoyValues.reduce((a, b) => a + b, 0) / yoyValues.length) * 10) / 10 : null;

  res.json({ count, avg_value, median_value, avg_sqft, median_yoy, avg_yoy });
});

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default router;
