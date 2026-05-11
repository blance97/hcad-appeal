import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import PacketPage from './pages/PacketPage.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <header className="bg-cream border-b border-stone-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold text-stone-900 tracking-tight">HCAD Appeal</span>
          <span className="text-xs text-stone-400 hidden sm:block">Harris County · Free Property Tax Tool</span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/results/:accountNumber" element={<ResultsPage />} />
          <Route path="/packet/:packetId" element={<PacketPage />} />
        </Routes>
      </main>

      <footer className="border-t border-stone-200 bg-cream px-4 py-4 text-center text-xs text-stone-400">
        Data sourced from HCAD public records. Not legal or tax advice. Free, no account required.
      </footer>
    </div>
  );
}
