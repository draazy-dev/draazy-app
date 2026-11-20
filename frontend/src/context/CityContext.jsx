import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CITY, getCities, getCityLive, onGeoChange } from '../lib/geoConfig.js';
import { joinCityWaitlist } from '../services/cityService.js';

const CityContext = createContext(null);
const CKEY = 'draazyCity';

export function CityProvider({ children }) {
  const [city, setCityState] = useState(() => {
    try {
      return localStorage.getItem(CKEY) || 'Pune';
    } catch {
      return 'Pune';
    }
  });
  const [modal, setModal] = useState(null);
  const [cities, setCities] = useState(getCities);

  useEffect(() => {
    const sync = () => setCities(getCities());
    const unsubscribe = onGeoChange(sync);
    window.addEventListener('draazy-settings-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('draazy-settings-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isLive = useCallback(
    (name) => cities.find((c) => c.name.toLowerCase() === (name || '').toString().toLowerCase())?.live ?? false,
    [cities],
  );

  const setCity = useCallback((next) => {
    const name = String(next || '').trim();
    if (!name) return;
    if (!getCityLive(name)) {
      setModal({ type: 'waitlist', city: name });
      return;
    }
    try {
      localStorage.setItem(CKEY, name);
    } catch {
    }
    setCityState(name);
  }, []);

  const prevRef = useRef({ name: city, live: isLive(city) });
  useEffect(() => {
    const nowLive = isLive(city);
    const prev = prevRef.current;
    prevRef.current = { name: city, live: nowLive };
    if (prev.name === city && prev.live && !nowLive && city !== DEFAULT_CITY) {
      setCity(DEFAULT_CITY);
    }
  }, [cities, city, isLive, setCity]);

  const openWaitlist = useCallback((c) => setModal({ type: 'waitlist', city: c || city }), [city]);
  const openRequest = useCallback(() => setModal({ type: 'request', city: '' }), []);
  const closeModal = useCallback(() => setModal(null), []);

  const requestCity = useCallback(async (o) => {
    const cityName = String(o?.city || '').trim();
    if (!cityName) throw new Error('requestCity: a city is required');
    await joinCityWaitlist({
      city: cityName,
      mobile: String(o.mobile || '').trim(),
      email: String(o.email || '').trim(),
      turnstileToken: o.turnstileToken,
    });
  }, []);

  const value = useMemo(
    () => ({ city, setCity, isLive, cities, modal, openWaitlist, openRequest, closeModal, requestCity }),
    [city, setCity, isLive, cities, modal, openWaitlist, openRequest, closeModal, requestCity],
  );

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export function useCity() {
  return useContext(CityContext);
}
