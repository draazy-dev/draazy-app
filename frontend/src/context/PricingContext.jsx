import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PRICING_DEFAULTS, getPricing } from '../services/settingsService.js';

const PricingContext = createContext(null);

export function PricingProvider({ children }) {
  const [prices, setPrices] = useState(PRICING_DEFAULTS);
  const [active, setActive] = useState(false);

  const activate = useCallback(() => setActive(true), []);

  useEffect(() => {
    if (!active) return undefined;

    let generation = 0;

    const sync = async () => {
      const mine = ++generation;
      try {
        const next = await getPricing();
        if (mine === generation && next) setPrices(next);
      } catch {
      }
    };

    sync();
    window.addEventListener('draazy-settings-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      generation += 1;
      window.removeEventListener('draazy-settings-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, [active]);

  const fee = useCallback(
    (key) => '₹' + Number(prices[key] || 0).toLocaleString('en-IN'),
    [prices],
  );

  const loaded = prices !== PRICING_DEFAULTS;
  const value = useMemo(
    () => ({ fee, prices, referral: prices.referral, refunds: prices.refunds, loaded, activate }),
    [fee, prices, loaded, activate],
  );

  return (
    <PricingContext.Provider value={value}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  const ctx = useContext(PricingContext);
  const activate = ctx?.activate;
  useEffect(() => { activate?.(); }, [activate]);
  if (!ctx) throw new Error('usePricing must be used within PricingProvider');
  return ctx;
}
