import { useSearchParams } from 'react-router';

export function useTabParam(validKeys, defaultKey) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab = validKeys.includes(raw) ? raw : (defaultKey ?? validKeys[0]);
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true });
  return [tab, setTab];
}
