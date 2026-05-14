import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initDb, getDb } from './db/database.js';
import { COUNTIES } from './counties.js';
import propertiesRouter from './routes/properties.js';
import compsRouter from './routes/comps.js';
import appealRouter from './routes/appeal.js';
import neighborhoodRouter from './routes/neighborhood.js';
import statsRouter from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.param('county', (req, res, next, county) => {
  if (!COUNTIES[county]) return res.status(404).json({ error: `Unknown county: ${county}` });
  req.countyId = county;
  req.countyConfig = COUNTIES[county];
  req.db = getDb(county);
  next();
});

app.use('/api/:county/property', propertiesRouter);
app.use('/api/:county/comps', compsRouter);
app.use('/api/:county/appeal', appealRouter);
app.use('/api/:county/neighborhood', neighborhoodRouter);
app.use('/api/:county/stats', statsRouter);

app.get('/api/health', async (_, res) => {
  const counties = await Promise.all(
    Object.values(COUNTIES).map(async c => {
      try {
        const db = getDb(c.id);
        const { rows } = await db.execute('SELECT MAX(tax_year) AS tax_year, COUNT(*) AS property_count FROM properties');
        return { ...c, status: 'ok', tax_year: Number(rows[0]?.tax_year) || null, property_count: Number(rows[0]?.property_count) || null };
      } catch {
        return { ...c, status: 'error', tax_year: null, property_count: null };
      }
    })
  );
  res.json({ status: 'ok', counties });
});

app.get('/api/:county/health', async (req, res) => {
  try {
    const { rows } = await req.db.execute('SELECT MAX(tax_year) AS tax_year, COUNT(*) AS property_count FROM properties');
    res.json({ ...req.countyConfig, status: 'ok', tax_year: Number(rows[0]?.tax_year) || null, property_count: Number(rows[0]?.property_count) || null });
  } catch {
    res.json({ ...req.countyConfig, status: 'error', tax_year: null, property_count: null });
  }
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

initDb()
  .then(() => app.listen(PORT, () => console.log(`Backend running on :${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
