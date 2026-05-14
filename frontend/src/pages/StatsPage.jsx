import React, { useState, useEffect, useCallback } from 'react';
import { useCounty } from '../CountyContext.jsx';

const fmt = n => new Intl.NumberFormat('en-US').format(n);
const fmtCurrency = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function StatCard({ label, today, week, total }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">{label}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-bold text-zinc-900">{fmt(today)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Today</div>
        </div>
        <div>
          <div className="text-xl font-bold text-zinc-900">{fmt(week)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">7 days</div>
        </div>
        <div>
          <div className="text-xl font-bold text-zinc-900">{fmt(total)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">All time</div>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { countyId } = useCounty();
  const [token, setToken] = useState(() => localStorage.getItem('stats_token') || '');
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async (t) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/${countyId}/stats`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        setError('Invalid token');
        localStorage.removeItem('stats_token');
        setToken('');
        return;
      }
      if (!res.ok) throw new Error('Failed to load stats');
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token && countyId) fetchStats(token);
  }, [token, countyId, fetchStats]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    localStorage.setItem('stats_token', input.trim());
    setToken(input.trim());
    setInput('');
  }

  if (!token) {
    return (
      <div className="max-w-sm mx-auto pt-16">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-8">
          <h1 className="text-xl font-bold text-zinc-900 mb-1">Stats</h1>
          <p className="text-sm text-zinc-400 mb-6">Enter your stats token to continue.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Bearer token"
              className="w-full border border-zinc-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-brand text-white font-semibold py-2.5 rounded-xl hover:bg-brand/90 transition-colors text-sm"
            >
              View Stats
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-zinc-100 rounded-2xl" />)}
      </div>
    );
  }

  if (!data) return null;

  const maxRequests = Math.max(...data.daily_last_30.map(d => d.requests), 1);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-zinc-900">Usage Stats</h1>
        <button
          onClick={() => { localStorage.removeItem('stats_token'); setToken(''); setData(null); }}
          className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Searches" {...data.searches} />
        <StatCard label="Property Views" {...data.property_views} />
        <StatCard label="Packets Generated" {...data.packets_generated} />
        <StatCard label="PDFs Downloaded" {...data.pdfs_downloaded} />
      </div>

      {/* Unique visitors */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Unique Visitors (by IP)</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {['today', 'week', 'total'].map(k => (
            <div key={k}>
              <div className="text-xl font-bold text-zinc-900">{fmt(data.unique_visitors[k])}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{k === 'week' ? '7 days' : k.charAt(0).toUpperCase() + k.slice(1)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity chart */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-card p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-4">Daily Activity (last 30 days)</div>
        <div className="flex items-end gap-1 h-24">
          {[...data.daily_last_30].reverse().map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full bg-brand/80 rounded-t-sm transition-all group-hover:bg-brand"
                style={{ height: `${Math.max(2, (d.requests / maxRequests) * 96)}px` }}
              />
              <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                {d.day}<br />{fmt(d.requests)} requests · {fmt(d.unique_visitors)} visitors
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-zinc-400 mt-1">
          <span>{data.daily_last_30.at(-1)?.day}</span>
          <span>Today</span>
        </div>
      </div>

      {/* Top searches + top properties */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-zinc-200 shadow-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Top Searches</div>
          {data.top_searches.length === 0 && <p className="text-sm text-zinc-400">No data yet.</p>}
          <ol className="space-y-2">
            {data.top_searches.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate mr-2">
                  <span className="text-zinc-400 mr-2">{i + 1}.</span>
                  {s.query}
                </span>
                <span className="text-zinc-400 flex-shrink-0">{fmt(s.count)}×</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Top Viewed Properties</div>
          {data.top_properties.length === 0 && <p className="text-sm text-zinc-400">No data yet.</p>}
          <ol className="space-y-2">
            {data.top_properties.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate mr-2 font-mono text-xs">
                  <span className="text-zinc-400 mr-2">{i + 1}.</span>
                  {p.account_number}
                </span>
                <span className="text-zinc-400 flex-shrink-0">{fmt(p.views)}×</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <button
        onClick={() => fetchStats(token)}
        className="text-sm text-brand hover:underline"
      >
        Refresh
      </button>
    </div>
  );
}
