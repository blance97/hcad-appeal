import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function PacketPage() {
  const { packetId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-brand mb-6 inline-block">
        ← Back to results
      </button>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Appeal Packet is Ready</h2>
        <p className="text-gray-600 mb-6">
          Download your complete, ready-to-file appeal packet. File at{' '}
          <strong>iFile.hcad.org</strong> before the May 15 deadline.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <a
            href={`/api/appeal/${packetId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 rounded-lg hover:bg-brand-dark transition-colors text-center"
          >
            Download PDF
          </a>
          <a
            href={`/api/appeal/${packetId}/html`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 border-2 border-brand text-brand font-bold py-3 rounded-lg hover:bg-brand-light transition-colors text-center"
          >
            View / Print HTML
          </a>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-bold mb-4">What's in your packet</h3>
        <ol className="space-y-3">
          {[
            ['Cover Page', 'Your property details and potential savings at a glance'],
            ['Appeal Letter', 'Formal protest letter citing Texas Property Tax Code §41.41'],
            ['Comparable Properties', 'Evidence table with similar homes and their assessments'],
            ['Filing Instructions', 'Step-by-step Harris County ARB process'],
            ['Deadline Checklist', 'Everything you need before May 15'],
            ['Legal Disclaimer', 'Important notices and terms of use'],
          ].map(([title, desc], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <div>
                <span className="font-medium">{title}</span>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        Data from HCAD public records. Not legal or tax advice. Results are estimates only.
      </p>
    </div>
  );
}
