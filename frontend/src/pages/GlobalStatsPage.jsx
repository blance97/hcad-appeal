import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const fmt = n => new Intl.NumberFormat('en-US').format(n);
const fmtCurrency = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const pct = (num, den) => den ? `${Math.round((num / den) * 100)}%` : '—';

function MetricCard({ label, today, week, total }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">{label}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Today', today], ['7 Days', week], ['All Time', total]].map(([lbl, val]) => (
          <div key={lbl}>
            <div className="text-xl font-bold text-zinc-900">{fmt(val)}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniChart({ daily }) {
  if (!daily?.length) return <div className="h-12 flex items-center justify-center text-xs text-zinc-300">No data</div>;
  const sorted = [...daily].reverse();
  const max = Math.max(...sorted.map(d => d.requests), 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {sorted.map(d => (
        <div
          key={d.day}
          title={`${d.day}: ${fmt(d.requests)} requests`}
          className="flex-1 bg-brand/70 rounded-t-sm min-h-[2px]"
          style={{ height: `${Math.max(2, (d.requests / max) * 48)}px` }}
        />
      ))}
    </div>
  );
}

function ActivityChart({ daily }) {
  if (!daily?.length) return <div className="h-24 flex items-center justify-center text-sm text-zinc-400">No activity data yet.</div>;
  const sorted = [...daily].reverse();
  const max = Math.max(...sorted.map(d => d.requests), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {sorted.map(d => (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full bg-brand/80 rounded-t-sm transition-all group-hover:bg-brand"
              style={{ height: `${Math.max(2, (d.requests / max) * 96)}px` }}
            />
            <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              {d.day} · {fmt(d.requests)} req · {fmt(d.unique_visitors)} visitors
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-zinc-400 mt-1">
        <span>{sorted[0]?.day}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function CombinedView({ combined, counties }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Searches" {...combined.searches} />
        <MetricCard label="Property Views" {...combined.property_views} />
        <MetricCard label="Packets Generated" {...combined.packets_generated} />
        <MetricCard label="PDFs Downloaded" {...combined.pdfs_downloaded} />
        <MetricCard label="Unique Visitors (IP)" {...combined.unique_visitors} />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Per-County Breakdown</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-100">
              <th className="text-left px-5 py-2.5 font-semibold">County</th>
              <th className="text-right px-4 py-2.5 font-semibold">Properties</th>
              <th className="text-right px-4 py-2.5 font-semibold">Searches</th>
              <th className="text-right px-4 py-2.5 font-semibold">Views</th>
              <th className="text-right px-4 py-2.5 font-semibold">Packets</th>
              <th className="text-right px-4 py-2.5 font-semibold">Conversion</th>
              <th className="px-4 py-2.5 w-32">Activity</th>
            </tr>
          </thead>
          <tbody>
            {counties.map(c => (
              <tr key={c.countyId} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3">
                  <div className="font-semibold text-zinc-900">{c.cad_name}</div>
                  <div className="text-xs text-zinc-400">{c.county_name}</div>
                </td>
                <td className="text-right px-4 py-3 text-zinc-600">{fmt(c.db.property_count)}</td>
                <td className="text-right px-4 py-3 text-zinc-600">{fmt(c.searches.total)}</td>
                <td className="text-right px-4 py-3 text-zinc-600">{fmt(c.property_views.total)}</td>
                <td className="text-right px-4 py-3 text-zinc-600">{fmt(c.packets_generated.total)}</td>
                <td className="text-right px-4 py-3">
                  <span className="text-brand font-semibold">{pct(c.packets_generated.total, c.property_views.total)}</span>
                  <span className="text-xs text-zinc-400 ml-1">view→packet</span>
                </td>
                <td className="px-4 py-3 w-32">
                  <MiniChart daily={c.daily_last_30} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountyDetail({ county }) {
  const maxRequests = Math.max(...(county.daily_last_30?.map(d => d.requests) || [0]), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard label="Searches" {...county.searches} />
        <MetricCard label="Property Views" {...county.property_views} />
        <MetricCard label="Packets Generated" {...county.packets_generated} />
        <MetricCard label="PDFs Downloaded" {...county.pdfs_downloaded} />
        <MetricCard label="Unique Visitors (IP)" {...county.unique_visitors} />

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Database</div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-zinc-900">{fmt(county.db.property_count)}</div>
              <div className="text-xs text-zinc-400 mt-0.5">Properties</div>
            </div>
            <div>
              <div className="text-xl font-bold text-zinc-900">{county.db.avg_value ? fmtCurrency(county.db.avg_value) : '—'}</div>
              <div className="text-xs text-zinc-400 mt-0.5">Avg assessed value</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-4">Daily Activity (last 30 days)</div>
        <ActivityChart daily={county.daily_last_30} />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Conversion Funnel</div>
        {[
          ['Searches', county.searches.total],
          ['Property Views', county.property_views.total],
          ['Packets Generated', county.packets_generated.total],
          ['PDFs Downloaded', county.pdfs_downloaded.total],
        ].map(([label, val], i, arr) => {
          const prev = i > 0 ? arr[i - 1][1] : val;
          const barPct = arr[0][1] ? (val / arr[0][1]) * 100 : 0;
          return (
            <div key={label} className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-600">{label}</span>
                <span className="font-semibold text-zinc-900">{fmt(val)} <span className="text-xs text-zinc-400 font-normal">{i > 0 ? `(${pct(val, prev)} of prev)` : ''}</span></span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full" style={{ width: `${barPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Top Searches</div>
          {!county.top_searches?.length && <p className="text-sm text-zinc-400">No data yet.</p>}
          <ol className="space-y-2">
            {county.top_searches?.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate mr-2"><span className="text-zinc-400 mr-2">{i + 1}.</span>{s.query}</span>
                <span className="text-zinc-400 flex-shrink-0">{fmt(s.count)}×</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Top Viewed Properties</div>
          {!county.top_properties?.length && <p className="text-sm text-zinc-400">No data yet.</p>}
          <ol className="space-y-2">
            {county.top_properties?.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate mr-2 font-mono text-xs"><span className="text-zinc-400 mr-2">{i + 1}.</span>{p.account_number}</span>
                <span className="text-zinc-400 flex-shrink-0">{fmt(p.views)}×</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function GlobalStatsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('combined');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/api/stats')
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { id: 'combined', label: 'All Counties' },
    ...(data?.counties || []).map(c => ({ id: c.countyId, label: c.cad_name })),
  ];

  const activeCounty = data?.counties?.find(c => c.countyId === tab);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-4 py-3.5 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </div>
              <span className="font-bold text-zinc-900 tracking-tight">TX Appeal</span>
            </Link>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-semibold text-zinc-500">Stats</span>
          </div>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading && !data ? (
          <div className="space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-white rounded-xl border border-zinc-200" />)}
          </div>
        ) : data ? (
          <>
            <div className="flex gap-1 mb-6 bg-white border border-zinc-200 rounded-xl p-1 w-fit">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    tab === t.id ? 'bg-brand text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'combined'
              ? <CombinedView combined={data.combined} counties={data.counties} />
              : activeCounty && <CountyDetail county={activeCounty} />
            }
          </>
        ) : null}
      </main>

      <footer className="border-t border-zinc-200 bg-white px-4 py-4 text-center text-xs text-zinc-400">
        Internal stats · Not legal or tax advice
      </footer>
    </div>
  );
}
