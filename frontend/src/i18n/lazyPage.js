import { lazy } from 'react';

import { loadNamespaces } from './index.js';

export function lazyPage(loader, ...namespaces) {
  return lazy(() => Promise.all([loader(), loadNamespaces(namespaces)]).then(([mod]) => mod));
}
