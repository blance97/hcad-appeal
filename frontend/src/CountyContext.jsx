import React, { createContext, useContext, useState, useEffect } from 'react';

const DEFAULTS = {
  county_name:   'Harris County',
  cad_name:      'HCAD',
  cad_full_name: 'Harris County Appraisal District',
  filing_url:    'iFile.hcad.org',
  tax_rate:      0.021,
  state:         'Texas',
  tax_year:      null,
  property_count: null,
};

const CountyContext = createContext(DEFAULTS);

export function CountyProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setConfig(prev => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  return <CountyContext.Provider value={config}>{children}</CountyContext.Provider>;
}

export function useCounty() {
  return useContext(CountyContext);
}
