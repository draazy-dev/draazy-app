import { useEffect, useRef } from 'react';

export function useScrollReveal(deps = []) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current || document;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    const observe = (el) => {
      if (!el.classList.contains('visible')) io.observe(el);
    };
    const scan = (node) => {
      if (node.nodeType !== 1) return;
      if (node.matches('.reveal, .fade-up, .fade-in')) observe(node);
      node.querySelectorAll('.reveal, .fade-up, .fade-in').forEach(observe);
    };

    root.querySelectorAll('.reveal, .fade-up, .fade-in').forEach(observe);

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach(scan));
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rootRef;
}
