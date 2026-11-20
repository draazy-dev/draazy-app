// Playwright's `networkidle` never fires once a signed-in page opens `/api/messages/stream`,
// so this waits for the same 500 ms quiet window while ignoring event streams.
const QUIET_MS = 500;
const trackers = new WeakMap();

const isStream = (request) => (request.headers().accept || '').includes('text/event-stream');

const sameOrigin = (page, request) => {
  try {
    return new URL(request.url()).origin === new URL(page.url()).origin;
  } catch {
    return true;
  }
};

const isDocumentLoad = (page, request) => {
  try {
    return request.isNavigationRequest() && request.frame() === page.mainFrame();
  } catch {
    return false;
  }
};

// Third-party beacons (PostHog, Maps RPC) are not app readiness. A committed document cancels the old one's
// requests without always delivering their finish events, so they are dropped at the commit.
export function tracker(page) {
  let t = trackers.get(page);
  if (t) return t;
  t = { open: new Set(), last: Date.now(), nav: null };
  const done = (request) => {
    if (t.open.delete(request)) t.last = Date.now();
  };
  page.on('request', (request) => {
    if (isStream(request)) return;
    if (isDocumentLoad(page, request)) t.nav = request;
    else if (page.url() !== 'about:blank' && !sameOrigin(page, request)) return;
    t.open.add(request);
    t.last = Date.now();
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || !t.nav) return;
    for (const r of t.open) if (r !== t.nav) t.open.delete(r);
    t.nav = null;
    t.last = Date.now();
  });
  page.on('requestfinished', done);
  page.on('requestfailed', (request) => {
    if (request === t.nav) t.nav = null;
    done(request);
  });
  trackers.set(page, t);
  return t;
}

export async function settle(page, { timeout = 30_000 } = {}) {
  const t = tracker(page);
  await page.waitForLoadState('load');
  const deadline = Date.now() + timeout;
  while (t.open.size || Date.now() - t.last < QUIET_MS) {
    if (Date.now() > deadline) {
      const urls = [...t.open].slice(0, 3).map((r) => r.url()).join(', ');
      throw new Error(`settle: network still busy after ${timeout} ms (${t.open.size} open: ${urls})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function gotoSettled(page, url, options) {
  tracker(page);
  const response = await page.goto(url, options);
  await settle(page);
  return response;
}

export async function reloadSettled(page, options) {
  tracker(page);
  const response = await page.reload(options);
  await settle(page);
  return response;
}
