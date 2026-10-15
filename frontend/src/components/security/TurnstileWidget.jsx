import { useEffect, useId, useRef, useState } from 'react';

// Hidden unless Cloudflare needs a click; the token goes up via onToken(null when absent) for the
// CF-Turnstile-Response header. No site key → renders nothing, matching a backend with Turnstile off.
export default function TurnstileWidget({
  siteKey = import.meta.env?.VITE_TURNSTILE_SITE_KEY,
  onToken,
  className = '',
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const instanceId = useId();

  // A ref, so an inline onToken doesn't re-render the widget and discard a solved single-use challenge.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current?.(null);
      return undefined;
    }

    // Re-armed per effect run: StrictMode's mount → cleanup → re-mount would otherwise leave it false.
    let active = true;

    const render = () => {
      if (!active || !containerRef.current || !window.turnstile) return;
      // Clear first: StrictMode's double-effect would otherwise stack two widgets in one container.
      containerRef.current.innerHTML = '';
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'flexible',
          appearance: 'interaction-only',
          callback: (token) => active && onTokenRef.current?.(token),
          // Clearing an expired token stops a form submitting one the server will reject.
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

    if (window.turnstile) {
      render();
    } else {
      // One script tag app-wide: two copies fight over window.turnstile and the second render does nothing.
      const SCRIPT_ID = 'cf-turnstile-script';
      let script = document.getElementById(SCRIPT_ID);
      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      // Also attached when the tag exists but is still loading, or a second widget would never render.
      script.addEventListener('load', render);
      script.addEventListener('error', () => {
        if (!active) return;
        setFailed(true);
        onTokenRef.current?.(null);
      });
    }

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Already gone — the container was unmounted before Turnstile finished cleaning up.
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
