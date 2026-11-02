import { CONSENT_CHANGE, hasAnalyticsConsent } from '../components/CookieConsent.jsx';

const DEPLOYED = import.meta.env.PROD
  ? import.meta.env.VITE_DEPLOY_ENV !== 'local'
  : import.meta.env.VITE_POSTHOG_IN_DEV === 'on';
const KEY = (DEPLOYED && import.meta.env.VITE_POSTHOG_KEY) || '';
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let client = null;
let replayPaused = false;

const backOffice = (pathname) => /^\/(admin|ops|staff)\b/.test(pathname || '');

const keepOutOfBackOffice = (posthog) => (event) => {
  const inBackOffice = backOffice(window.location.pathname);
  if (inBackOffice !== replayPaused) {
    replayPaused = inBackOffice;
    if (inBackOffice) posthog.stopSessionRecording();
    else posthog.startSessionRecording();
  }
  return event && (inBackOffice || backOffice(event.properties?.$pathname)) ? null : event;
};

function load() {
  if (!client) {
    client = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(KEY, {
          api_host: HOST,
          persistence: 'localStorage',
          person_profiles: 'identified_only',
          capture_pageview: 'history_change',
          capture_pageleave: true,
          capture_performance: { web_vitals: true },
          mask_all_text: true,
          mask_all_element_attributes: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '*',
            maskAllElementAttributes: true,
            blockSelector: 'img, video, canvas, picture, input[type="file"]',
          },
          disable_surveys: true,
          disable_capture_url_hashes: true,
          before_send: keepOutOfBackOffice(posthog),
        });
        if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
        return posthog;
      })
      .catch(() => { client = null; return null; });
  }
  return client;
}

function sync() {
  if (hasAnalyticsConsent()) {
    if (client) client.then((ph) => ph?.has_opted_out_capturing() && ph.opt_in_capturing());
    else if (!backOffice(window.location.pathname)) load();
  } else {
    client?.then((ph) => ph?.opt_out_capturing());
  }
}

export function initProductAnalytics() {
  if (!KEY || typeof window === 'undefined') return;
  sync();
  window.addEventListener(CONSENT_CHANGE, sync);
}

export function capture(event, props) {
  client?.then((ph) => ph?.capture(event, props)).catch(() => {});
}
