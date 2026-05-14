import { useCounty } from './CountyContext.jsx';

export function useApi() {
  const { countyId } = useCounty();
  const base = `/api/${countyId}`;
  return {
    search: q => fetch(`${base}/property/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
    property: id => fetch(`${base}/property/${id}`).then(r => r.json()),
    comps: id => fetch(`${base}/comps/${id}`).then(r => r.json()),
    generateAppeal: accountNumber => fetch(`${base}/appeal/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountNumber }),
    }).then(r => r.json()),
    appealHtmlUrl: id => `${base}/appeal/${id}/html`,
    appealPdfUrl: id => `${base}/appeal/${id}/pdf`,
    neighborhood: code => fetch(`${base}/neighborhood/${code}`).then(r => r.json()),
    logEvent: (event, value) => fetch(`${base}/property/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, value }),
    }).catch(() => {}),
  };
}
