import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3) {
    return res.status(400).json({ error: 'Query must be at least 3 characters' });
  }

  const db = getDb();
  const upper = q.trim().toUpperCase();
  const tokens = upper.split(/\s+/).filter(Boolean);

  // Require every word in the query to appear in the address (AND, not OR)
  // so "1305 ASBURY" only matches addresses that have both tokens.
  const addressConditions = tokens.map(() => 'UPPER(p.address) LIKE ?').join(' AND ');
  const addressArgs = tokens.map(t => `%${t}%`);

  const { rows } = await db.execute({
    sql: `SELECT p.account_number, p.address, p.city, p.zip, p.total_value,
                 b.sqft, b.year_built, b.beds, b.baths
          FROM properties p
          LEFT JOIN buildings b ON b.account_number = p.account_number
          WHERE (${addressConditions})
             OR p.account_number = ?
          ORDER BY
            CASE WHEN UPPER(p.address) LIKE ? THEN 0 ELSE 1 END,
            LENGTH(p.address)
          LIMIT 10`,
    args: [...addressArgs, upper, `${upper}%`],
  });

  res.json(rows);
});

router.get('/:accountNumber', async (req, res) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT p.*, b.sqft, b.year_built, b.beds, b.baths, b.stories, b.condition, b.quality,
                 o.owner_name, o.mailing_address
          FROM properties p
          LEFT JOIN buildings b ON b.account_number = p.account_number
          LEFT JOIN owners o ON o.account_number = p.account_number
          WHERE p.account_number = ?`,
    args: [req.params.accountNumber],
  });

  if (!rows.length) return res.status(404).json({ error: 'Property not found' });
  res.json(rows[0]);
});

export default router;
