import { preloadable } from '../lib/preloadable.js';
import { loadNamespaces } from './index.js';

export function lazyPage(loader, ...namespaces) {
  return preloadable(() => Promise.all([loader(), loadNamespaces(namespaces)]).then(([mod]) => mod));
}
