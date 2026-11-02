const MON_ABBR = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function parseWhen(when) {
  if (!when) return { date: null, timeLabel: '', mode: '' };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when);
  if (iso) return { date: new Date(+iso[1], +iso[2] - 1, +iso[3]), timeLabel: '', mode: '' };
  const timeM = /(\d{1,2}:\d{2})\s*([AP]M)/i.exec(when);
  const modeM = /\(([^)]+)\)/.exec(when);
  const dm = /(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{4}))?/.exec(when);
  let date = null;
  if (dm) {
    const mon = MON_ABBR[dm[2].slice(0, 3).toLowerCase()];
    if (mon != null) {
      if (dm[3]) {
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

export function displayDate(dateIso) {
  return dateIso ? new Date(`${dateIso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function formatWhen(dateIso, time, mode) {
  return `${displayDate(dateIso)}, ${time}${mode ? ` (${mode})` : ''}`;
}

function parseSlotTime(timeLabel) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(timeLabel || '').trim());
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return { h, m: +m[2] };
}

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
