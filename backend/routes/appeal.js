import { Router } from 'express';
import { getDb } from '../db/database.js';
import { generateAppealPdf } from '../services/pdfGenerator.js';
import { logEvent } from '../db/events.js';

const router = Router();

router.post('/generate', async (req, res) => {
  const { accountNumber } = req.body;
  if (!accountNumber) return res.status(400).json({ error: 'accountNumber required' });

  const db = getDb();

  const { rows: propRows } = await db.execute({
    sql: `SELECT p.*, b.sqft, b.year_built, b.beds, b.baths, o.owner_name
          FROM properties p
          LEFT JOIN buildings b ON b.account_number = p.account_number
          LEFT JOIN owners o ON o.account_number = p.account_number
          WHERE p.account_number = ?`,
    args: [accountNumber],
  });

  if (!propRows.length) return res.status(404).json({ error: 'Property not found' });
  const property = propRows[0];

  const sqft = Number(property.sqft) || 0;
  const yearBuilt = Number(property.year_built) || 1990;
  const sqftMin = Math.floor(sqft * 0.8);
  const sqftMax = Math.ceil(sqft * 1.2);

  // Use nbhd_cd for tight neighborhood comps; fall back to zip
  const geoCol = property.nbhd_cd ? 'p.nbhd_cd' : 'p.zip';
  const geoVal = property.nbhd_cd || property.zip;

  const { rows: comps } = await db.execute({
    sql: `SELECT p.account_number, p.address, p.zip, p.total_value,
                 b.sqft, b.year_built,
                 ROUND(CAST(p.total_value AS REAL) / b.sqft, 2) AS value_per_sqft
          FROM properties p
          JOIN buildings b ON b.account_number = p.account_number
          WHERE ${geoCol} = ?
            AND p.account_number != ?
            AND b.sqft BETWEEN ? AND ?
            AND b.year_built BETWEEN ? AND ?
            AND b.sqft > 0
            AND p.total_value > 0
            AND p.account_number = (
              SELECT MIN(p2.account_number) FROM properties p2 WHERE p2.address = p.address
            )
          ORDER BY ABS(b.sqft - ?) ASC
          LIMIT 10`,
    args: [geoVal, accountNumber, sqftMin, sqftMax, yearBuilt - 10, yearBuilt + 10, sqft],
  });

  const subjectVPS = sqft ? Number(property.total_value) / sqft : 0;
  const med = median(comps.map(c => Number(c.value_per_sqft)));
  const potentialSavings = Math.max(0, Math.round((subjectVPS - med) * sqft));
  const taxYear = Number(property.tax_year) || new Date().getFullYear();

  const packetData = {
    property,
    comps,
    analysis: {
      median_value_per_sqft: Math.round(med * 100) / 100,
      subject_value_per_sqft: Math.round(subjectVPS * 100) / 100,
      potential_savings: potentialSavings,
    },
    deadline: `May 15, ${taxYear}`,
    generatedAt: new Date().toISOString(),
  };

  const { lastInsertRowid } = await db.execute({
    sql: `INSERT INTO appeal_packets (account_number, packet_json, user_id) VALUES (?, ?, NULL)`,
    args: [accountNumber, JSON.stringify(packetData)],
  });

  logEvent(req, 'packet_generate', accountNumber);
  res.json({ id: Number(lastInsertRowid), ...packetData });
});

router.get('/:id/html', async (req, res) => {
  const db = getDb();
  const { rows } = await db.execute({ sql: 'SELECT * FROM appeal_packets WHERE id = ?', args: [req.params.id] });
  if (!rows.length) return res.status(404).json({ error: 'Packet not found' });

  const data = JSON.parse(rows[0].packet_json);
  res.setHeader('Content-Type', 'text/html');
  res.send(renderHtml(data));
});

router.get('/:id/pdf', async (req, res) => {
  const db = getDb();
  const { rows } = await db.execute({ sql: 'SELECT * FROM appeal_packets WHERE id = ?', args: [req.params.id] });
  if (!rows.length) return res.status(404).json({ error: 'Packet not found' });

  const data = JSON.parse(rows[0].packet_json);
  const pdfBytes = await generateAppealPdf(data);

  logEvent(req, 'pdf_download', data.property.account_number);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="appeal-${data.property.account_number}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function renderHtml(data) {
  const { property, comps, analysis, deadline } = data;
  const sqft = Number(property.sqft);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Appeal Packet – ${property.account_number}</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; color: #1a1a1a; }
  h1 { color: #b91c1c; }
  h2 { border-bottom: 2px solid #b91c1c; padding-bottom: 4px; margin-top: 40px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; font-size: 14px; }
  th { background: #f3f4f6; }
  .summary-box { background: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; }
  .highlight { color: #b91c1c; font-weight: bold; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>

<h1>Property Tax Appeal Packet</h1>
<p><strong>Harris County Appraisal District (HCAD)</strong><br>
Account: ${property.account_number} &nbsp;|&nbsp; ${property.address}, ${property.city} ${property.zip}<br>
Tax Year: ${property.tax_year} &nbsp;|&nbsp; Deadline: <span class="highlight">${deadline}</span></p>

<div class="summary-box">
  <strong>Potential Savings: <span class="highlight">${fmt(analysis.potential_savings)}</span></strong><br>
  Your assessed value per sqft: <strong>${fmt(analysis.subject_value_per_sqft)}/sqft</strong><br>
  Median for comparable homes: <strong>${fmt(analysis.median_value_per_sqft)}/sqft</strong>
</div>

<h2>1. Cover Page</h2>
<table>
  <tr><th>Owner</th><td>${property.owner_name || 'N/A'}</td></tr>
  <tr><th>Address</th><td>${property.address}</td></tr>
  <tr><th>Account Number</th><td>${property.account_number}</td></tr>
  <tr><th>Current Assessed Value</th><td>${fmt(Number(property.total_value))}</td></tr>
  <tr><th>Sqft / Year Built</th><td>${sqft.toLocaleString()} sqft / ${property.year_built}</td></tr>
  <tr><th>Beds / Baths</th><td>${property.beds} / ${property.baths}</td></tr>
  <tr><th>Estimated Fair Value</th><td>${fmt(analysis.median_value_per_sqft * sqft)}</td></tr>
  <tr><th>Potential Reduction</th><td class="highlight">${fmt(analysis.potential_savings)}</td></tr>
</table>

<h2>2. Formal Appeal Letter</h2>
<p>
${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br><br>
Harris County Appraisal Review Board<br>
P.O. Box 922012<br>
Houston, TX 77292-2012<br><br>
<strong>Re: Protest of Appraised Value — Account No. ${property.account_number}</strong><br><br>
Dear Members of the Appraisal Review Board,<br><br>
I am writing to formally protest the ${property.tax_year} appraised value of my property located at
<strong>${property.address}, ${property.city}, TX ${property.zip}</strong> (Account No. ${property.account_number}).
Pursuant to Texas Property Tax Code §41.41, I am entitled to protest the appraised value of my property
on the grounds that it exceeds the market value and/or is unequal compared to comparable properties.<br><br>
The subject property has been assessed at <strong>${fmt(Number(property.total_value))}</strong>
(${fmt(analysis.subject_value_per_sqft)} per square foot), while comparable properties
in the same area average <strong>${fmt(analysis.median_value_per_sqft)} per square foot</strong>,
suggesting an overassessment of approximately <strong>${fmt(analysis.potential_savings)}</strong>.<br><br>
I respectfully request that the Board reduce my assessed value to reflect market value consistent with
comparable properties. I am prepared to present evidence of comparable assessments at the hearing.<br><br>
Sincerely,<br>
${property.owner_name || '[Property Owner]'}<br>
${property.address}<br>
${property.city}, TX ${property.zip}
</p>

<h2>3. Comparable Properties Evidence</h2>
<table>
  <thead>
    <tr><th>#</th><th>Address</th><th>Zip</th><th>Sqft</th><th>Year</th><th>Assessed Value</th><th>$/Sqft</th></tr>
  </thead>
  <tbody>
    ${comps.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${c.address}</td>
      <td>${c.zip}</td>
      <td>${Number(c.sqft)?.toLocaleString()}</td>
      <td>${c.year_built}</td>
      <td>${fmt(Number(c.total_value))}</td>
      <td>${fmt(Number(c.value_per_sqft))}</td>
    </tr>`).join('')}
    <tr style="background:#fef2f2;font-weight:bold">
      <td colspan="6">Median Value Per Sqft</td>
      <td>${fmt(analysis.median_value_per_sqft)}</td>
    </tr>
    <tr style="background:#fef2f2;font-weight:bold">
      <td colspan="6">Your Value Per Sqft</td>
      <td class="highlight">${fmt(analysis.subject_value_per_sqft)}</td>
    </tr>
  </tbody>
</table>

<h2>4. Filing Instructions</h2>
<ol>
  <li>File your protest online at <strong>iFile.hcad.org</strong> or mail to HCAD before <strong>${deadline}</strong>.</li>
  <li>Select protest reason: <em>"Value is over market value"</em> and/or <em>"Value is unequal compared to other properties."</em></li>
  <li>Upload or bring this packet as your evidence at the informal/formal hearing.</li>
  <li>At the informal hearing, present the comp table. Most reductions happen here.</li>
  <li>If unsatisfied, request a formal ARB hearing before the deadline shown on your notice.</li>
</ol>

<h2>5. Deadline Checklist</h2>
<ul>
  <li>☐ File protest at iFile.hcad.org by <strong>${deadline}</strong></li>
  <li>☐ Print or save this packet as evidence</li>
  <li>☐ Note your hearing date from HCAD confirmation email</li>
  <li>☐ Gather any photos of property defects, repair estimates, or recent sales in your area</li>
  <li>☐ Attend informal hearing — bring printed comps table</li>
  <li>☐ Review written decision from ARB</li>
</ul>

<h2>6. Legal Disclaimer</h2>
<p style="font-size:12px;color:#6b7280;">
This document is generated for informational purposes only and does not constitute legal or tax advice.
The comparable property data is sourced from HCAD public records and may not reflect the most recent
sales or assessments. Results are estimates only. Consult a licensed property tax consultant or attorney
for professional advice. Filing a protest does not guarantee a reduction in your assessed value.
</p>

</body>
</html>`;
}

export default router;
