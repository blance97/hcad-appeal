import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initDb } from './db/database.js';
import propertiesRouter from './routes/properties.js';
import compsRouter from './routes/comps.js';
import appealRouter from './routes/appeal.js';
import neighborhoodRouter from './routes/neighborhood.js';
import statsRouter from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/property', propertiesRouter);
app.use('/api/comps', compsRouter);
app.use('/api/appeal', appealRouter);
app.use('/api/neighborhood', neighborhoodRouter);
app.use('/api/stats', statsRouter);

const COUNTY_CONFIG = {
  county_name:    process.env.COUNTY_NAME    || 'Harris County',
  cad_name:       process.env.CAD_NAME       || 'HCAD',
  cad_full_name:  process.env.CAD_FULL_NAME  || 'Harris County Appraisal District',
  filing_url:     process.env.FILING_URL     || 'iFile.hcad.org',
  tax_rate:       parseFloat(process.env.TAX_RATE) || 0.021,
  state:          process.env.STATE          || 'Texas',
};

app.get('/api/health', async (_, res) => {
  try {
    const { getDb } = await import('./db/database.js');
    const { rows } = await getDb().execute(
      'SELECT MAX(tax_year) AS tax_year, COUNT(*) AS property_count FROM properties'
    );
    res.json({
      status: 'ok',
      tax_year: Number(rows[0]?.tax_year) || null,
      property_count: Number(rows[0]?.property_count) || null,
      ...COUNTY_CONFIG,
    });
  } catch {
    res.json({ status: 'ok', tax_year: null, property_count: null, ...COUNTY_CONFIG });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Backend running on :${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
