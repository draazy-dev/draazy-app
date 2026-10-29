import { useSyncExternalStore } from 'react';
import ErrorBoundary from '../ErrorBoundary.jsx';
import { subscribeMapsRefusal, isMapsRefused } from '../../lib/mapsConfig.js';

// After a Maps auth refusal, unmounting a marker throws inside Google's code. The map must be
// dropped while this boundary stays mounted, or the throw escapes to the route boundary.
export default function MapBoundary({ scope, fallback, refusedFallback = fallback, children }) {
  const refused = useSyncExternalStore(subscribeMapsRefusal, isMapsRefused);
  return (
    <ErrorBoundary scope={scope} fallback={fallback}>
      {refused ? refusedFallback : children}
    </ErrorBoundary>
  );
}
