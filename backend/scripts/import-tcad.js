/**
 * TCAD Data Import Script (Travis County, Austin TX)
 *
 * Downloads from traviscad.org/publicinformation/ and imports into SQLite
 * using the same schema as HCAD/FBCAD.
 *
 * Usage:
 *   node scripts/import-tcad.js               # download + import
 *   node scripts/import-tcad.js --skip-download  # use existing files in DATA_DIR
 *
 * Files:
 *   improvement_detail_2026.zip  → 4 CSVs  (sqft, yr_built, state_cd — residential filter)
 *   Full appraisal export ZIP    → PROP.TXT (fixed-width, address, values, owner, nbhd)
 *
 * Update TCAD_IMPRV_URL and TCAD_PROP_URL env vars each April.
 *
 * PROP.TXT fixed-width positions (1-indexed, verified empirically against 2026 data):
 *   [1-12]    prop_id           zero-padded internal ID
 *   [13-17]   prop_type_cd      R=Real property
 *   [597-608] geo_id            account number (user-facing)
 *   [609-678] owner_name
 *   [1050-1099] situs_pfx       street name prefix / name
 *   [1100-1109] situs_st        street suffix (ST, BLVD, etc.)
 *   [1110-1139] situs_sfx       unit/secondary, usually empty
 *   [1140-1149] situs_city_zip  city name OR 5-digit zip (varies by property)
 *   [1696-1745] hood_cd         neighborhood code
 *   [1796-1810] land_hstd_val
 *   [1811-1825] land_non_hstd_val
 *   [1826-1840] imprv_hstd_val
 *   [1841-1855] imprv_non_hstd_val
 *   [1916-1930] appraised_val   total appraised value
 *   [4475-4479] situs_num       house/unit number
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { Readable, Transform } from 'stream';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR      = process.env.DATA_DIR      || join(__dirname, '../../data/tcad');
const DB_PATH       = process.env.DB_PATH       || join(__dirname, '../../data/tcad_import.db');
const LIVE_DB_PATH  = process.env.LIVE_DB_PATH  || join(__dirname, '../../data/tcad.db');
const DEST_DB_PATH  = process.env.DEST_DB_PATH  || join(__dirname, '../../data/tcad_new.db');
const TAX_YEAR      = 2026;
const BATCH_SIZE    = 5000;

// Update these URLs each April when TCAD publishes new data
// Both found at: https://traviscad.org/publicinformation/
const TCAD_IMPRV_URL = process.env.TCAD_IMPRV_URL ||
  'https://traviscad.org/wp-content/largefiles/improvement_detail_2026.zip';
const TCAD_PROP_URL  = process.env.TCAD_PROP_URL  ||
  'https://traviscad.org/wp-content/largefiles/2026%20Preliminary%20Appraisal%20Export%20Supp%200_04292026.zip';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Referer': 'https://traviscad.org/publicinformation/',
  'Accept': '*/*',
};

// ─── DB setup ─────────────────────────────────────────────────────────────────

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

// ─── Download helpers ─────────────────────────────────────────────────────────

async function downloadZip(url, label) {
  console.log(`  Downloading ${label}...`);
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const total = parseInt(res.headers.get('content-length') || '0');
  let downloaded = 0, lastPct = -1;

  // Convert WHATWG ReadableStream → Node.js Readable so backpressure is respected.
  // The old PassThrough approach wrote chunks without awaiting drain, corrupting
  // the ZIP stream for large files (527 MB+).
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      downloaded += chunk.length;
      if (total) {
        const pct = Math.floor((downloaded / total) * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(0)}/${(total / 1024 / 1024).toFixed(0)} MB)   `);
          lastPct = pct;
        }
      }
      cb(null, chunk);
    },
    flush(cb) { process.stdout.write('\n'); cb(); },
  });

  return Readable.fromWeb(res.body).pipe(progress);
}

// Stream lines from a readable stream, calling onLine for each non-empty line
async function streamLines(stream, onLine) {
  let buffer = '';
  let count = 0;
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).replace(/\r$/, '');
        buffer = buffer.slice(nlIdx + 1);
        if (line.trim()) { onLine(line); count++; }
      }
    });
    stream.on('end', () => {
      if (buffer.trim()) { onLine(buffer.trim()); count++; }
      resolve(count);
    });
    stream.on('error', reject);
  });
}

// Process all entries in a ZIP stream, calling handler for each matching file
async function processZip(zipStream, handler) {
  return new Promise((resolve, reject) => {
    const parser = zipStream.pipe(unzipper.Parse());
    parser.on('entry', entry => {
      const name = entry.path.toLowerCase();
      handler(name, entry).catch(reject);
    });
    parser.on('finish', resolve);
    parser.on('error', reject);
  });
}

// ─── CSV parser (handles quoted fields) ───────────────────────────────────────

function parseCsv(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// ─── Fixed-width field extractor (1-indexed) ──────────────────────────────────

function fw(line, start, end) {
  return line.slice(start - 1, end).trim();
}

// ─── Import steps ─────────────────────────────────────────────────────────────

// Step 1: Parse improvement_detail CSVs → build map of propId → {yr_built, sqft}
// Columns: pYear,pID,pImprovementID,pDetailID,imprvType,stateCd,imprvDescription,
//          imprvDetailType,imprvDetailTypeDesc,detailClass,...,area,...,actualYearBuilt,...
async function buildImprovementMap(zipStream) {
  console.log('\n[Step 3] Parsing improvement_detail CSVs (residential index)...');

  // Type codes that count toward living area sqft
  const LIVING_TYPES = new Set(['1ST', '2ND', '3RD', '4TH', '5TH', 'BAS', 'FIN', 'ATT']);

  const map = new Map(); // propId (number) → {yr_built, sqft}
  let headerMap = null;
  let totalRows = 0;

  await processZip(zipStream, async (name, entry) => {
    if (!name.endsWith('.csv')) { entry.autodrain(); return; }
    console.log(`  Scanning ${name}...`);
    headerMap = null; // reset header for each CSV part

    await streamLines(entry, (line) => {
      const fields = parseCsv(line);

      if (!headerMap) {
        // First line is header
        headerMap = {};
        fields.forEach((h, i) => { headerMap[h.trim()] = i; });
        return;
      }

      const stateCd = fields[headerMap['stateCd']]?.trim() || '';
      if (!stateCd.startsWith('A')) return; // skip non-residential

      const typeCode = fields[headerMap['imprvDetailType']]?.trim() || '';
      if (!LIVING_TYPES.has(typeCode)) return;

      const propId = parseInt(fields[headerMap['pID']]);
      if (!propId) return;

      const area = parseFloat(fields[headerMap['area']]) || 0;
      const yrBuilt = parseInt(fields[headerMap['actualYearBuilt']]) || null;

      const existing = map.get(propId);
      if (!existing) {
        map.set(propId, { yr_built: yrBuilt, sqft: area });
      } else {
        existing.sqft += area;
        if (yrBuilt && (!existing.yr_built || yrBuilt < existing.yr_built)) {
          existing.yr_built = yrBuilt;
        }
      }
      totalRows++;
      if (totalRows % 200_000 === 0) process.stdout.write(`\r  ${totalRows.toLocaleString()} rows processed...`);
    });
  });

  process.stdout.write('\n');
  console.log(`  Done — ${map.size.toLocaleString()} residential properties indexed from ${totalRows.toLocaleString()} living-area rows.`);
  return map;
}

// Step 2: Stream PROP.TXT from the full export ZIP, import matching properties
async function importProperties(db, zipStream, improvementMap) {
  console.log('\n[Step 4] Parsing PROP.TXT (addresses, values, owners)...');

  const insertProp = db.prepare(`INSERT OR REPLACE INTO properties
    (account_number, address, city, zip, state_class, land_value, improvement_value,
     total_value, prior_total_value, nbhd_cd, tax_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insertBuilding = db.prepare(`INSERT OR REPLACE INTO buildings
    (account_number, sqft, year_built, beds, baths, stories, condition, quality)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL)`);

  const insertOwner = db.prepare(`INSERT OR REPLACE INTO owners
    (account_number, owner_name, mailing_address) VALUES (?, ?, ?)`);

  const runBatch = db.transaction((pb, bb, ob) => {
    for (const r of pb) insertProp.run(r);
    for (const r of bb) insertBuilding.run(r);
    for (const r of ob) insertOwner.run(r);
  });

  const propBatch = [], bldgBatch = [], ownerBatch = [];
  let imported = 0, skipped = 0;

  await processZip(zipStream, async (name, entry) => {
    if (name !== 'prop.txt') { entry.autodrain(); return; }
    console.log('  Found PROP.TXT — streaming...');

    let total = 0;
    await streamLines(entry, (line) => {
      total++;
      if (total % 100_000 === 0) process.stdout.write(`\r  ${total.toLocaleString()} lines scanned, ${imported.toLocaleString()} imported...`);

      if (line.length < 1930) { skipped++; return; }

      // Only Real property
      if (!fw(line, 13, 17).startsWith('R')) { skipped++; return; }

      // Match against our residential improvement map
      const propId = parseInt(fw(line, 1, 12));
      if (!improvementMap.has(propId)) { skipped++; return; }
      const bldg = improvementMap.get(propId);
      if (!bldg.sqft || bldg.sqft < 100) { skipped++; return; }

      const geoId = fw(line, 597, 608);
      if (!geoId) { skipped++; return; }

      // Values
      const landHstd  = parseInt(fw(line, 1796, 1810)) || 0;
      const landNon   = parseInt(fw(line, 1811, 1825)) || 0;
      const imprvHstd = parseInt(fw(line, 1826, 1840)) || 0;
      const imprvNon  = parseInt(fw(line, 1841, 1855)) || 0;
      const totalVal  = parseInt(fw(line, 1916, 1930)) || 0;
      if (totalVal < 10000) { skipped++; return; }

      // Address: house number + street name + suffix
      const situsNum = fw(line, 4475, 4479);
      const situs_pfx = fw(line, 1050, 1099);
      const situs_st  = fw(line, 1100, 1109);
      const situs_sfx = fw(line, 1110, 1139);
      const address = [situsNum, situs_pfx, situs_st, situs_sfx].filter(Boolean).join(' ').toUpperCase();
      if (!address) { skipped++; return; }

      // situs_city field holds either a city name or a zip code
      const situsCity = fw(line, 1140, 1149);
      const isZip = /^\d{5}/.test(situsCity);
      const city = isZip ? 'Austin' : (situsCity || 'Austin');
      const zip  = isZip ? situsCity.slice(0, 5) : '';

      const hood = fw(line, 1696, 1745);
      const owner = fw(line, 609, 678);

      propBatch.push([
        geoId, address, city, zip, 'A1',
        landHstd + landNon, imprvHstd + imprvNon, totalVal, null,
        hood || null, TAX_YEAR,
      ]);
      bldgBatch.push([geoId, Math.round(bldg.sqft), bldg.yr_built]);
      ownerBatch.push([geoId, owner, '']);
      imported++;

      if (propBatch.length >= BATCH_SIZE) {
        runBatch([...propBatch], [...bldgBatch], [...ownerBatch]);
        propBatch.length = bldgBatch.length = ownerBatch.length = 0;
      }
    });
  });

  if (propBatch.length) runBatch(propBatch, bldgBatch, ownerBatch);
  console.log(`  Done — ${imported.toLocaleString()} residential imported, ${skipped.toLocaleString()} skipped.`);
  return imported;
}

// ─── Pre-check ────────────────────────────────────────────────────────────────

function checkAlreadyImported() {
  if (!existsSync(LIVE_DB_PATH)) {
    console.log('[Pre-check] No existing DB found — proceeding.\n');
    return false;
  }
  try {
    const liveDb = new Database(LIVE_DB_PATH, { readonly: true });
    const row = liveDb.prepare('SELECT MAX(tax_year) AS yr FROM properties').get();
    liveDb.close();
    const dbYear = Number(row?.yr);
    if (dbYear >= TAX_YEAR) {
      console.log(`[Pre-check] DB already contains ${dbYear} data — nothing to do. Exiting.`);
      return true;
    }
    console.log(`[Pre-check] DB has ${dbYear || 'no'} data — importing ${TAX_YEAR}.\n`);
  } catch (e) {
    console.log(`[Pre-check] Could not read existing DB (${e.message}) — proceeding.\n`);
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const skipDownload = process.argv.includes('--skip-download');

  console.log('TCAD Data Import (Travis County, Austin TX)');
  console.log('===========================================');
  console.log(`Data dir  : ${DATA_DIR}`);
  console.log(`Import DB : ${DB_PATH}`);
  console.log(`Live DB   : ${LIVE_DB_PATH}`);
  console.log(`Tax year  : ${TAX_YEAR}\n`);

  mkdirSync(DATA_DIR, { recursive: true });

  if (!skipDownload && checkAlreadyImported()) process.exit(0);

  const db = openDb(DB_PATH);
  const start = Date.now();

  if (!skipDownload) {
    // Pass 1: improvement_detail CSVs (69 MB) → residential property map
    console.log('[Step 1] Downloading improvement_detail_2026.zip (69 MB)...');
    const imprvStream = await downloadZip(TCAD_IMPRV_URL, 'improvement_detail_2026.zip');
    const improvementMap = await buildImprovementMap(imprvStream);

    // Pass 2: full export (553 MB) → PROP.TXT for address/value/owner data
    console.log('\n[Step 2] Downloading full appraisal export (553 MB) for PROP.TXT...');
    const propStream = await downloadZip(TCAD_PROP_URL, 'full appraisal export');
    await importProperties(db, propStream, improvementMap);

  } else {
    // --skip-download: read pre-extracted files from DATA_DIR
    const { createReadStream } = await import('fs');

    const imprvPath = join(DATA_DIR, 'improvement_detail_2026.zip');
    const propPath  = join(DATA_DIR, 'prop_export.zip');

    if (!existsSync(imprvPath)) throw new Error(`Missing: ${imprvPath}`);
    if (!existsSync(propPath))  throw new Error(`Missing: ${propPath}`);

    console.log('[Step 1] Reading improvement_detail_2026.zip from disk...');
    const improvementMap = await buildImprovementMap(createReadStream(imprvPath));

    console.log('\n[Step 2] Reading PROP.TXT from local export ZIP...');
    await importProperties(db, createReadStream(propPath), improvementMap);
  }

  const propCount = db.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
  const bldCount  = db.prepare('SELECT COUNT(*) AS n FROM buildings').get().n;
  const elapsed   = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nBacking up to ${DEST_DB_PATH}...`);
  await db.backup(DEST_DB_PATH);
  db.close();

  const verify = new Database(DEST_DB_PATH, { readonly: true });
  const verifyCount = verify.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
  verify.close();

  if (verifyCount === 0) throw new Error('Backup verification failed — properties table is empty');

  console.log('\n✓ Import complete');
  console.log(`  Properties    : ${Number(propCount).toLocaleString()}`);
  console.log(`  Buildings     : ${Number(bldCount).toLocaleString()}`);
  console.log(`  Verified rows : ${Number(verifyCount).toLocaleString()}`);
  console.log(`  Time          : ${elapsed}s`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
