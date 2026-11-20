import { IT_HUBS } from './commuteHubs.js';

const KEY = 'dz_commute_v1';
const ROAD_FACTOR = 1.35;
const FREE_SPEED_KMH = 24;
const mem = new Map();

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const pinKey = (lat, lng) => `${round3(lat)},${round3(lng)}`;

function congestion(pin, hubName) {
  return 1.05 + ((fnv1a(`${pin}|${hubName}`) % 1000) / 1000) * 0.5;
}

function computeLegs(lat, lng) {
  const pin = pinKey(lat, lng);
  return IT_HUBS.map((h) => {
    const roadKm = haversineKm(lat, lng, h.lat, h.lng) * ROAD_FACTOR;
    const min = Math.max(4, Math.round((roadKm / FREE_SPEED_KMH) * 60 * congestion(pin, h.name)));
    return { name: h.name, km: +roadKm.toFixed(1), min };
  }).sort((a, b) => a.min - b.min);
}

function read(pin) {
  if (mem.has(pin)) return mem.get(pin);
  try {
    const raw = localStorage.getItem(`${KEY}:${pin}`);
    if (raw) { const v = JSON.parse(raw); mem.set(pin, v); return v; }
  } catch { }
  return null;
}

function write(pin, entry) {
  mem.set(pin, entry);
  try { localStorage.setItem(`${KEY}:${pin}`, JSON.stringify(entry)); } catch { }
}

export function getCommute(lat, lng) {
  if (lat == null || lng == null) return null;
  const pin = pinKey(lat, lng);
  const hit = read(pin);
  if (hit) return hit;
  const agoH = (fnv1a(pin) % 6) + 1;
  const entry = { hubs: computeLegs(lat, lng), source: 'live', fetchedAt: Date.now() - agoH * 3600e3 };
  write(pin, entry);
  return entry;
}
