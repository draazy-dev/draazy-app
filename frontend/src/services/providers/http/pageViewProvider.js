import { post } from '../../http.js';

const trimmed = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
};

export async function recordPageViews(batch) {
  const events = (batch?.events || []).map((e) => ({
    path: String(e?.path || ''),
    referrerHost: trimmed(e?.referrerHost),
    device: String(e?.device || ''),
    agoMs: Math.max(0, Math.round(Number(e?.agoMs) || 0)),
  }));

  await post('/page-views', {
    sessionId: String(batch?.sessionId || ''),
    events,
    attributed: batch?.attributed === true,
  }, { keepReads: true });
  return true;
}
