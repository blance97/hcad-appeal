import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const DEFAULTS = {
  countyId: null,
  county_name: 'Texas',
  cad_name: 'CAD',
  cad_full_name: 'Central Appraisal District',
  filing_url: '',
  tax_rate: 0.02,
  state: 'Texas',
  tax_year: null,
  property_count: null,
};

const CountyContext = createContext(DEFAULTS);

export function CountyProvider({ children }) {
  const { county } = useParams();
  const [config, setConfig] = useState({ ...DEFAULTS, countyId: county });

  useEffect(() => {
    if (!county) return;
    fetch(`/api/${county}/health`)
      .then(r => r.json())
      .then(d => setConfig({ ...d, countyId: county }))
      .catch(() => {});
  }, [county]);

  return <CountyContext.Provider value={config}>{children}</CountyContext.Provider>;
}

export function useCounty() { return useContext(CountyContext); }
