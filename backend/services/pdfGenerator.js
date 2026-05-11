import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const RED = rgb(0.73, 0.11, 0.11);
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.42, 0.45, 0.5);
const LIGHT_RED_BG = rgb(0.99, 0.95, 0.95);

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export async function generateAppealPdf(data) {
  const { property, comps, analysis, deadline } = data;
  const doc = await PDFDocument.create();
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  function addPage() {
    const page = doc.addPage([612, 792]);
    return { page, y: 750 };
  }

  function text(page, str, x, y, { font = helvetica, size = 10, color = BLACK } = {}) {
    page.drawText(String(str), { x, y, size, font, color });
    return y - size - 4;
  }

  function line(page, y, { color = rgb(0.8, 0.8, 0.8) } = {}) {
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color });
  }

  // --- Page 1: Cover ---
  let { page, y } = addPage();
  y = text(page, 'PROPERTY TAX APPEAL PACKET', 50, y, { font: helveticaBold, size: 18, color: RED });
  y = text(page, 'Harris County Appraisal District', 50, y - 4, { size: 12, color: GRAY });
  y -= 8;
  line(page, y);
  y -= 16;

  y = text(page, `Account: ${property.account_number}`, 50, y, { font: helveticaBold });
  y = text(page, `${property.address}, ${property.city}, TX ${property.zip}`, 50, y);
  y = text(page, `Tax Year: ${property.tax_year}   |   Deadline: ${deadline}`, 50, y, { color: RED });
  y -= 16;

  // Summary box
  page.drawRectangle({ x: 50, y: y - 60, width: 512, height: 70, color: LIGHT_RED_BG, borderColor: RED, borderWidth: 1 });
  text(page, 'Estimated Potential Savings', 66, y - 8, { font: helveticaBold, size: 11 });
  text(page, fmt(analysis.potential_savings), 66, y - 24, { font: helveticaBold, size: 20, color: RED });
  text(page, `Your assessed value: ${fmt(analysis.subject_value_per_sqft)}/sqft   |   Comparable median: ${fmt(analysis.median_value_per_sqft)}/sqft`, 66, y - 44, { size: 9, color: GRAY });
  y -= 80;

  const rows = [
    ['Owner', property.owner_name || 'N/A'],
    ['Current Assessed Value', fmt(property.total_value)],
    ['Square Footage', `${property.sqft?.toLocaleString()} sqft`],
    ['Year Built', String(property.year_built)],
    ['Beds / Baths', `${property.beds} / ${property.baths}`],
    ['Estimated Fair Value', fmt(analysis.median_value_per_sqft * property.sqft)],
  ];

  for (const [label, val] of rows) {
    text(page, label, 60, y, { color: GRAY, size: 9 });
    text(page, val, 260, y, { font: helveticaBold, size: 9 });
    y -= 16;
  }

  // --- Page 2: Appeal Letter ---
  ({ page, y } = addPage());
  y = text(page, 'FORMAL PROTEST LETTER', 50, y, { font: helveticaBold, size: 14, color: RED });
  y -= 8; line(page, y); y -= 16;
  y = text(page, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, y);
  y -= 8;
  y = text(page, 'Harris County Appraisal Review Board', 50, y, { font: helveticaBold });
  y = text(page, 'P.O. Box 922012, Houston, TX 77292-2012', 50, y);
  y -= 8;
  y = text(page, `Re: Protest of Appraised Value — Account No. ${property.account_number}`, 50, y, { font: helveticaBold });
  y -= 8;

  const letterLines = [
    'Dear Members of the Appraisal Review Board,',
    '',
    `I am writing to formally protest the ${property.tax_year} appraised value of my property at`,
    `${property.address}, ${property.city}, TX ${property.zip} (Account No. ${property.account_number}).`,
    `Pursuant to Texas Property Tax Code §41.41, I protest on the grounds that the appraised`,
    `value exceeds market value and is unequal compared to comparable properties.`,
    '',
    `The subject property is assessed at ${fmt(property.total_value)} (${fmt(analysis.subject_value_per_sqft)}/sqft).`,
    `Comparable properties in the same area average ${fmt(analysis.median_value_per_sqft)}/sqft,`,
    `indicating an overassessment of approximately ${fmt(analysis.potential_savings)}.`,
    '',
    'I respectfully request the Board reduce my assessed value to reflect comparable market data.',
    'I will present evidence of comparable assessments at the hearing.',
    '',
    'Sincerely,',
    '',
    property.owner_name || '[Property Owner]',
    `${property.address}, ${property.city}, TX ${property.zip}`,
  ];

  for (const l of letterLines) {
    y = text(page, l, 50, y);
  }

  // --- Page 3: Comps Table ---
  ({ page, y } = addPage());
  y = text(page, 'COMPARABLE PROPERTIES EVIDENCE', 50, y, { font: helveticaBold, size: 14, color: RED });
  y -= 8; line(page, y); y -= 16;

  const cols = [50, 150, 230, 285, 330, 400, 490];
  const headers = ['#', 'Address', 'Zip', 'Sqft', 'Year', 'Assessed', '$/Sqft'];
  headers.forEach((h, i) => text(page, h, cols[i], y, { font: helveticaBold, size: 8 }));
  y -= 14;

  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    const vals = [String(i + 1), c.address?.slice(0, 18), c.zip, c.sqft?.toLocaleString(), String(c.year_built), fmt(c.total_value), fmt(c.value_per_sqft)];
    vals.forEach((v, j) => text(page, v || '', cols[j], y, { size: 8 }));
    y -= 13;
  }

  y -= 4; line(page, y, { color: RED }); y -= 14;
  text(page, 'Median $/Sqft (Comps)', cols[0], y, { font: helveticaBold, size: 8 });
  text(page, fmt(analysis.median_value_per_sqft), cols[6], y, { font: helveticaBold, size: 8 });
  y -= 13;
  text(page, 'Your $/Sqft', cols[0], y, { font: helveticaBold, size: 8, color: RED });
  text(page, fmt(analysis.subject_value_per_sqft), cols[6], y, { font: helveticaBold, size: 8, color: RED });

  return doc.save();
}
