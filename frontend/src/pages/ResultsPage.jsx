import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const fmt = n =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const fmtNum = n => new Intl.NumberFormat('en-US').format(n);

function StatBox({ label, value, valueClass = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-stone-500 font-medium">{label}</span>
      <span className={`text-lg font-semibold text-stone-900 ${valueClass}`}>{value}</span>
    </div>
  );
}

function AddressSearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  async function search(q) {
    if (q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/property/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok) setResults(data);
    } finally {
      setLoading(false);
    }
  }

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(q), 350);
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-4 mb-6 relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        placeholder="Search another address or account number…"
        className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent placeholder-stone-400"
      />
      {loading && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-stone-400 text-xs">Searching…</span>}
      {results.length > 0 && (
        <ul className="absolute left-4 right-4 top-full mt-1 divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden bg-white shadow-md z-10">
          {results.map(p => (
            <li key={p.account_number}>
              <button
                onClick={() => { setQuery(''); setResults([]); onSelect(p.account_number); }}
                className="w-full text-left px-4 py-3 hover:bg-cream transition-colors"
              >
                <div className="font-medium text-stone-900 text-sm">{p.address}, {p.city} {p.zip}</div>
                <div className="text-xs text-stone-400 mt-0.5">
                  Account: {p.account_number}
                  {p.sqft && ` · ${Number(p.sqft).toLocaleString()} sqft`}
                  {p.year_built && ` · Built ${p.year_built}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const { accountNumber } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [property, setProperty] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setData(null);
    setProperty(null);
    setNeighborhood(null);

    async function load() {
      try {
        // Fetch comps and full property details in parallel
        const [compsRes, propRes] = await Promise.all([
          fetch(`/api/comps/${accountNumber}`),
          fetch(`/api/property/${accountNumber}`),
        ]);

        const compsJson = await compsRes.json();
        if (!compsRes.ok) throw new Error(compsJson.error);

        const propJson = propRes.ok ? await propRes.json() : null;

        setData(compsJson);
        setProperty(propJson);

        // Prefer nbhd_cd for tighter neighborhood stats; fall back to zip
        const nbhdKey = compsJson.subject?.nbhd_cd || compsJson.subject?.zip;
        if (nbhdKey) {
          const nbRes = await fetch(`/api/neighborhood/${encodeURIComponent(nbhdKey)}`);
          if (nbRes.ok) setNeighborhood(await nbRes.json());
        }
      } catch (e) {
        setError(e.message || 'Failed to load property data');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [accountNumber]);

  async function generatePacket() {
    setGenerating(true);
    try {
      const res = await fetch('/api/appeal/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      navigate(`/packet/${json.id}`);
    } catch (e) {
      setError(e.message || 'Failed to generate packet');
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <AddressSearchBar onSelect={acct => navigate(`/results/${acct}`)} />
        <div className="text-center py-20 text-stone-400">Loading property data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <AddressSearchBar onSelect={acct => navigate(`/results/${acct}`)} />
        <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-8 text-center">
          <p className="text-brand font-medium">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-sm text-stone-500 hover:text-stone-700 underline"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { subject, comps, analysis } = data;

  const prop = property || {};
  const ownerName = prop.owner_name || null;
  const quality = prop.quality || null;

  const currentValue = Number(subject.total_value);
  const priorValue = Number(subject.prior_total_value) || Number(prop.prior_total_value) || 0;
  const sqft = Number(subject.sqft);
  const yearBuilt = subject.year_built;
  const beds = subject.beds;
  const baths = subject.baths;
  const zip = subject.zip;
  const nbhdCd = subject.nbhd_cd;

  // YoY — prefer value from comps route (already computed), fall back to calculating
  const yoyChange = subject.yoy_change ?? (priorValue > 0
    ? Math.round(((currentValue - priorValue) / priorValue) * 1000) / 10
    : null);

  const percentAbove = analysis.percent_above_median;
  const isOverassessed = percentAbove > 5;
  const potentialSavings = analysis.potential_savings;
  const annualSavings = Math.round(potentialSavings * 0.021);
  const fiveYearSavings = annualSavings * 5;
  const medianCompValue = analysis.median_value_per_sqft * sqft;
  const streetCompCount = analysis.street_comp_count || 0;
  const poolSize = analysis.pool_size || comps.length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Search bar */}
      <AddressSearchBar onSelect={acct => navigate(`/results/${acct}`)} />

      {/* Property Card */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-stone-900 mb-0.5">{subject.address}</h2>
        <p className="text-sm text-stone-400 mb-5">
          {ownerName && <span>{ownerName} · </span>}
          Account {subject.account_number}
          {zip && <span> · {zip}</span>}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
          <StatBox
            label="Assessed Value"
            value={fmt(currentValue)}
          />
          <StatBox
            label="Prior Year"
            value={priorValue ? fmt(Number(priorValue)) : '—'}
          />
          <StatBox
            label="Year-over-Year Change"
            value={
              yoyChange !== null
                ? `${yoyChange >= 0 ? '+' : ''}${yoyChange.toFixed(1)}%`
                : '—'
            }
            valueClass={yoyChange !== null ? (yoyChange >= 0 ? 'text-red-600' : 'text-green-600') : ''}
          />
          <StatBox
            label="Size / Year Built"
            value={sqft && yearBuilt ? `${fmtNum(sqft)} sqft | ${yearBuilt}` : sqft ? `${fmtNum(sqft)} sqft` : '—'}
          />
          <StatBox
            label="Beds / Baths"
            value={beds || baths ? `${beds ?? 'N/A'} / ${baths ?? 'N/A'}` : 'N/A'}
          />
          <StatBox
            label="Quality / Condition"
            value={quality ? quality : '—'}
          />
          <StatBox
            label="Est. Annual Savings"
            value={annualSavings > 0 ? fmt(annualSavings) : 'None detected'}
            valueClass={annualSavings > 0 ? 'text-green-600' : 'text-stone-400'}
          />
          <StatBox
            label="Est. 5-Year Savings"
            value={fiveYearSavings > 0 ? fmt(fiveYearSavings) : '—'}
            valueClass={fiveYearSavings > 0 ? 'text-green-600' : 'text-stone-400'}
          />
          <StatBox
            label="vs. Neighborhood Median"
            value={`${percentAbove >= 0 ? '+' : ''}${percentAbove.toFixed(1)}%`}
            valueClass={isOverassessed ? 'text-red-600' : 'text-green-600'}
          />
        </div>
      </div>

      {/* Overassessment Banner */}
      {isOverassessed ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-green-800 mb-1">
            Your home appears overassessed by {fmt(potentialSavings)} ({percentAbove.toFixed(1)}%)
          </h3>
          <p className="text-sm text-green-700 mb-4">
            Your home is assessed at {fmt(currentValue)}. Based on {poolSize} similar homes in your
            neighborhood, the median value is {fmt(Math.round(medianCompValue))}.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-xs uppercase tracking-wide text-green-600 font-medium block mb-0.5">
                Potential Annual Savings
              </span>
              <span className="text-2xl font-bold text-green-700">{fmt(annualSavings)}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-green-600 font-medium block mb-0.5">
                5-Year Savings
              </span>
              <span className="text-2xl font-bold text-green-700">{fmt(fiveYearSavings)}</span>
            </div>
          </div>
          <p className="text-xs text-green-600">
            You may be overpaying {fmt(annualSavings)}/year in property taxes.
          </p>
          {yoyChange !== null && neighborhood?.median_yoy !== null && (
            <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-green-600 uppercase tracking-wide font-medium block mb-0.5">Your Increase</span>
                <div className={`font-bold text-base ${yoyChange > neighborhood.median_yoy ? 'text-red-600' : 'text-green-700'}`}>
                  {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-xs text-green-600 uppercase tracking-wide font-medium block mb-0.5">Neighborhood Median</span>
                <div className="font-bold text-base text-green-700">
                  {neighborhood.median_yoy >= 0 ? '+' : ''}{neighborhood.median_yoy}%
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-5">
          <p className="text-stone-700 font-medium">
            Your assessment looks fair compared to similar homes in your neighborhood.
          </p>
          {yoyChange !== null && neighborhood?.median_yoy !== null && (
            <div className="mt-3 pt-3 border-t border-stone-200 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-stone-500 uppercase tracking-wide font-medium block mb-0.5">Your Increase</span>
                <div className="font-bold text-base text-stone-700">
                  {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-xs text-stone-500 uppercase tracking-wide font-medium block mb-0.5">Neighborhood Median</span>
                <div className="font-bold text-base text-stone-700">
                  {neighborhood.median_yoy >= 0 ? '+' : ''}{neighborhood.median_yoy}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparable Properties */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6">
        <div className="flex items-baseline gap-3 mb-4">
          <h3 className="font-bold text-stone-900">Comparable Properties</h3>
          {streetCompCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
              {streetCompCount} on your street
            </span>
          )}
        </div>
        <div className="overflow-x-auto -mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="px-6 py-2 text-left text-xs uppercase tracking-wide text-stone-400 font-medium">Address</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Assessed</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Sqft</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Year</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Beds</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Baths</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wide text-stone-400 font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {comps.map(c => (
                <tr key={c.account_number} className={`${c.on_street ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-stone-50'}`}>
                  <td className="px-6 py-3 text-stone-700">
                    {c.address}
                    {c.on_street && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Same street</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">{fmt(c.total_value)}</td>
                  <td className="px-4 py-3 text-right text-stone-500">{Number(c.sqft).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-stone-500">{c.year_built}</td>
                  <td className="px-4 py-3 text-right text-stone-500">{c.beds ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-stone-500">{c.baths ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${c.match_pct >= 80 ? 'text-green-600' : 'text-stone-400'}`}>
                      {c.match_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Neighborhood Overview */}
      {neighborhood && (
        <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6">
          <h3 className="font-bold text-stone-900 mb-4">
            Neighborhood Overview
            {nbhdCd
              ? <span className="text-stone-400 font-normal text-sm ml-2">(code: {nbhdCd})</span>
              : zip && <span className="text-stone-400 font-normal text-sm ml-2">(zip: {zip})</span>
            }
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <span className="text-xs uppercase tracking-wide text-stone-500 font-medium block mb-0.5">Properties</span>
              <span className="text-lg font-semibold text-stone-900">{fmtNum(neighborhood.count)}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-stone-500 font-medium block mb-0.5">Avg Assessment</span>
              <span className="text-lg font-semibold text-stone-900">{fmt(neighborhood.avg_value)}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-stone-500 font-medium block mb-0.5">Median Assessment</span>
              <span className="text-lg font-semibold text-stone-900">{fmt(neighborhood.median_value)}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-stone-500 font-medium block mb-0.5">Avg Sqft</span>
              <span className="text-lg font-semibold text-stone-900">{fmtNum(neighborhood.avg_sqft)}</span>
            </div>
            {neighborhood.median_yoy !== null && (
              <div>
                <span className="text-xs uppercase tracking-wide text-stone-500 font-medium block mb-0.5">Median YoY Change</span>
                <span className="text-lg font-semibold text-stone-900">
                  {neighborhood.median_yoy >= 0 ? '+' : ''}{neighborhood.median_yoy}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA — Get Appeal Packet */}
      <div className="bg-stone-800 rounded-lg p-6 text-white">
        <h3 className="text-xl font-bold mb-1">Get Your Appeal Packet</h3>
        <p className="text-stone-300 text-sm mb-4">
          Pre-filled with your property data and {comps.length} comparable properties. Ready to file with Harris County.
        </p>
        {isOverassessed && (
          <p className="text-green-400 text-sm mb-5">
            You could save {fmt(annualSavings)}/year. The packet is free.
          </p>
        )}
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={generatePacket}
          disabled={generating}
          className="w-full bg-white text-stone-900 font-bold py-3 rounded-lg hover:bg-stone-100 transition-colors disabled:opacity-60 text-base"
        >
          {generating ? 'Generating…' : 'Get Your Appeal Packet — Free'}
        </button>
      </div>
    </div>
  );
}
