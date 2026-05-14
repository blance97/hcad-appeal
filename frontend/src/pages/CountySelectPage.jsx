import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const COUNTY_META = {
  hcad: { description: 'Houston & surrounding areas' },
  fbcad: { description: 'Sugar Land, Katy & Missouri City' },
  tcad: { description: 'Austin & surrounding areas' },
};

function HouseIcon() {
  return (
    <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

export default function CountySelectPage() {
  const [counties, setCounties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setCounties(d.counties || []))
      .catch(() => setCounties([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <span className="font-bold text-zinc-900 tracking-tight">TX Appeal</span>
        </div>
        <Link to="/stats" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">Stats</Link>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-brand-light text-brand text-xs font-semibold px-3 py-1.5 rounded-full mb-5 uppercase tracking-wide">
            Texas · Free Property Tax Appeals
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 mb-4 leading-tight tracking-tight">
            Select Your County
          </h1>
          <p className="text-zinc-500 text-lg max-w-lg mx-auto leading-relaxed">
            Free property tax appeal tool for Texas homeowners. Pick your county to see if you're overassessed.
          </p>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-zinc-200 h-48" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {counties.map(c => {
              const meta = COUNTY_META[c.id] || {};
              return (
                <Link
                  key={c.id}
                  to={`/${c.id}`}
                  className="group bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-brand/40 transition-all p-6 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center">
                      <HouseIcon />
                    </div>
                    {c.status === 'ok' && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        Live
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="font-bold text-zinc-900 text-lg leading-tight">{c.county_name}</div>
                    <div className="text-xs font-semibold text-brand mt-0.5">{c.cad_name}</div>
                    <div className="text-sm text-zinc-500 mt-1.5">{meta.description || ''}</div>
                  </div>

                  <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      {c.property_count
                        ? `${(c.property_count / 1_000_000).toFixed(1)}M properties`
                        : 'Properties'}
                      {c.tax_year ? ` · ${c.tax_year}` : ''}
                    </span>
                    <svg className="w-4 h-4 text-zinc-300 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-400">
        Data sourced from public appraisal district records · Not legal or tax advice · Free, no account required
      </footer>
    </div>
  );
}
