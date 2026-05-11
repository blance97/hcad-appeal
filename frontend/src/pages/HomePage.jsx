import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const debounce = useRef(null);

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
      <div className="text-center mb-10 pt-6">
        <h1 className="text-4xl font-bold text-stone-900 mb-4 leading-tight">
          Are You Overpaying Property Taxes?
        </h1>
        <p className="text-stone-500 text-lg leading-relaxed">
          Search your address below. We'll pull your real HCAD data and compare it to
          similar homes in your neighborhood.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 shadow-sm p-6 relative">
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Enter your Harris County address
        </label>
        <p className="text-xs text-stone-400 mb-3">
          Harris County, Texas — powered by HCAD public records
        </p>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="e.g. 123 Main St or account number"
          className="w-full border border-stone-300 rounded-lg px-4 py-3 text-base bg-cream focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent placeholder-stone-400"
        />
        {error && <p className="text-brand text-sm mt-2">{error}</p>}
        {loading && <p className="text-stone-400 text-sm mt-3">Searching...</p>}

        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full mt-1 mx-6 divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden bg-white shadow-md z-10">
            {results.map(p => (
              <li key={p.account_number}>
                <button
                  onClick={() => navigate(`/results/${p.account_number}`)}
                  className="w-full text-left px-4 py-3 hover:bg-cream-dark transition-colors"
                >
                  <div className="font-medium text-stone-900">{p.address}, {p.city} {p.zip}</div>
                  <div className="text-sm text-stone-400 mt-0.5">
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

      <div className="mt-12 grid grid-cols-3 gap-4 text-center">
        {[
          { n: '1.2M+', label: 'HCAD records analyzed' },
          { n: '85%+', label: 'of protests with comps succeed' },
          { n: 'Free', label: 'No signup, no email gate' },
        ].map(({ n, label }) => (
          <div key={label} className="bg-white border border-stone-200 rounded-lg p-5 shadow-sm">
            <div className="text-2xl font-bold text-stone-900">{n}</div>
            <div className="text-xs text-stone-400 mt-1 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
