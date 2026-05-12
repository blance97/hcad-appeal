CREATE TABLE IF NOT EXISTS properties (
  account_number TEXT PRIMARY KEY,
  address        TEXT NOT NULL,
  city           TEXT,
  zip            TEXT,
  state_class    TEXT,
  land_value     INTEGER,
  improvement_value INTEGER,
  total_value    INTEGER,
  prior_total_value INTEGER,
  nbhd_cd        TEXT,
  tax_year       INTEGER,
  imported_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buildings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT NOT NULL REFERENCES properties(account_number),
  sqft           INTEGER,
  year_built     INTEGER,
  beds           INTEGER,
  baths          REAL,
  stories        INTEGER,
  condition      TEXT,
  quality        TEXT
);

CREATE TABLE IF NOT EXISTS owners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT NOT NULL REFERENCES properties(account_number),
  owner_name     TEXT,
  mailing_address TEXT
);

CREATE TABLE IF NOT EXISTS appeal_packets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT NOT NULL REFERENCES properties(account_number),
  created_at     TEXT DEFAULT (datetime('now')),
  user_id        INTEGER,
  packet_json    TEXT NOT NULL,
  status         TEXT DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS events (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  value TEXT,
  ip    TEXT,
  ts    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_ts    ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_properties_zip    ON properties(zip);
CREATE INDEX IF NOT EXISTS idx_properties_nbhd   ON properties(nbhd_cd);
CREATE INDEX IF NOT EXISTS idx_properties_addr   ON properties(address);
CREATE INDEX IF NOT EXISTS idx_buildings_acct    ON buildings(account_number);
CREATE INDEX IF NOT EXISTS idx_buildings_sqft    ON buildings(sqft);
CREATE INDEX IF NOT EXISTS idx_buildings_year    ON buildings(year_built);
