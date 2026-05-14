import { Router } from 'express';

const router = Router();

router.get('/:accountNumber', async (req, res) => {
  const db = req.db;
  const acct = req.params.accountNumber;

  const { rows: subjectRows } = await db.execute({
    sql: `SELECT p.account_number, p.address, p.zip, p.nbhd_cd, p.total_value, p.prior_total_value,
                 b.sqft, b.year_built, b.beds, b.baths
          FROM properties p
          JOIN buildings b ON b.account_number = p.account_number
          WHERE p.account_number = ?`,
    args: [acct],
  });

  if (!subjectRows.length) return res.status(404).json({ error: 'Property not found' });
  const subject = subjectRows[0];
  if (!subject.sqft) return res.status(422).json({ error: 'No building data for this property' });

  const sqftMin = Math.floor(subject.sqft * 0.8);
  const sqftMax = Math.ceil(subject.sqft * 1.2);
  const yearMin = subject.year_built - 10;
  const yearMax = subject.year_built + 10;

  const streetName = subject.address.replace(/^\d+(?:\s+\d+\/\d+)?\s+/, '').trim();

  // 1. Same-street comps — strongest evidence, capped at 5, one per address
  const { rows: streetComps } = await db.execute({
    sql: `SELECT p.account_number, p.address, p.zip, p.total_value,
                 b.sqft, b.year_built, b.beds, b.baths,
                 ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
          FROM properties p
          JOIN buildings b ON b.account_number = p.account_number
          WHERE TRIM(SUBSTR(p.address, INSTR(p.address, ' ') + 1)) = ?
            AND p.account_number != ?
            AND b.sqft BETWEEN ? AND ?
            AND b.sqft > 0
            AND p.total_value > 0
            AND p.account_number = (
              SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
            )
          ORDER BY ABS(b.sqft - ?) ASC
          LIMIT 5`,
    args: [streetName, acct, sqftMin, sqftMax, subject.sqft],
  });

  // 2. Fill to 10 with neighborhood-code comps ordered by value_per_sqft ASC —
  //    finds the lowest-assessed comparable neighbors, which is the overassessment argument.
  //    Falls back to zip-wide if nbhd_cd is missing or returns too few.
  let areaComps = [];
  const needed = Math.max(0, 10 - streetComps.length);
  if (needed > 0) {
    const excludeAccts = [acct, ...streetComps.map(c => c.account_number)];
    const excludeAddrs = [subject.address, ...streetComps.map(c => c.address)];
    const placeholders = excludeAccts.map(() => '?').join(',');
    const addrPlaceholders = excludeAddrs.map(() => '?').join(',');

    if (subject.nbhd_cd) {
      const { rows } = await db.execute({
        sql: `SELECT p.account_number, p.address, p.zip, p.total_value,
                     b.sqft, b.year_built, b.beds, b.baths,
                     ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
              FROM properties p
              JOIN buildings b ON b.account_number = p.account_number
              WHERE p.nbhd_cd = ?
                AND p.account_number NOT IN (${placeholders})
                AND p.address NOT IN (${addrPlaceholders})
                AND b.sqft BETWEEN ? AND ?
                AND b.year_built BETWEEN ? AND ?
                AND b.sqft > 0
                AND p.total_value > 0
                AND p.account_number = (
                  SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
                )
              ORDER BY ABS(b.sqft - ?) ASC
              LIMIT ?`,
        args: [subject.nbhd_cd, ...excludeAccts, ...excludeAddrs, sqftMin, sqftMax, yearMin, yearMax, subject.sqft, needed],
      });
      areaComps = rows;
    }

    // Top up from zip if nbhd_cd returned too few
    const stillNeeded = needed - areaComps.length;
    if (stillNeeded > 0) {
      const excludeAccts2 = [acct, ...streetComps.map(c => c.account_number), ...areaComps.map(c => c.account_number)];
      const excludeAddrs2 = [subject.address, ...streetComps.map(c => c.address), ...areaComps.map(c => c.address)];
      const placeholders2 = excludeAccts2.map(() => '?').join(',');
      const addrPlaceholders2 = excludeAddrs2.map(() => '?').join(',');
      const { rows } = await db.execute({
        sql: `SELECT p.account_number, p.address, p.zip, p.total_value,
                     b.sqft, b.year_built, b.beds, b.baths,
                     ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
              FROM properties p
              JOIN buildings b ON b.account_number = p.account_number
              WHERE p.zip = ?
                AND p.account_number NOT IN (${placeholders2})
                AND p.address NOT IN (${addrPlaceholders2})
                AND b.sqft BETWEEN ? AND ?
                AND b.year_built BETWEEN ? AND ?
                AND b.sqft > 0
                AND p.total_value > 0
                AND p.account_number = (
                  SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
                )
              ORDER BY ABS(b.sqft - ?) ASC
              LIMIT ?`,
        args: [subject.zip, ...excludeAccts2, ...excludeAddrs2, sqftMin, sqftMax, yearMin, yearMax, subject.sqft, stillNeeded],
      });
      areaComps = [...areaComps, ...rows];
    }
  }

  const allComps = [
    ...streetComps.map(c => ({ ...c, on_street: true })),
    ...areaComps.map(c => ({ ...c, on_street: false })),
  ].map(c => ({
    ...c,
    match_pct: Math.round(Math.max(0, (1 - Math.abs(Number(c.sqft) - Number(subject.sqft)) / Number(subject.sqft))) * 100),
  }));

  const subjectVPS = subject.total_value / subject.sqft;

  // For analysis, use ALL eligible properties in the neighborhood (not just the 10 displayed)
  // This gives a statistically robust median rather than depending on which 10 comps we show.
  let poolVPS = [];
  if (subject.nbhd_cd) {
    const { rows: poolRows } = await db.execute({
      sql: `SELECT ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
            FROM properties p
            JOIN buildings b ON b.account_number = p.account_number
            WHERE p.nbhd_cd = ?
              AND p.account_number != ?
              AND b.sqft BETWEEN ? AND ?
              AND b.sqft > 0
              AND p.total_value > 0
              AND p.account_number = (
                SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
              )`,
      args: [subject.nbhd_cd, acct, sqftMin, sqftMax],
    });
    poolVPS = poolRows.map(r => Number(r.value_per_sqft));
  }
  if (poolVPS.length < 5) {
    const { rows: zipPoolRows } = await db.execute({
      sql: `SELECT ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
            FROM properties p
            JOIN buildings b ON b.account_number = p.account_number
            WHERE p.zip = ?
              AND p.account_number != ?
              AND b.sqft BETWEEN ? AND ?
              AND b.year_built BETWEEN ? AND ?
              AND b.sqft > 0
              AND p.total_value > 0
              AND p.account_number = (
                SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
              )`,
      args: [subject.zip, acct, sqftMin, sqftMax, yearMin, yearMax],
    });
    poolVPS = zipPoolRows.map(r => Number(r.value_per_sqft));
  }

  const med = median(poolVPS.length >= 5 ? poolVPS : allComps.map(c => Number(c.value_per_sqft)));
  const poolSize = poolVPS.length >= 5 ? poolVPS.length : allComps.length;
  const percentAboveMedian = med ? ((subjectVPS - med) / med) * 100 : 0;
  const potentialSavings = Math.max(0, Math.round((subjectVPS - med) * subject.sqft));

  const priorValue = Number(subject.prior_total_value);
  const subjectYoy = priorValue > 0
    ? Math.round(((Number(subject.total_value) - priorValue) / priorValue) * 1000) / 10
    : null;

  res.json({
    subject: {
      ...subject,
      value_per_sqft: Math.round(subjectVPS * 100) / 100,
      yoy_change: subjectYoy,
      street_name: streetName,
    },
    comps: allComps,
    analysis: {
      median_value_per_sqft: Math.round(med * 100) / 100,
      subject_value_per_sqft: Math.round(subjectVPS * 100) / 100,
      percent_above_median: Math.round(percentAboveMedian * 10) / 10,
      likely_overassessed: percentAboveMedian > 10,
      potential_savings: potentialSavings,
      street_comp_count: streetComps.length,
      pool_size: poolSize,
    },
  });
});

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default router;
