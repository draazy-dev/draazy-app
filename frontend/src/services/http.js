import { API_BASE } from './config.js';
import {
  isInternal, localStorageWritable, logoutUser, readAccessToken, readUser, sessionHinted, sessionRemembered, writeTokens,
} from '../lib/auth.js';
import { deviceId } from '../lib/deviceId.js';

const TRACE_HEADER = 'X-Trace-Id';
const BUILD_HEADER = 'X-Draazy-Build';
const REFRESH_PATH = '/auth/refresh';
const LOGOUT_PATH = '/auth/logout';
const DEVICE_ID_PATH = /^\/(auth\/|referrals\/|me\/referrals|me\/payments)/;
const REFRESH_LOCK = 'draazy:auth-refresh';

export class ApiError extends Error {
  constructor({ code, message, status, traceId, fields, attemptsRemaining,   retryAfterSeconds, reason, existingId, nextReminderAt }) {
    super(message || code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.code = code || null;
    this.status = status;
    this.traceId = traceId || null;
    this.fields = fields || [];
    this.attemptsRemaining =
      typeof attemptsRemaining === 'number' ? attemptsRemaining : null;
    this.retryAfterSeconds =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0 ? retryAfterSeconds : null;
    this.reason = typeof reason === 'string' ? reason : null;
    this.existingId = typeof existingId === 'string' ? existingId : null;
    this.nextReminderAt = typeof nextReminderAt === 'string' ? nextReminderAt : null;
  }

  get isValidation() {
    return this.status === 422;
  }
}

export class NetworkError extends Error {
  constructor(cause) {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export const isAbort = (err) => err?.name === 'AbortError';

let reachabilityObserver = null;

export function observeReachability(fn) {
  reachabilityObserver = fn;
}

let buildStampObserver = null;

export function observeBuildStamp(fn) {
  buildStampObserver = fn;
}

let lastBuild = null;
let failedTraceId = null;
export const lastBuildStamp = () => lastBuild;
export const lastFailedTraceId = () => failedTraceId;

export async function request(path, opts = {}) {
  try {
    return await exchange(path, opts);
  } finally {
    if ((opts.method ?? 'GET') !== 'GET' && !opts.keepReads) clearReads();
  }
}

async function exchange(path, opts) {
  const { auth = true, withStatus = false } = opts;
  const res = await send(path, opts, auth ? readAccessToken() : null);

  if (res.status === 401 && auth && path !== REFRESH_PATH && !(await isWrongCode(res))) {
    const signedIn = Boolean(readAccessToken());
    if (signedIn || readUser()) {
      const token = signedIn || sessionHinted() ? await refreshAccessToken() : null;
      if (token) return toResult(await send(path, opts, token), withStatus);
      endSession(path !== LOGOUT_PATH);
    }
  }

  return toResult(res, withStatus);
}

const reads = new Map();
let readGeneration = 0;
function clearReads() {
  reads.clear();
  readGeneration += 1;
}

export const SESSION_ENDED_EVENT = 'draazy-session-ended';

function endSession(announce = true) {
  clearReads();
  logoutUser();
  if (announce) globalThis.dispatchEvent?.(new Event(SESSION_ENDED_EVENT));
}

globalThis.addEventListener?.('draazy-settings-change', clearReads);

const readKey = (path, query, auth = true) =>
  `${auth ? readAccessToken() ?? '' : ''} ${path}${buildQuery(query)}`;

function forget(key, entry) {
  if (reads.get(key) === entry) reads.delete(key);
}

function track(key, promise, { ttl = 0, once = false } = {}) {
  const entry = { until: Infinity, once };
  const generation = readGeneration;
  entry.promise = promise.then(
    (data) => {
      entry.settled = true;
      if (ttl > 0 && !entry.taken && generation === readGeneration) entry.until = Date.now() + ttl;
      else forget(key, entry);
      return data;
    },
    (err) => { forget(key, entry); throw err; },
  );
  reads.set(key, entry);
  return entry;
}

function abortable(promise, signal) {
  if (!signal) return promise;
  const aborted = () => new DOMException('The operation was aborted.', 'AbortError');
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function get(path, query, opts = {}) {
  const { ttl, signal, ...rest } = opts;
  if (rest.withStatus || rest.headers) return request(path, { ...rest, method: 'GET', query, signal });
  const key = readKey(path, query, rest.auth);
  const hit = reads.get(key);
  if (!hit || hit.until <= Date.now()) {
    return abortable(track(key, request(path, { ...rest, method: 'GET', query }), { ttl }).promise, signal);
  }
  hit.read = true;
  if (hit.once) {
    hit.taken = true;
    if (hit.settled) forget(key, hit);
  }
  return abortable(hit.promise, signal);
}

export const PAGE_LOAD_TTL = 5_000;
export const PUBLIC_READ_TTL = 30_000;

export function prime(path, query, value, { ttl } = {}) {
  let entry;
  const fallback = () => (entry.read
    ? request(path, { method: 'GET', query })
    : Promise.reject(new Error('unread seed')));
  entry = track(readKey(path, query), value.then((data) => data ?? fallback(), fallback), ttl ? { ttl } : { ttl: 10_000, once: true });
  entry.promise.catch(() => {});
}
export const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
export const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body });
export const put = (path, body, opts) => request(path, { ...opts, method: 'PUT', body });
export const del = (path, opts) => request(path, { ...opts, method: 'DELETE' });

export const postMultipart = (path, form, opts) => request(path, { ...opts, method: 'POST', body: form });

export async function openEventStream(path, { onEvent, onOpen, signal } = {}) {
  let res = await stream(path, readAccessToken(), signal);
  if (res.status === 401 && readAccessToken()) {
    const token = await refreshAccessToken();
    if (token) res = await stream(path, token, signal);
    else endSession();
  }
  if (!res.ok) return toResult(res);
  onOpen?.();
  await readEventStream(res.body, onEvent);
  return null;
}

export function unwrapPage(res, requested = {}) {
  const items = Array.isArray(res) ? res : (res?.content ?? []);
  return {
    items,
    page: res?.page ?? res?.number ?? requested.page ?? 0,
    size: res?.size ?? requested.size ?? items.length,
    total: res?.totalElements ?? items.length,
    totalPages: res?.totalPages ?? 0,
  };
}

export { MAX_PAGE_SIZE } from './apiLimits.js';

export function unwrapFullPage(res, label) {
  if (Array.isArray(res)) return res;
  const rows = res?.content ?? [];
  const total = res?.totalElements ?? rows.length;
  if (total > rows.length) {
    console.warn(
      `[${label}] ${total} rows exist but only ${rows.length} were fetched. This list, and any ` +
        'count or filter computed from it, is now reading a partial result — the screen needs a pager.',
    );
  }
  return rows;
}

const isFormData = (body) => typeof FormData !== 'undefined' && body instanceof FormData;

const EARLY_READS = { '/bootstrap': '__dzBootstrap', '/me/bootstrap': '__dzMeBootstrap' };
function takeEarlyRead(url, token) {
  const name = EARLY_READS[url];
  const early = name && globalThis[name];
  if (!early) return null;
  globalThis[name] = undefined;
  return !isInternal(readUser()) && (early.token || null) === (token || null) ? early : null;
}

async function send(path, { method = 'GET', body, query, headers: extra, signal }, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !isFormData(body)) headers['Content-Type'] = 'application/json';
  if (extra) Object.assign(headers, extra);
  if (DEVICE_ID_PATH.test(path)) headers['X-Device-Id'] = deviceId();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const early = method === 'GET' ? takeEarlyRead(path + buildQuery(query), token) : null;
    const res = (early && await early) || await fetch(API_BASE + path + buildQuery(query), {
      method,
      headers,
      credentials: 'include',
      cache: isInternal(readUser()) ? 'no-cache' : 'default',
      body: body === undefined ? undefined : isFormData(body) ? body : JSON.stringify(body),
      signal,
    });
    reachabilityObserver?.(null);
    buildStampObserver?.(res.headers.get(BUILD_HEADER));
    lastBuild = res.headers.get(BUILD_HEADER) ?? lastBuild;
    return res;
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    const err = new NetworkError(cause);
    reachabilityObserver?.(err);
    throw err;
  }
}

async function stream(path, token, signal) {
    const headers = { Accept: 'text/event-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(API_BASE + path, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal,
      });
      reachabilityObserver?.(null);
      buildStampObserver?.(res.headers.get(BUILD_HEADER));
      return res;
    } catch (cause) {
      if (isAbort(cause)) throw cause;
      const err = new NetworkError(cause);
      reachabilityObserver?.(err);
      throw err;
    }
}

async function readEventStream(body, onEvent) {
    if (!body?.getReader) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event = 'message';
    let data = [];
    const dispatch = () => {
      if (data.length) {
        const text = data.join('\n');
        let payload = text;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
        onEvent?.({ type: event, data: payload });
      }
      event = 'message';
      data = [];
    };
    const line = (raw) => {
      const next = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (!next) { dispatch(); return; }
      if (next.startsWith(':')) return;
      const split = next.indexOf(':');
      const field = split === -1 ? next : next.slice(0, split);
      const value = split === -1 ? '' : next.slice(split + 1).replace(/^ /, '');
      if (field === 'event') event = value || 'message';
      else if (field === 'data') data.push(value);
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line);
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
    dispatch();
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function toResult(res, withStatus = false) {
  const payload = await parseBody(res);
  if (res.ok) return withStatus ? { data: payload, status: res.status, etag: res.headers.get('ETag') } : payload;
  const traceId = payload?.traceId || res.headers.get(TRACE_HEADER);
  if (res.status >= 500 && traceId) failedTraceId = traceId;
  throw new ApiError({
    code: payload?.error,
    message: payload?.message,
    status: res.status,
    traceId,
    fields: payload?.fields,
    attemptsRemaining: payload?.attemptsRemaining,
    retryAfterSeconds: payload?.retryAfterSeconds,
    reason: payload?.reason,
    existingId: payload?.existingId,
    nextReminderAt: payload?.nextReminderAt,
  });
}

async function isWrongCode(res) {
  return (await parseBody(res.clone()))?.attemptsRemaining != null;
}

async function parseBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

let refreshInFlight = null;

function refreshAccessToken() {
  if (!refreshInFlight) {
    const entryToken = readAccessToken();
    refreshInFlight = exclusively(() => doRefresh(entryToken))
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

function exclusively(fn) {
  if (!navigator.locks) {
    console.warn('[http] navigator.locks unavailable (non-secure context?) — refresh is not '
      + 'serialised across tabs; concurrent refreshes rely on the server grace window');
    return fn();
  }
  try {
    return navigator.locks.request(REFRESH_LOCK, fn);
  } catch (err) {
    console.warn('[http] Web Lock request refused — refreshing without cross-tab serialisation', err);
    return fn();
  }
}

async function doRefresh(entryToken) {
  const current = readAccessToken();
  if (entryToken && current !== entryToken) return current;
  const remember = sessionRemembered();
  try {
    const data = await request(REFRESH_PATH, {
      method: 'POST',
      body: { remember },
      auth: false,
      keepReads: true,
    });
    if (!data?.accessToken) return null;
    persistTokens(data, remember);
    return data.accessToken;
  } catch (err) {
    if (err instanceof NetworkError) throw fromRefresh(err);
    if (err instanceof ApiError && err.status !== 401) throw fromRefresh(err);
    return null;
  }
}

function fromRefresh(err) {
  err.duringRefresh = true;
  err.message = `Could not renew your session — ${err.message}`;
  return err;
}

export function restoreSession() {
  return refreshAccessToken();
}

export function persistTokens({ accessToken }, remember) {
  const choice = remember ?? sessionRemembered();
  writeTokens({ accessToken }, choice && localStorageWritable());
}
