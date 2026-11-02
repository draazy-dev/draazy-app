import { createElement, lazy, useState } from 'react';

// React 19 holds a lazy's Suspense fallback for at least 300ms, so preloading alone keeps that delay;
// rendering the loaded module directly skips it.
export function preloadable(factory) {
  let mod = null;
  let pending = null;
  const load = () => {
    pending ??= factory().then(
      (m) => { mod = m; return m; },
      (e) => { pending = null; throw e; },
    );
    return pending;
  };
  const Lazy = lazy(load);
  function Preloadable(props) {
    // Pinned on mount: swapping Lazy for the loaded type later would remount the subtree.
    const [Component] = useState(() => (mod ? mod.default : Lazy));
    return createElement(Component, props);
  }
  Preloadable.preload = () => load().catch(() => {});
  return Preloadable;
}
