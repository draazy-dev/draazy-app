import { useEffect, useId, useRef, useState } from 'react';

const SCRIPT_ID = 'cf-turnstile-script';

export default function TurnstileWidget({
  siteKey = import.meta.env?.VITE_TURNSTILE_SITE_KEY,
  onToken,
  className = '',
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const instanceId = useId();

  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current?.(null);
      return undefined;
    }

    let active = true;
    let script = null;

    const render = () => {
      if (!active || !containerRef.current || !window.turnstile) return;
      containerRef.current.innerHTML = '';
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'flexible',
          appearance: 'interaction-only',
          callback: (token) => {
            if (!active) return;
            setFailed(false);
            onTokenRef.current?.(token);
          },
          'expired-callback': () => active && onTokenRef.current?.(null),
          'timeout-callback': () => active && onTokenRef.current?.(null),
          'error-callback': () => {
            if (!active) return;
            setFailed(true);
            onTokenRef.current?.(null);
          },
        });
      } catch {
        setFailed(true);
        onTokenRef.current?.(null);
      }
    };

    const loadFailed = () => {
      if (!active) return;
      setFailed(true);
      onTokenRef.current?.(null);
    };

    if (window.turnstile) {
      render();
    } else {
      script = document.getElementById(SCRIPT_ID);
      if (!script) {
        const tag = document.createElement('script');
        tag.id = SCRIPT_ID;
        tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        tag.async = true;
        tag.defer = true;
        // A failed tag left in the head would make every later mount wait on a load that never comes.
        tag.addEventListener('error', () => tag.remove(), { once: true });
        document.head.appendChild(tag);
        script = tag;
      }
      script.addEventListener('load', render);
      script.addEventListener('error', loadFailed);
    }

    return () => {
      active = false;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', loadFailed);
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} data-testid="turnstile-widget" id={`turnstile-${instanceId}`} className="w-full" />
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          The verification check could not load. Please refresh the page and try again.
        </p>
      )}
    </div>
  );
}
