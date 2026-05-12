import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const fmt = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtNum = n => new Intl.NumberFormat('en-US').format(n);

function StatBox({ label, value, valueClass = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-400 font-semibold">{label}</span>
      <span className={`text-lg font-bold text-zinc-900 ${valueClass}`}>{value}</span>
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
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-4 mb-4 relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Search another address or account number…"
          className="w-full border border-zinc-300 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder-zinc-400 transition"
        />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zinc-200 border-t-brand rounded-full animate-spin" />}
      </div>
      {results.length > 0 && (
        <ul className="absolute left-4 right-4 top-full mt-1 divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-card-hover z-10">
          {results.map(p => (
            <li key={p.account_number}>
              <button
                onClick={() => { setQuery(''); setResults([]); onSelect(p.account_number); }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="font-semibold text-zinc-900 text-sm">{p.address}, {p.city} {p.zip}</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Account {p.account_number}
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

function Skeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
      <div className="h-14 bg-zinc-100 rounded-2xl" />
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <div className="h-6 bg-zinc-100 rounded w-48" />
        <div className="h-4 bg-zinc-100 rounded w-32" />
        <div className="grid grid-cols-3 gap-6 pt-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-zinc-100 rounded w-20" />
              <div className="h-5 bg-zinc-100 rounded w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-36 bg-zinc-100 rounded-2xl" />
      <div className="h-64 bg-white rounded-2xl border border-zinc-200" />
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
        const [compsRes, propRes] = await Promise.all([
          fetch(`/api/comps/${accountNumber}`),
          fetch(`/api/property/${accountNumber}`),
        ]);

        const compsJson = await compsRes.json();
        if (!compsRes.ok) throw new Error(compsJson.error);

        const propJson = propRes.ok ? await propRes.json() : null;
        setData(compsJson);
        setProperty(propJson);

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

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <AddressSearchBar onSelect={acct => navigate(`/results/${acct}`)} />
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-zinc-700 font-semibold mb-1">{error}</p>
          <button onClick={() => navigate('/')} className="mt-3 text-sm text-brand hover:underline">
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
    <div className="max-w-3xl mx-auto space-y-4">
      <AddressSearchBar onSelect={acct => navigate(`/results/${acct}`)} />

      {/* Property Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">{subject.address}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {ownerName && <span>{ownerName} · </span>}
              Account {subject.account_number}
              {zip && <span> · {zip}</span>}
            </p>
          </div>
          {isOverassessed && (
            <span className="flex-shrink-0 text-xs font-semibold bg-red-50 text-red-600 px-2.5 py-1 rounded-full">
              Overassessed
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
          <StatBox label="Assessed Value" value={fmt(currentValue)} />
          <StatBox label="Prior Year" value={priorValue ? fmt(priorValue) : '—'} />
          <StatBox
            label="YoY Change"
            value={yoyChange !== null ? `${yoyChange >= 0 ? '+' : ''}${yoyChange.toFixed(1)}%` : '—'}
            valueClass={yoyChange !== null ? (yoyChange >= 0 ? 'text-red-500' : 'text-emerald-600') : ''}
          />
          <StatBox
            label="Size / Year Built"
            value={sqft && yearBuilt ? `${fmtNum(sqft)} sqft · ${yearBuilt}` : sqft ? `${fmtNum(sqft)} sqft` : '—'}
          />
          <StatBox
            label="Beds / Baths"
            value={beds || baths ? `${beds ?? 'N/A'} bd · ${baths ?? 'N/A'} ba` : 'N/A'}
          />
          <StatBox label="Quality" value={quality || '—'} />
          <StatBox
            label="Est. Annual Savings"
            value={annualSavings > 0 ? fmt(annualSavings) : 'None detected'}
            valueClass={annualSavings > 0 ? 'text-emerald-600' : 'text-zinc-400'}
          />
          <StatBox
            label="Est. 5-Year Savings"
            value={fiveYearSavings > 0 ? fmt(fiveYearSavings) : '—'}
            valueClass={fiveYearSavings > 0 ? 'text-emerald-600' : 'text-zinc-400'}
          />
          <StatBox
            label="vs. Neighborhood"
            value={`${percentAbove >= 0 ? '+' : ''}${percentAbove.toFixed(1)}%`}
            valueClass={isOverassessed ? 'text-red-500' : 'text-emerald-600'}
          />
        </div>
      </div>

      {/* Overassessment Banner */}
      {isOverassessed ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-base font-bold text-emerald-800">
              Overassessed by {fmt(potentialSavings)} ({percentAbove.toFixed(1)}%)
            </h3>
          </div>
          <p className="text-sm text-emerald-700 mb-5">
            Your home is assessed at {fmt(currentValue)}, but {poolSize} similar homes in your neighborhood have a median value of {fmt(Math.round(medianCompValue))}.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="bg-white rounded-xl p-4 border border-emerald-100">
              <span className="text-xs uppercase tracking-wide text-emerald-600 font-semibold block mb-1">Annual Savings</span>
              <span className="text-2xl font-extrabold text-emerald-700">{fmt(annualSavings)}</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-emerald-100">
              <span className="text-xs uppercase tracking-wide text-emerald-600 font-semibold block mb-1">5-Year Savings</span>
              <span className="text-2xl font-extrabold text-emerald-700">{fmt(fiveYearSavings)}</span>
            </div>
          </div>
          <details className="group mb-4">
            <summary className="text-xs text-emerald-600/70 cursor-pointer hover:text-emerald-700 transition-colors list-none flex items-center gap-1 select-none">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              How these numbers are calculated
            </summary>
            <div className="mt-2 text-xs text-emerald-700/80 leading-relaxed space-y-1.5 pl-4">
              <p><span className="font-semibold">Value reduction ({fmt(potentialSavings)}):</span> The gap between your assessed value per sqft ({fmt(analysis.subject_value_per_sqft)}/sqft) and the neighborhood median ({fmt(analysis.median_value_per_sqft)}/sqft), multiplied by your {Number(subject.sqft).toLocaleString()} sqft. Based on {poolSize} similar homes in your HCAD neighborhood.</p>
              <p><span className="font-semibold">Annual savings ({fmt(annualSavings)}):</span> Value reduction × 2.1%, the approximate effective property tax rate in Harris County. Your actual rate depends on your specific taxing entities (city, school district, MUD, etc.).</p>
              <p><span className="font-semibold">Note:</span> These are estimates. HCAD may not grant the full reduction. Filing is free and your value cannot increase as a result of a protest.</p>
            </div>
          </details>
          {yoyChange !== null && neighborhood?.median_yoy !== null && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-200 text-sm">
              <div>
                <span className="text-xs text-emerald-600 uppercase tracking-wide font-semibold block mb-1">Your Increase</span>
                <div className={`font-bold text-base ${yoyChange > neighborhood.median_yoy ? 'text-red-500' : 'text-emerald-700'}`}>
                  {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-xs text-emerald-600 uppercase tracking-wide font-semibold block mb-1">Neighborhood Median</span>
                <div className="font-bold text-base text-emerald-700">
                  {neighborhood.median_yoy >= 0 ? '+' : ''}{neighborhood.median_yoy}%
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-5">
          <p className="text-zinc-700 font-semibold text-sm">
            Your assessment looks fair compared to similar homes in your neighborhood.
          </p>
          {yoyChange !== null && neighborhood?.median_yoy !== null && (
            <div className="mt-3 pt-3 border-t border-zinc-200 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold block mb-1">Your Increase</span>
                <div className="font-bold text-zinc-800">{yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold block mb-1">Neighborhood Median</span>
                <div className="font-bold text-zinc-800">{neighborhood.median_yoy >= 0 ? '+' : ''}{neighborhood.median_yoy}%</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparable Properties */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-bold text-zinc-900">Comparable Properties</h3>
          {streetCompCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              {streetCompCount} on your street
            </span>
          )}
        </div>
        <div className="overflow-x-auto -mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-6 py-2.5 text-left text-xs uppercase tracking-wide text-zinc-400 font-semibold">Address</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Assessed</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Sqft</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Year</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Bed</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Bath</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-zinc-400 font-semibold">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {comps.map(c => (
                <tr key={c.account_number} className={c.on_street ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                  <td className="px-6 py-3 text-zinc-700 font-medium">
                    {c.address}
                    {c.on_street && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Same street</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-800">{fmt(c.total_value)}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{Number(c.sqft).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{c.year_built}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{c.beds ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{c.baths ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${c.match_pct >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                      {c.match_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Methodology explanation */}
        <div className="mt-4 pt-4 border-t border-zinc-100">
          <details className="group">
            <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 transition-colors list-none flex items-center gap-1.5 select-none">
              <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              How we pick these comps
            </summary>
            <div className="mt-3 space-y-2.5 text-xs text-zinc-500 leading-relaxed">
              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <div>
                  <span className="font-semibold text-zinc-700">Same-street first (up to 5).</span>{' '}
                  Properties on your exact street with similar size (within 20%) and year built (within 10 years). These are the strongest evidence at an ARB hearing. HCAD can't easily justify a $50K gap between homes on the same block with identical floor plans.
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded bg-zinc-100 text-zinc-600 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <div>
                  <span className="font-semibold text-zinc-700">HCAD neighborhood code (fills to 10).</span>{' '}
                  HCAD groups properties into tight appraisal neighborhoods of 50–300 homes (your code: {nbhdCd || zip}). We pull the closest-matching homes from that group. Same size and year filters apply.
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded bg-zinc-100 text-zinc-600 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <div>
                  <span className="font-semibold text-zinc-700">Analysis uses the full pool ({poolSize} homes), not just the 10 shown.</span>{' '}
                  The overassessment % and savings estimate are calculated from all eligible homes in your neighborhood, not cherry-picked. $/sqft is used instead of raw value to normalize for size differences.
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Neighborhood Overview */}
      {neighborhood && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-6">
          <h3 className="font-bold text-zinc-900 mb-4">
            Neighborhood Overview
            <span className="text-zinc-400 font-normal text-sm ml-2">
              {nbhdCd ? `code ${nbhdCd}` : zip}
            </span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <StatBox label="Properties" value={fmtNum(neighborhood.count)} />
            <StatBox label="Avg Assessment" value={fmt(neighborhood.avg_value)} />
            <StatBox label="Median Assessment" value={fmt(neighborhood.median_value)} />
            <StatBox label="Avg Sqft" value={fmtNum(neighborhood.avg_sqft)} />
            {neighborhood.median_yoy !== null && (
              <StatBox
                label="Median YoY"
                value={`${neighborhood.median_yoy >= 0 ? '+' : ''}${neighborhood.median_yoy}%`}
              />
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="rounded-2xl bg-brand p-6 text-white">
        <h3 className="text-xl font-bold mb-1">Get Your Appeal Packet</h3>
        <p className="text-indigo-200 text-sm mb-4">
          Pre-filled with your property data and {comps.length} comparable properties. Ready to file with Harris County ARB.
        </p>
        {isOverassessed && (
          <p className="text-emerald-300 text-sm font-semibold mb-5">
            Potential savings: {fmt(annualSavings)}/year · {fmt(fiveYearSavings)} over 5 years
          </p>
        )}
        {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
        <button
          onClick={generatePacket}
          disabled={generating}
          className="w-full bg-white text-brand font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-60 text-base"
        >
          {generating ? 'Generating…' : 'Get Your Free Appeal Packet'}
        </button>
      </div>
    </div>
  );
}
