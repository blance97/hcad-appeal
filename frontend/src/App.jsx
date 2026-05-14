import React, { useEffect } from 'react';
import { Routes, Route, Link, useParams, Outlet } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import PacketPage from './pages/PacketPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import CountySelectPage from './pages/CountySelectPage.jsx';
import { CountyProvider, useCounty } from './CountyContext.jsx';

function CountyLayout() {
  return (
    <CountyProvider>
      <CountyShell />
    </CountyProvider>
  );
}

function CountyShell() {
  const { county } = useParams();
  const { cad_name, county_name } = useCounty();

  useEffect(() => {
    document.title = `${cad_name} Appeal — Free ${county_name} Property Tax Calculator`;
  }, [cad_name, county_name]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-zinc-200 px-4 py-3.5 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to={`/${county}`} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="font-bold text-zinc-900 tracking-tight">{cad_name} Appeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">All Counties</Link>
            <span className="text-xs font-medium text-zinc-400 hidden sm:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              {county_name} · Free
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-400">
        Data sourced from {cad_name} public records · Not legal or tax advice · Free, no account required
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CountySelectPage />} />
      <Route path="/:county" element={<CountyLayout />}>
        <Route index element={<HomePage />} />
        <Route path="results/:accountNumber" element={<ResultsPage />} />
        <Route path="packet/:packetId" element={<PacketPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>
    </Routes>
  );
}
