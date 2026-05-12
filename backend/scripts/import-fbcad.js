/**
 * FBCAD Data Import Script (Fort Bend County)
 *
 * Downloads from fbcad.org and imports into SQLite using the same schema as HCAD.
 *
 * Usage:
 *   node scripts/import-fbcad.js               # download + import
 *   node scripts/import-fbcad.js --skip-download  # use existing files in DATA_DIR
 *
 * Files:
 *   WebsiteResidentialSegs.zip  → WebsiteResidentialSegs.txt  (year built, beds)
 *   May4_PropertyDataExport-Redacted.zip → Property.txt, Owner.txt  (accounts, values, addresses)
 *
 * Update FBCAD_RES_URL and FBCAD_PROP_URL env vars each April when FBCAD releases new data.
 * The PropertyDataExport filename includes the release date (e.g. May4_PropertyDataExport).
 */

import Database from 'better-sqlite3';
import { readFileSync, createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { PassThrough } from 'stream';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR      = process.env.DATA_DIR      || join(__dirname, '../../data/fbcad');
const DB_PATH       = process.env.DB_PATH       || join(__dirname, '../../data/fbcad_import.db');
const LIVE_DB_PATH  = process.env.LIVE_DB_PATH  || join(__dirname, '../../data/fbcad.db');
const DEST_DB_PATH  = process.env.DEST_DB_PATH  || join(__dirname, '../../data/fbcad_new.db');
const TAX_YEAR      = 2026;
const BATCH_SIZE    = 5000;

// Update these URLs each year when FBCAD publishes new data
const FBCAD_RES_URL  = process.env.FBCAD_RES_URL  || 'https://www.fbcad.org/wp-content/uploads/2026/05/WebsiteResidentialSegs.zip';
const FBCAD_PROP_URL = process.env.FBCAD_PROP_URL || 'https://www.fbcad.org/wp-content/uploads/2026/05/May4_PropertyDataExport-Redacted.zip';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:149.0) Gecko/20100101 Firefox/149.0',
  'Referer': 'https://www.fbcad.org/certified-and-supplements-reports/',
  'Accept': '*/*',
};

// ─── CSV parser (handles quoted fields with embedded commas) ──────────────────

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

// ─── Download ─────────────────────────────────────────────────────────────────

async function downloadAndExtract(url, destDir, extractFiles) {
  const filename = url.split('/').pop();
  console.log(`  Downloading ${filename}...`);
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const total = parseInt(res.headers.get('content-length') || '0');
  let downloaded = 0, lastPct = -1;
  const targets = new Set(extractFiles.map(f => f.toLowerCase()));
  const writers = new Map();

  await new Promise((resolve, reject) => {
    const zipStream = unzipper.Parse();

    zipStream.on('entry', entry => {
      const name = entry.path.split(/[\\/]/).pop().toLowerCase();
      if (targets.has(name)) {
        targets.delete(name);
        console.log(`  Extracting ${name}...`);
        const p = new Promise((res, rej) =>
          entry.pipe(createWriteStream(join(destDir, name))).on('finish', res).on('error', rej)
        );
        writers.set(name, p);
      } else {
        entry.autodrain();
      }
    });

    zipStream.on('finish', async () => {
      try {
        await Promise.all([...writers.values()]);
        if (targets.size > 0) console.warn(`  Warning: not found in zip: ${[...targets].join(', ')}`);
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
            process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(0)}/${(total / 1024 / 1024).toFixed(0)} MB)   `);
            lastPct = pct;
          }
        }
        pass.write(value);
      }
      process.stdout.write('\n');
    })().catch(reject);
  });
}

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

// ─── Parse helpers ────────────────────────────────────────────────────────────

async function parseFile(filePath, delimiter, onRow) {
  if (!existsSync(filePath)) { console.warn(`  File not found, skipping: ${filePath}`); return 0; }
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  let count = 0, isHeader = true;
  for await (const rawLine of rl) {
    // Strip BOM from first line
    const line = count === 0 && isHeader ? rawLine.replace(/^﻿/, '') : rawLine;
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    onRow(delimiter === 'csv' ? parseCsv(line) : line.split('\t'));
    count++;
    if (count % 100_000 === 0) process.stdout.write(`\r  ${count.toLocaleString()} rows...`);
  }
  process.stdout.write('\n');
  return count;
}

// ─── Import steps ─────────────────────────────────────────────────────────────

async function buildResidentialMap() {
  console.log('\n[Step 3] Scanning WebsiteResidentialSegs.txt (building residential index)...');
  // Map: PropertyID (number) -> { quickRefId, yearBuilt, beds }
  // Only take FirstPage=1 rows — the main segment has beds and year built.
  const map = new Map();
  const count = await parseFile(join(DATA_DIR, 'websiteresidentialsegs.txt'), 'csv', (f) => {
    if (f[13] !== '1') return; // FirstPage must be 1
    const propId = parseInt(f[5]);
    if (!propId) return;
    map.set(propId, {
      quickRefId:  f[2]?.trim() || '',
      yearBuilt:   parseInt(f[14]) || null,
      beds:        parseInt(f[20]) || null,
    });
  });
  console.log(`  Done — ${count.toLocaleString()} segment rows, ${map.size.toLocaleString()} residential properties indexed.`);
  return map;
}

async function importProperties(db, residentialMap) {
  console.log('\n[Step 4] Importing Property.txt (accounts, values, addresses)...');

  const insertProp = db.prepare(`INSERT OR REPLACE INTO properties
    (account_number, address, city, zip, state_class, land_value, improvement_value,
     total_value, prior_total_value, nbhd_cd, tax_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const runBatch = db.transaction((rows) => {
    for (const row of rows) insertProp.run(row);
  });

  const batch = [];
  let imported = 0;

  // Property.txt columns (0-indexed, CSV):
  // 1=PropertyID, 2=QuickRefID, 18=CurrAssessedValue, 19=CurrLandValue,
  // 20=CurrImprovmentValue, 23=AssessedValue(prior), 27=SquareFootage,
  // 28=NbhdCode, 30=Situs, 32=SitusStreetNumber, 33=SitusStreetName,
  // 34=SitusStreetSuffix, 36=SitusCity, 38=SitusZip
  const count = await parseFile(join(DATA_DIR, 'property.txt'), 'csv', (f) => {
    const propId = parseInt(f[1]);
    if (!residentialMap.has(propId)) return;

    const quickRefId = f[2]?.trim();
    if (!quickRefId) return;

    const currAssessed = parseFloat(f[18]) || 0;
    if (currAssessed < 1000) return; // skip zero/trivial values

    // Build address from components; fall back to Situs full string
    const addrParts = [f[32], f[33], f[34]].map(s => s?.trim()).filter(Boolean);
    const address = addrParts.length ? addrParts.join(' ').toUpperCase() : f[30]?.trim().toUpperCase();
    if (!address) return;

    const priorAssessed = parseFloat(f[23]) || null;

    batch.push([
      quickRefId,
      address,
      f[36]?.trim().toUpperCase() || '',
      f[38]?.trim() || '',
      'A1', // all records from ResidentialSegs are residential class A
      Math.round(parseFloat(f[19]) || 0),
      Math.round(parseFloat(f[20]) || 0),
      Math.round(currAssessed),
      priorAssessed ? Math.round(priorAssessed) : null,
      f[28]?.trim() || null,
      TAX_YEAR,
    ]);
    imported++;

    if (batch.length >= BATCH_SIZE) {
      runBatch([...batch]);
      batch.length = 0;
    }
  });

  if (batch.length) runBatch(batch);
  console.log(`  Done — ${count.toLocaleString()} rows scanned, ${imported.toLocaleString()} residential imported.`);
  return imported;
}

async function importBuildings(db, residentialMap) {
  console.log('\n[Step 5] Importing buildings (sqft from Property.txt, year/beds from segments)...');

  // Property.txt SquareFootage (col 27) is the authoritative total sqft (all segments summed).
  // Re-read property.txt to get sqft for each account — it's 177MB but fast on a second pass.
  const accountSqft = new Map(
    db.prepare('SELECT account_number FROM properties').all().map(r => [r.account_number, null])
  );

  await parseFile(join(DATA_DIR, 'property.txt'), 'csv', (f) => {
    const acct = f[2]?.trim();
    if (accountSqft.has(acct)) accountSqft.set(acct, parseInt(parseFloat(f[27])) || null);
  });

  const insertBuilding = db.prepare(`INSERT OR REPLACE INTO buildings
    (account_number, sqft, year_built, beds, baths, stories, condition, quality)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL)`);

  const runBatch = db.transaction((rows) => {
    for (const row of rows) insertBuilding.run(row);
  });

  const batch = [];
  for (const [, bldg] of residentialMap) {
    const acct = bldg.quickRefId;
    if (!accountSqft.has(acct)) continue;
    batch.push([acct, accountSqft.get(acct), bldg.yearBuilt, bldg.beds]);
    if (batch.length >= BATCH_SIZE) { runBatch([...batch]); batch.length = 0; }
  }
  if (batch.length) runBatch(batch);
  console.log(`  Done — ${residentialMap.size.toLocaleString()} buildings inserted.`);
}

async function importOwners(db) {
  console.log('\n[Step 6] Importing Owner.txt...');

  // Owner.txt has all property types — filter to only imported residential accounts
  const imported = new Set(
    db.prepare('SELECT account_number FROM properties').all().map(r => r.account_number)
  );

  // Owner.txt columns (0-indexed, TSV): 2=QuickRefID, 7=OwnerName, 8=Address1
  const insertOwner = db.prepare(`INSERT OR REPLACE INTO owners
    (account_number, owner_name, mailing_address) VALUES (?, ?, ?)`);

  const runBatch = db.transaction((rows) => {
    for (const row of rows) insertOwner.run(row);
  });

  const batch = [];

  const count = await parseFile(join(DATA_DIR, 'owner.txt'), 'tsv', (f) => {
    const acct = f[2]?.trim();
    if (!acct || !imported.has(acct)) return;
    batch.push([acct, f[7]?.trim() || '', f[8]?.trim() || '']);
    if (batch.length >= BATCH_SIZE) { runBatch([...batch]); batch.length = 0; }
  });

  if (batch.length) runBatch(batch);
  console.log(`  Done — ${count.toLocaleString()} owner rows processed.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

async function main() {
  const skipDownload = process.argv.includes('--skip-download');

  console.log('FBCAD Data Import (Fort Bend County)');
  console.log('=====================================');
  console.log(`Data dir  : ${DATA_DIR}`);
  console.log(`Import DB : ${DB_PATH}`);
  console.log(`Live DB   : ${LIVE_DB_PATH}`);
  console.log(`Tax year  : ${TAX_YEAR}\n`);

  mkdirSync(DATA_DIR, { recursive: true });

  if (!skipDownload) {
    if (checkAlreadyImported()) process.exit(0);

    console.log('[Step 1] Downloading WebsiteResidentialSegs.zip...');
    await downloadAndExtract(FBCAD_RES_URL, DATA_DIR, ['websiteresidentialsegs.txt']);

    console.log('\n[Step 2] Downloading PropertyDataExport.zip...');
    await downloadAndExtract(FBCAD_PROP_URL, DATA_DIR, ['property.txt', 'owner.txt']);
  } else {
    console.log('[Step 1-2] Skipped — using existing files.\n');
  }

  const db = openDb(DB_PATH);
  const start = Date.now();

  const residentialMap = await buildResidentialMap();
  await importProperties(db, residentialMap);
  await importBuildings(db, residentialMap);
  await importOwners(db);

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
