import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import PacketPage from './pages/PacketPage.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-zinc-200 px-4 py-3.5 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="font-bold text-zinc-900 tracking-tight">HCAD Appeal</span>
          </Link>
          <span className="text-xs font-medium text-zinc-400 hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
            Harris County · Free
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/results/:accountNumber" element={<ResultsPage />} />
          <Route path="/packet/:packetId" element={<PacketPage />} />
        </Routes>
      </main>

      <footer className="border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-400">
        Data sourced from HCAD public records · Not legal or tax advice · Free, no account required
      </footer>
    </div>
  );
}
