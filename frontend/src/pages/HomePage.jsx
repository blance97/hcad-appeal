import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCounty } from '../CountyContext.jsx';
import { useApi } from '../api.js';

function makeFaqs(cadName, countyName, filingUrl) {
  return [
    {
      q: 'What is a property tax appeal?',
      a: `A property tax appeal (called a "protest" in Texas) is your right to challenge the value ${cadName} places on your home. If your assessed value is higher than what comparable homes are assessed at, you can formally request a reduction. ${cadName} must consider your evidence.`,
    },
    {
      q: "How do I know if I'm overassessed?",
      a: `Search your address above. We compare your assessed value per square foot to similar homes in your ${cadName} neighborhood. If yours is significantly higher than the median, you're likely overassessed and have a strong case.`,
    },
    {
      q: "What's the deadline to file?",
      a: 'In Texas, the deadline to protest is May 15 (or 30 days after your appraisal notice is mailed, whichever is later). There are no extensions. Miss it and you wait until next year.',
    },
    {
      q: "What's in the appeal packet?",
      a: `Your packet includes a formal protest letter citing Texas Property Tax Code §41.41, a comparable properties evidence table pulled from ${cadName}'s own data, filing instructions, a deadline checklist, and a legal disclaimer. It's ready to upload at ${filingUrl}.`,
    },
    {
      q: 'Do I need to go to a hearing?',
      a: `Not always. Most reductions happen at the informal hearing, a short meeting with a ${cadName} appraiser where you present your comps. If you're unsatisfied, you can escalate to a formal ARB (Appraisal Review Board) hearing. Filing online at ${filingUrl} schedules this automatically.`,
    },
    {
      q: "What if my appeal doesn't succeed?",
      a: `There's no downside to filing. ${cadName} cannot raise your value as a result of a protest. Worst case, your value stays the same. You can always try again next year when new assessment notices come out.`,
    },
    {
      q: 'Why is this free?',
      a: `This tool was built by a local homeowner who went through the appeal process and thought it should be easier. The data is already public. ${cadName} publishes it every year. No reason to charge for access to your own public records.`,
    },
  ];
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-zinc-800 text-sm">{q}</span>
        <svg className={`w-4 h-4 text-zinc-400 flex-shrink-0 ml-4 transition-transform ${open ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {open && <p className="px-5 pb-4 text-sm text-zinc-500 leading-relaxed">{a}</p>}
    </div>
  );
}

export default function HomePage() {
  const { county_name, cad_name, filing_url, state, tax_year: taxYear, property_count: propertyCount, countyId } = useCounty();
  const api = useApi();
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
      const data = await api.search(q);
      if (data.error) throw new Error(data.error);
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
          {county_name}, {state}{taxYear ? ` · ${taxYear} Tax Year` : ''}
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 mb-4 leading-tight tracking-tight">
          Are You Overpaying<br />
          <span className="text-brand">Property Taxes?</span>
        </h1>
        <p className="text-zinc-500 text-lg leading-relaxed max-w-lg mx-auto">
          Search your address. We'll compare your assessment to similar homes in your neighborhood using {cad_name}'s own data.
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-card p-6 relative">
        <label className="block text-sm font-semibold text-zinc-700 mb-3">
          Your {county_name} address
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
                  onClick={() => navigate(`/${countyId}/results/${p.account_number}`)}
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
          { n: propertyCount ? `${(propertyCount / 1_000_000).toFixed(1)}M` : '—', label: `${cad_name} records` },
          { n: 'May 15', label: `${taxYear || '—'} protest deadline` },
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
          { step: '1', title: 'Search your address', desc: `We pull your live ${cad_name} assessment and property details.` },
          { step: '2', title: 'See comparable homes', desc: `We find similar properties in your ${cad_name} neighborhood and compare assessed values.` },
          { step: '3', title: 'Get your appeal packet', desc: `Download a pre-filled packet ready to file with ${county_name} ARB.` },
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

      {/* Cost comparison */}
      <div className="mt-14">
        <h2 className="text-2xl font-extrabold text-zinc-900 text-center mb-2">You keep 100% of your savings.</h2>
        <p className="text-zinc-500 text-sm text-center mb-6">If you save $1,000 on your taxes, here's what you actually pocket:</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: 'Ownwell', keep: '$650–$750', cut: '25–35% of savings', muted: true },
            { name: 'Tax Consultant', keep: '$600–$700', cut: '30–40% of savings', muted: true },
            { name: 'This tool', keep: '$1,000', cut: '$0. Completely free.', highlight: true },
          ].map(({ name, keep, cut, highlight, muted }) => (
            <div key={name} className={`rounded-xl border p-4 text-center ${highlight ? 'border-brand bg-brand-light' : 'border-zinc-200 bg-white'}`}>
              <div className={`text-xs font-semibold mb-2 ${highlight ? 'text-brand' : 'text-zinc-400'}`}>{name}</div>
              <div className={`text-xl font-extrabold ${highlight ? 'text-brand' : 'text-zinc-400'}`}>{keep}</div>
              <div className={`text-xs mt-1 ${highlight ? 'text-brand/70' : 'text-zinc-400'}`}>{cut}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-14">
        <h2 className="text-2xl font-extrabold text-zinc-900 text-center mb-6">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {makeFaqs(cad_name, county_name, filing_url).map(f => <FaqItem key={f.q} {...f} />)}
        </div>
      </div>

      <div className="h-12" />
    </div>
  );
}
