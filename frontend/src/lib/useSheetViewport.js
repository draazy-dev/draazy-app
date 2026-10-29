import { useEffect, useState } from 'react';

const SHEET = '(max-width: 639.98px)';

export default function useSheetViewport() {
  const [sheet, setSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SHEET).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(SHEET);
    const onChange = (e) => setSheet(e.matches);
    mq.addEventListener('change', onChange);
    setSheet(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return sheet;
}
