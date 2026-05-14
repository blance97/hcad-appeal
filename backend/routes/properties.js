import { Router } from 'express';
import { logEvent } from '../db/events.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3) {
    return res.status(400).json({ error: 'Query must be at least 3 characters' });
  }

  const db = req.db;
  const upper = q.trim().toUpperCase();

  // Strip state abbreviations (TX, CA…) and zip codes (5-digit) from token list
  // so full-address pastes like "123 Main St Austin TX 78701" still work.
  const allTokens = upper.split(/\s+/).filter(Boolean);
  const addrTokens = allTokens.filter(t => !/^[A-Z]{2}$/.test(t) && !/^\d{5}(-\d{4})?$/.test(t));

  const buildQuery = (tokens) => {
    const conds = tokens.map(() => 'UPPER(p.address) LIKE ?').join(' AND ');
    const args  = tokens.map(t => `%${t}%`);
    return { conds, args };
  };

  const runSearch = async (tokens) => {
    const { conds, args } = buildQuery(tokens);
    const { rows } = await db.execute({
      sql: `SELECT p.account_number, p.address, p.city, p.zip, p.total_value,
                   b.sqft, b.year_built, b.beds, b.baths
            FROM properties p
            LEFT JOIN buildings b ON b.account_number = p.account_number
            WHERE (${conds})
               OR p.account_number = ?
            ORDER BY
              CASE WHEN UPPER(p.address) LIKE ? THEN 0 ELSE 1 END,
              LENGTH(p.address)
            LIMIT 10`,
      args: [...args, upper, `${tokens[0]}%`],
    });
    return rows;
  };

  // Try full token set; if city/state leftovers caused 0 results, retry with first 3 tokens
  let rows = await runSearch(addrTokens);
  if (rows.length === 0 && addrTokens.length > 3) {
    rows = await runSearch(addrTokens.slice(0, 3));
  }

  res.json(rows);
});

router.post('/log', (req, res) => {
  const { event, value } = req.body || {};
  if (event) logEvent(req, event, value ?? null);
  res.json({ ok: true });
});

router.get('/:accountNumber', async (req, res) => {
  const db = req.db;
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
  logEvent(req, 'property_view', req.params.accountNumber);
  res.json(rows[0]);
});

export default router;
