const MON_ABBR = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');

// Local "today" as yyyy-mm-dd — the min bound for forward-only visit dates.
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Reads both `when` shapes: seed ISO dates (yyyy-mm-dd) and booked strings ("19 Jul 2026, 10:30 AM (in-person)").
export function parseWhen(when) {
  if (!when) return { date: null, timeLabel: '', mode: '' };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when);
  if (iso) return { date: new Date(+iso[1], +iso[2] - 1, +iso[3]), timeLabel: '', mode: '' };
  const timeM = /(\d{1,2}:\d{2})\s*([AP]M)/i.exec(when);
  const modeM = /\(([^)]+)\)/.exec(when);
  // The optional `\d{4}` year cannot collide with the time: `10:30` has a colon.
  const dm = /(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{4}))?/.exec(when);
  let date = null;
  if (dm) {
    const mon = MON_ABBR[dm[2].slice(0, 3).toLowerCase()];
    if (mon != null) {
      if (dm[3]) {
        // Trust a stated year; guessing it from "now" misdates visits in other years. Yearless seed strings guess.
        date = new Date(+dm[3], mon, +dm[1]);
      } else {
        const now = new Date();
        let d = new Date(now.getFullYear(), mon, +dm[1]);
        const floor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (d < floor) d = new Date(now.getFullYear() + 1, mon, +dm[1]);
        date = d;
      }
    }
  }
  return { date, timeLabel: timeM ? `${timeM[1]} ${timeM[2].toUpperCase()}` : '', mode: modeM ? modeM[1] : '' };
}

// Human, locale-stable date part ("19 Jul 2026") for an ISO date, or '' if blank.
export function displayDate(dateIso) {
  return dateIso ? new Date(`${dateIso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// "19 Jul 2026, 10:30 AM (in-person)"; mode is optional.
export function formatWhen(dateIso, time, mode) {
  return `${displayDate(dateIso)}, ${time}${mode ? ` (${mode})` : ''}`;
}

// yyyy-mm-dd for a `when` string, for seeding the calendar when rescheduling.
export function isoFromWhen(when) {
  const { date } = parseWhen(when);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

// The server's slot is an ISO instant; the UI's is a `when` string.
// Any drift from parseWhen yields an unreschedulable visit.

// "10:30 AM" → { h, m } in 24-hour terms. Returns null for anything unparseable.
function parseSlotTime(timeLabel) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(timeLabel || '').trim());
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return { h, m: +m[2] };
}

// Built from local parts: `new Date("19 Jul 2026, 10:30 AM")` parses as UTC in some engines.
// Missing time falls back to midday so timezones west of IST don't land on the previous day.
export function slotFromWhen(when) {
  const { date, timeLabel } = parseWhen(when);
  if (!date) return null;
  const t = parseSlotTime(timeLabel) || { h: 12, m: 0 };
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.h, t.m, 0, 0).toISOString();
}

export function slotFromParts(dateIso, timeLabel) {
  if (!dateIso) return null;
  const [y, mo, d] = dateIso.split('-').map(Number);
  const t = parseSlotTime(timeLabel) || { h: 12, m: 0 };
  return new Date(y, (mo || 1) - 1, d || 1, t.h, t.m, 0, 0).toISOString();
}

// Rendered from local parts so a 10:30 AM IST booking reads back as 10:30 AM, not its UTC hour.
export function whenFromSlot(slot, mode) {
  if (!slot) return '';
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return '';
  const dateIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h24 = d.getHours();
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return formatWhen(dateIso, `${h12}:${pad(d.getMinutes())} ${suffix}`, mode);
}
