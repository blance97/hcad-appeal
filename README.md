# HCAD Appeal

A free tool for Harris County homeowners to check if they're overassessed and generate a ready-to-file property tax appeal packet.

**Live:** [hcad.lancedinh.com](https://hcad.lancedinh.com) &nbsp;·&nbsp; Built by [Lance Dinh](https://www.linkedin.com/in/lance-dinh/)

---

## What it does

1. Search your address or HCAD account number
2. See how your assessed value compares to similar homes in your neighborhood
3. Download a pre-filled appeal packet (PDF + printable HTML) with a formal protest letter and comparable properties evidence table — ready to file with the Harris County Appraisal Review Board

All data comes from HCAD's own public records. No account required. Free.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Express.js, Node 20 |
| Database | SQLite (via `@libsql/client`) |
| PDF | `pdf-lib` (server-side) |
| Deploy | Docker → GHCR → ArgoCD → k3s |

---

## API Reference

### Properties

```
GET /api/property/search?q=<query>
```
Search by address or account number. Returns up to 10 results. Query must be at least 3 characters. All tokens are ANDed — `"123 main"` only matches addresses containing both words.

```
GET /api/property/:accountNumber
```
Full property detail including owner, building info, and assessed value.

### Comparables

```
GET /api/comps/:accountNumber
```
Returns comparable properties for the given account. Strategy (in order):
1. Same street (up to 5, deduplicated by address)
2. Same HCAD neighborhood code (`nbhd_cd`) — tight ~50–300 home appraisal neighborhoods
3. Falls back to zip code if neighborhood has fewer than 3 comps

Also returns `analysis` with median $/sqft and potential savings calculated from the **full neighborhood pool** (not just displayed comps), and `pool_size`.

### Neighborhood

```
GET /api/neighborhood/:geoId
```
Accepts an `nbhd_cd` (e.g. `8307.09`) or zip code. Returns count, avg/median assessed value, avg sqft, and YoY change stats.

### Appeal Packets

```
POST /api/appeal/generate
Body: { accountNumber: string }
```
Generates an appeal packet with a formal protest letter, comparable properties table, and filing instructions. Saves to the database and returns the packet JSON plus an `id`.

```
GET /api/appeal/:id/html
```
Returns a printable HTML version of the packet.

```
GET /api/appeal/:id/pdf
```
Downloads the packet as a PDF.

### Meta

```
GET /api/health
```
Returns `{ status, tax_year, property_count }` — useful for confirming the database is loaded and which year's data is active.

```
GET /api/stats
```
Usage analytics: searches, property views, packet generations, PDF downloads (today / week / total), unique visitors, top properties, top searches, and 30-day daily breakdown.

---

## Data & Import

HCAD publishes annual bulk exports at [hcad.org](https://hcad.org/hcad-resources/hcad-appraisal-data/). The import script auto-downloads and processes:

- `Real_acct_owner.zip` → accounts, addresses, assessed values, neighborhood codes
- `Real_building_land.zip` → sqft, year built, beds/baths

```bash
# Full download + import (~6 min)
node scripts/import-hcad.js

# Import from already-downloaded files in data/
node scripts/import-hcad.js --skip-download
```

The script runs a pre-check before importing: if the database already contains data for the current tax year, it exits immediately (safe to run repeatedly).

### Annual CronJob (Kubernetes)

A Kubernetes CronJob runs every Sunday in April and May at 6am:

1. Hits the HCAD API to check if new-year data is available
2. Compares to `MAX(tax_year)` in the current database — skips if already up to date
3. Downloads and imports into a temp database (`hcad_import.db`)
4. Runs `PRAGMA wal_checkpoint(TRUNCATE)` to flush all WAL data into the main file
5. Atomically renames to `hcad.db`
6. Triggers a `kubectl rollout restart` on the backend so it picks up the new data immediately

```bash
# Trigger manually (e.g. for initial load)
kubectl create job hcad-import-now --from=cronjob/hcad-import -n hcad-appeal
kubectl logs -n hcad-appeal -l job-name=hcad-import-now -c import -f
```

---

## Running Locally

```bash
# Backend
cd backend
npm install
node scripts/import-hcad.js   # one-time data load
npm run dev                   # starts on :3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # starts on :5173, proxies /api to :3001
```

### Environment Variables

```env
# backend/.env
PORT=3001
DB_PATH=../data/hcad.db
CORS_ORIGIN=http://localhost:5173
```

---

## Deployment

Images are built and pushed to GHCR on every push to `main`:
- `ghcr.io/blance97/hcad-appeal-backend`
- `ghcr.io/blance97/hcad-appeal-frontend`

The GitHub Actions `deploy` job then commits the new image SHA into [`homelab-k3s-cluster`](https://github.com/blance97/homelab-k3s-cluster), which ArgoCD watches and syncs automatically.

The backend requires a persistent volume (`/data/hcad.db`) — run the import job after first deploy to populate it.

---

## Comparable Selection Logic

### Evidence comps (shown in the table, up to 10)

**Step 1 — Same-street comps (up to 5)**
Properties on the exact same street where:
- Square footage within ±20% of the subject
- Year built within ±10 years
- One entry per physical address (deduped)
- Ordered by closest sqft to the subject

Same-street comps are the strongest ARB evidence because they share location, builder, and usually floor plan. HCAD appraisers struggle to justify material differences between homes on the same block.

**Step 2 — HCAD neighborhood comps (fills to 10)**
If fewer than 10 comps found on the street, additional properties are pulled from the same HCAD `nbhd_cd` — tight appraisal neighborhoods of ~50–300 homes that HCAD itself uses for equity analysis. Same sqft ±20%, year ±10 filter applies, ordered by closest sqft.

**Step 3 — Zip code fallback**
If the neighborhood code returns fewer than 3 comps (rare), the search widens to the full zip code with the same sqft and year filters.

### Analysis pool (used for median $/sqft and savings estimate)

The overassessment calculation uses **all** eligible properties in the HCAD neighborhood (sqft ±20%, no year cap), not just the 10 displayed. This gives a statistically robust median across hundreds of homes rather than relying on 10 cherry-picked results. Pool size is shown on the results page (e.g. "721 similar homes").

**Why $/sqft instead of total value?**
Comparing raw assessed values ignores size differences. A 2,000 sqft home assessed at $400K and a 2,500 sqft home at $500K are both at $200/sqft — equivalent. Assessed value per square foot normalizes for size and is the metric HCAD itself uses internally.

**Savings estimate**
`Value reduction = (your $/sqft − neighborhood median $/sqft) × your sqft`
`Annual tax savings ≈ value reduction × 2.1%` (approximate Harris County effective rate — actual rate varies by taxing entities)

---

## Legal

Data sourced from HCAD public records. Not legal or tax advice. Filing a protest does not guarantee a reduction.
