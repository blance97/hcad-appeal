/**
 * HCAD Data Import Script
 *
 * Auto-downloads from the HCAD JSON API, extracts, and imports into SQLite.
 * Run once per year (HCAD releases preliminary values around April-May).
 *
 * Usage:
 *   node scripts/import-hcad.js               # download + import
 *   node scripts/import-hcad.js --skip-download  # import from existing files in data/
 *
 * Files fetched:
 *   Real_acct_owner.zip    → real_acct.txt              (accounts, addresses, values)
 *   Real_building_land.zip → building_res.txt, fixtures.txt  (sqft, year, beds/baths)
 *
 * Both files are TAB-delimited with a header row (verified against 2026 data).
 * Column indices: real_acct.txt col 54 = prior_tot_appr_val
 * fixtures.txt codes: RMB=bedrooms, RMF=full baths, RMH=half baths, STC=stories
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { PassThrough } from 'stream';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';
import { initDb, getDb } from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../../data');
const BATCH_SIZE = 5000;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Referer': 'https://hcad.org/',
  'Accept': '*/*',
};

const TARGETS = [
  { apiLabel: /real property data/i,   extractFiles: ['real_acct.txt'] },
  { apiLabel: /building information/i, extractFiles: ['building_res.txt', 'fixtures.txt'] },
];

// ─── Download ─────────────────────────────────────────────────────────────────

async function getDownloadLinks(taxYear) {
  const url = `https://hcad.org/actions/hcad-pdata/default/get-property-downloads?t=${taxYear}&c=CAMA&s=Real%20Property`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HCAD API returned HTTP ${res.status}`);
  return res.json();
}

// Extracts multiple files from one zip in a single streaming pass
async function downloadAndExtractMany(zipUrl, extractFiles) {
  console.log(`  Downloading ${zipUrl.split('/').pop()}...`);
  const res = await fetch(zipUrl, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${zipUrl}`);

  const total = parseInt(res.headers.get('content-length') || '0');
  let downloaded = 0, lastPct = -1;
  const remaining = new Set(extractFiles.map(f => f.toLowerCase()));
  const writers = new Map(); // filename → write stream promise

  await new Promise((resolve, reject) => {
    const zipStream = unzipper.Parse();

    zipStream.on('entry', (entry) => {
      const name = entry.path.split(/[\\/]/).pop().toLowerCase();
      if (remaining.has(name)) {
        remaining.delete(name);
        console.log(`  Extracting ${entry.path} → data/${name}`);
        const outPath = join(DATA_DIR, name);
        const p = new Promise((res, rej) =>
          entry.pipe(createWriteStream(outPath)).on('finish', res).on('error', rej)
        );
        writers.set(name, p);
      } else {
        entry.autodrain();
      }
    });

    zipStream.on('finish', async () => {
      try {
        await Promise.all([...writers.values()]);
        if (remaining.size > 0) console.warn(`  Warning: not found in zip: ${[...remaining].join(', ')}`);
        resolve();
      } catch (e) { reject(e); }
    });
    zipStream.on('error', reject);

    const pass = new PassThrough();
    pass.pipe(zipStream);

    const reader = res.body.getReader();
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { pass.end(); break; }
        downloaded += value.length;
        if (total) {
          const pct = Math.floor((downloaded / total) * 100);
          if (pct !== lastPct && pct % 5 === 0) {
            process.stdout.write(`\r  Progress: ${pct}% (${(downloaded/1024/1024).toFixed(0)}/${(total/1024/1024).toFixed(0)} MB)   `);
            lastPct = pct;
          }
        }
        pass.write(value);
      }
      process.stdout.write('\n');
    })().catch(reject);
  });
}

async function getDownloadLinksOrNull(taxYear) {
  console.log(`[Step 1] Fetching download links from HCAD API for ${taxYear}...`);
  try {
    const links = await getDownloadLinks(taxYear);
    if (!links?.length) { console.warn('  No links returned.'); return null; }
    console.log(`  Found ${links.length} download link(s).`);
    return links;
  } catch (e) {
    console.warn(`  HCAD API failed: ${e.message}`);
    return null;
  }
}

async function downloadAll(links) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log('\n[Step 2] Downloading and extracting files...');

  for (const target of TARGETS) {
    const entry = links.find(l => target.apiLabel.test(l.downloadLinkText));
    if (!entry) { console.warn(`  Warning: no link for ${target.apiLabel} — skipping`); continue; }
    console.log(`\n  → ${entry.downloadLinkText}`);
    await downloadAndExtractMany(entry.downloadLink, target.extractFiles);
  }
}

// ─── Import helpers ───────────────────────────────────────────────────────────

async function parseTsvFile(filePath, onRow) {
  if (!existsSync(filePath)) { console.warn(`  File not found, skipping: ${filePath}`); return 0; }
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  let count = 0, isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    await onRow(line.split('\t'));
    count++;
    if (count % 100_000 === 0) process.stdout.write(`\r  ${count.toLocaleString()} rows...`);
  }
  process.stdout.write('\n');
  return count;
}

async function flushBatch(db, batch) {
  if (!batch.length) return;
  await db.batch([...batch], 'write');
  batch.length = 0;
}

// ─── Import steps ─────────────────────────────────────────────────────────────

async function importAccounts(db) {
  const taxYear = new Date().getFullYear();
  console.log('\n[Step 3] Importing real_acct.txt (accounts + values)...');

  // Column indices verified against 2026 HCAD data:
  // 0=acct, 1=yr, 2=mailto, 17=site_addr_1, 18=city, 19=zip, 20=state_class
  // 24=Neighborhood_Code, 43=land_val, 44=bld_val, 48=tot_appr_val, 54=prior_tot_appr_val
  const propBatch = [], ownerBatch = [];

  const count = await parseTsvFile(join(DATA_DIR, 'real_acct.txt'), async (f) => {
    const acct = f[0]?.trim();
    if (!acct) return;
    const stateClass = f[20]?.trim() || '';
    if (!stateClass.startsWith('A') && !stateClass.startsWith('B')) return;

    propBatch.push({
      sql: `INSERT OR REPLACE INTO properties
            (account_number, address, city, zip, state_class, land_value, improvement_value,
             total_value, prior_total_value, nbhd_cd, tax_year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        acct,
        f[17]?.trim() || '',
        f[18]?.trim() || '',
        f[19]?.trim() || '',
        stateClass,
        parseInt(f[43]) || 0,
        parseInt(f[44]) || 0,
        parseInt(f[48]) || 0,
        parseInt(f[54]) || null,  // prior_tot_appr_val
        f[24]?.trim() || null,    // Neighborhood_Code
        parseInt(f[1])  || taxYear,
      ],
    });
    ownerBatch.push({
      sql: `INSERT OR REPLACE INTO owners (account_number, owner_name, mailing_address) VALUES (?, ?, ?)`,
      args: [acct, f[2]?.trim() || '', `${f[3]?.trim() || ''}, ${f[5]?.trim() || ''} ${f[7]?.trim() || ''}`.trim()],
    });

    if (propBatch.length >= BATCH_SIZE) { await flushBatch(db, propBatch); await flushBatch(db, ownerBatch); }
  });

  await flushBatch(db, propBatch); await flushBatch(db, ownerBatch);
  console.log(`  Done — ${count.toLocaleString()} rows read, residential only imported.`);
}

async function importBuildings(db) {
  console.log('\n[Step 4] Importing building_res.txt (sqft, year built)...');

  // 0=acct, 1=property_use_cd, 11=dscr(quality), 12=date_erected, 19=im_sq_ft
  const batch = [];
  const count = await parseTsvFile(join(DATA_DIR, 'building_res.txt'), async (f) => {
    const acct = f[0]?.trim();
    if (!acct) return;
    if (!f[1]?.trim().startsWith('A')) return; // residential only

    batch.push({
      sql: `INSERT OR REPLACE INTO buildings (account_number, sqft, year_built, beds, baths, stories, condition, quality)
            VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
      args: [acct, parseInt(f[19]) || null, parseInt(f[12]) || null, f[11]?.trim() || null],
    });
    if (batch.length >= BATCH_SIZE) await flushBatch(db, batch);
  });

  await flushBatch(db, batch);
  console.log(`  Done — ${count.toLocaleString()} rows read.`);
}

async function importFixtures(db) {
  console.log('\n[Step 5] Importing fixtures.txt (beds, baths, stories)...');

  // Pivot: one row per (acct, fixture_type). Codes: RMB=beds, RMF=full bath, RMH=half bath, STC=stories
  // We aggregate per account then bulk UPDATE buildings.
  const fixtureMap = new Map(); // acct → { beds, fullBaths, halfBaths, stories }

  const count = await parseTsvFile(join(DATA_DIR, 'fixtures.txt'), async (f) => {
    const acct = f[0]?.trim();
    const type = f[2]?.trim();
    const units = parseFloat(f[4]) || 0;
    if (!acct || !type || !['RMB','RMF','RMH','STC'].includes(type)) return;

    if (!fixtureMap.has(acct)) fixtureMap.set(acct, { beds: null, fullBaths: null, halfBaths: null, stories: null });
    const rec = fixtureMap.get(acct);
    if (type === 'RMB') rec.beds      = Math.round(units);
    if (type === 'RMF') rec.fullBaths = units;
    if (type === 'RMH') rec.halfBaths = units;
    if (type === 'STC') rec.stories   = Math.round(units);
  });

  // Batch UPDATE buildings with beds/baths/stories
  let updated = 0;
  const batch = [];
  for (const [acct, rec] of fixtureMap) {
    const baths = rec.fullBaths !== null || rec.halfBaths !== null
      ? (rec.fullBaths || 0) + (rec.halfBaths || 0) * 0.5
      : null;
    batch.push({
      sql: `UPDATE buildings SET beds=?, baths=?, stories=? WHERE account_number=?`,
      args: [rec.beds, baths, rec.stories, acct],
    });
    updated++;
    if (batch.length >= BATCH_SIZE) await flushBatch(db, batch);
  }
  await flushBatch(db, batch);
  console.log(`  Done — ${count.toLocaleString()} fixture rows, ${updated.toLocaleString()} buildings updated.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function checkAlreadyImported(taxYear) {
  // Returns true if the db already has data for this tax year — skip re-import.
  try {
    await initDb();
    const db = getDb();
    const { rows } = await db.execute('SELECT MAX(tax_year) AS yr FROM properties');
    const dbYear = Number(rows[0]?.yr);
    if (dbYear >= taxYear) {
      console.log(`[Pre-check] DB already contains ${dbYear} data — nothing to do. Exiting.`);
      return true;
    }
    console.log(`[Pre-check] DB has ${dbYear || 'no'} data, HCAD is serving ${taxYear} — importing.\n`);
  } catch {
    console.log('[Pre-check] Could not read existing DB — proceeding with fresh import.\n');
  }
  return false;
}

async function main() {
  const skipDownload = process.argv.includes('--skip-download');
  const taxYear = new Date().getFullYear();

  console.log('HCAD Data Import');
  console.log('================');
  console.log(`Data dir : ${DATA_DIR}`);
  console.log(`Tax year : ${taxYear}`);
  console.log(`Mode     : ${skipDownload ? 'skip download (use existing files)' : 'auto-download from HCAD'}\n`);

  if (!skipDownload) {
    // Check HCAD API has new-year data before committing to a full download+import.
    const links = await getDownloadLinksOrNull(taxYear);
    if (!links) throw new Error('HCAD API returned no download links — data may not be released yet.');

    if (await checkAlreadyImported(taxYear)) process.exit(0);

    await downloadAll(links);
  } else {
    console.log('[Step 1-2] Skipped — using existing files in data/\n');
  }

  await initDb();
  const db = getDb();
  const start = Date.now();

  await importAccounts(db);
  await importBuildings(db);
  await importFixtures(db);

  const { rows: p } = await db.execute('SELECT COUNT(*) as n FROM properties');
  const { rows: b } = await db.execute('SELECT COUNT(*) as n FROM buildings');
  const { rows: bfix } = await db.execute('SELECT COUNT(*) as n FROM buildings WHERE beds IS NOT NULL');
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Flush all WAL pages into the main db file before the caller renames it.
  // Without this, mv only moves the .db file and leaves .db-wal behind,
  // making the database appear empty to any new connection.
  console.log('\nCheckpointing WAL...');
  await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');

  console.log('\n✓ Import complete');
  console.log(`  Properties        : ${Number(p[0].n).toLocaleString()}`);
  console.log(`  Buildings         : ${Number(b[0].n).toLocaleString()}`);
  console.log(`  Buildings w/ beds : ${Number(bfix[0].n).toLocaleString()}`);
  console.log(`  Time              : ${elapsed}s`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
