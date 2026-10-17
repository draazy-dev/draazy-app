import { useEffect, useRef } from 'react';

// Phones draw overlay scrollbars that vanish at rest and iOS ignores scrollbar styling, so the rail is drawn.
export default function ScrollRail({ className, children }) {
  const scrollRef = useRef(null);
  const thumbRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      thumb.parentElement.hidden = scrollHeight <= clientHeight + 1;
      const h = Math.max(32, (clientHeight * clientHeight) / scrollHeight);
      const y = ((clientHeight - h) * scrollTop) / Math.max(1, scrollHeight - clientHeight);
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${y}px)`;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    [...el.children].forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className={`scroll-rail-body ${className}`}>{children}</div>
      <div className="scroll-rail" aria-hidden="true"><span ref={thumbRef} /></div>
    </div>
  );
}
