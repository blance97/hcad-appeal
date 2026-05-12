import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taxYear, setTaxYear] = useState(null);
  const navigate = useNavigate();
  const debounce = useRef(null);

  React.useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d.tax_year) setTaxYear(d.tax_year); })
      .catch(() => {});
  }, []);

  async function search(q) {
    if (q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/property/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
    } catch (e) {
      setError(e.message || 'Search failed');
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
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-8 pt-8">
        <div className="inline-flex items-center gap-2 bg-brand-light text-brand text-xs font-semibold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wide">
          Harris County, Texas{taxYear ? ` · ${taxYear} Tax Year` : ''}
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 mb-4 leading-tight tracking-tight">
          Are You Overpaying<br />
          <span className="text-brand">Property Taxes?</span>
        </h1>
        <p className="text-zinc-500 text-lg leading-relaxed max-w-lg mx-auto">
          Search your address. We'll compare your assessment to similar homes in your neighborhood using HCAD's own data.
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-6 relative">
        <label className="block text-sm font-semibold text-zinc-700 mb-3">
          Your Harris County address
        </label>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="e.g. 123 Main St or account number"
            className="w-full border border-zinc-300 rounded-xl pl-10 pr-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder-zinc-400 transition"
            autoFocus
          />
          {loading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zinc-300 border-t-brand rounded-full animate-spin" />
          )}
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        {results.length > 0 && (
          <ul className="absolute left-6 right-6 top-full mt-1 divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-card-hover z-10">
            {results.map(p => (
              <li key={p.account_number}>
                <button
                  onClick={() => navigate(`/results/${p.account_number}`)}
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

      {/* Stats */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { n: '1.2M+', label: 'HCAD records' },
          { n: '85%+', label: 'protest success rate' },
          { n: 'Free', label: 'no signup required' },
        ].map(({ n, label }) => (
          <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-card text-center">
            <div className="text-xl font-bold text-zinc-900">{n}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="mt-10 space-y-3">
        {[
          { step: '1', title: 'Search your address', desc: 'We pull your live HCAD assessment and property details.' },
          { step: '2', title: 'See comparable homes', desc: 'We find similar properties in your HCAD neighborhood and compare assessed values.' },
          { step: '3', title: 'Get your appeal packet', desc: 'Download a pre-filled packet ready to file with Harris County ARB.' },
        ].map(({ step, title, desc }) => (
          <div key={step} className="flex gap-4 bg-white rounded-xl border border-zinc-200 shadow-card p-4">
            <div className="w-8 h-8 rounded-lg bg-brand-light text-brand font-bold text-sm flex items-center justify-center flex-shrink-0">
              {step}
            </div>
            <div>
              <div className="font-semibold text-zinc-900 text-sm">{title}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
