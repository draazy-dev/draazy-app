const BASE = process.env.BASE_URL || '';
if (!BASE) throw new Error('Set BASE_URL, e.g. https://<sandbox-host>/api');
if (/draazy\.(com|in)\b/.test(BASE) && process.env.I_KNOW_THIS_IS_PROD !== 'yes') {
  throw new Error(`Refusing to load-test ${BASE}: point BASE_URL at the sandbox`);
}

const LOCALITIES = ['baner', 'wakad', 'hinjewadi', 'kharadi', 'viman-nagar', 'aundh', 'hadapsar', 'kothrud'];
const DEALS = ['rent', 'buy'];
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

function pickSearch(context, events, done) {
  context.vars.deal = pick(DEALS);
  context.vars.locality = pick(LOCALITIES);
  context.vars.propertyId = '';
  done();
}

function pickMobile(context, events, done) {
  context.vars.otpEnabled = process.env.OTP === '1';
  context.vars.mobile = `91234${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  context.vars.turnstileToken = process.env.TURNSTILE_TOKEN || 'XXXX.DUMMY.TOKEN.XXXX';
  done();
}

// Emitting 0 registers the counters, so the ensure expressions never divide an undefined metric.
function track(req, res, context, events, done) {
  events.emit('counter', 'draazy.bad_status', res.statusCode >= 400 ? 1 : 0);
  events.emit('counter', 'draazy.throttled', res.statusCode === 429 ? 1 : 0);
  done();
}

function pickProperty(req, res, context, events, done) {
  if (res.statusCode === 200) {
    try {
      const ids = (JSON.parse(res.body).content || []).map((p) => p.id).filter(Boolean);
      if (ids.length) context.vars.propertyId = encodeURIComponent(pick(ids));
    } catch {
      events.emit('counter', 'draazy.bad_search_body', 1);
    }
  }
  done();
}

module.exports = { pickSearch, pickMobile, track, pickProperty };
