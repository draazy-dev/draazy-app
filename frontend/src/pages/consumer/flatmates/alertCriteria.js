/* One place turns filter state (+ active tab) into a persistable record and its display chips, so
   the empty-state card, the toolbar "Save search" and the dashboard Alerts panel cannot diverge. */
import { inr, BUDGET_MIN, BUDGET_MAX } from './helpers.js';
import { TAB_MOVE_IN, TAB_TEAMS, TAB_TEAM_UP, TAB_PEOPLE, normalizeTab } from './model.js';

/* Budget persists as two scalars, both `undefined` when untouched: a stored 40000 would be
   indistinguishable from a real ₹40,000 ceiling. */
const budgetFields = (budget) => ({
  budget: budget[1] < BUDGET_MAX ? budget[1] : undefined,
  budgetMin: budget[0] > BUDGET_MIN ? budget[0] : undefined,
});

/* Human text for a record's budget, or null when it narrows nothing. Reads off the two persisted
   scalars, so a ceiling-only alert works unchanged. */
function budgetText(rec) {
  const lo = rec.budgetMin != null && rec.budgetMin > BUDGET_MIN ? rec.budgetMin : null;
  const hi = rec.budget != null && rec.budget < BUDGET_MAX ? rec.budget : null;
  if (lo && hi) return `${inr(lo)} – ${inr(hi)}`;
  if (hi) return `≤ ${inr(hi)}`;
  if (lo) return `≥ ${inr(lo)}`;
  return null;
}

const TAB_META = {
  [TAB_MOVE_IN]: { icon: 'door-open', word: 'Rooms' },
  [TAB_PEOPLE]: { icon: 'user-search', word: 'Flatmates' },
  [TAB_TEAMS]: { icon: 'users-round', word: 'Teams' },
};
const hasSharing = (tab) => tab === TAB_TEAMS || tab === TAB_TEAM_UP;

const GENDER_LBL = { female: 'Women', male: 'Men' };
const ONLY_LBL = { female: 'Women-only homes', male: 'Men-only homes' };
const ROOM_LBL = { private: 'Private room', shared: 'Shared room' };
const FURN_LBL = { furnished: 'Furnished', semi: 'Semi-furnished' };
const VIBE_LBL = {
  food: ['Veg only', 'Eggs ok', 'Non-veg ok'],
  smoking: ['Smoke-free', 'Smoking outside only', 'Smoking ok'],
  pets: ['No pets', 'Pet-friendly', 'Has a pet'],
  drinks: ['No drinks at home', 'Drinks now and then', 'Drinks ok'],
  visitors: ['No opposite-gender visitors', 'Daytime visitors only', 'Overnight visitors ok'],
  sleep: ['Sleeps by 11 pm', 'Sleeps around midnight', 'Night owl'],
};

/* One chip per question, its picked answers joined: "Veg only / Eggs ok". */
function vibeChipTexts(vibe) {
  const byKey = new Map();
  (vibe || []).forEach((token) => {
    const [key, answer] = String(token).split(':');
    const label = VIBE_LBL[key]?.[Number(answer)];
    if (label) byKey.set(key, [...(byKey.get(key) || []), label]);
  });
  return [...byKey.values()].map((labels) => labels.join(' / '));
}

const isDateVal = (v) => typeof v === 'string' && v.includes('-');
export const fmtDate = (iso) => {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  catch { return iso; }
};

export function tabMeta(tab) {
  // Alerts persist their tab, so resolve legacy values rather than mislabelling.
  return TAB_META[normalizeTab(tab)] || TAB_META[TAB_MOVE_IN];
}

/* Human move-in chip text, or null when the move-in filter is off. */
function moveInText(rec) {
  if (rec.moveIn === 'now') return 'Move-in: Immediate';
  if (isDateVal(rec.moveIn)) return `Move-in by ${fmtDate(rec.moveIn)}`;
  return null;
}

/* Short human summary of the whole search (used as the alert label). */
export function flatmateAlertLabel(rec) {
  const parts = [tabMeta(rec.tab).word];
  if (rec.locality) parts.push(rec.locality);
  const budget = budgetText(rec);
  if (budget) parts.push(budget);
  if (rec.gender) parts.push(rec.strictGender ? ONLY_LBL[rec.gender] : GENDER_LBL[rec.gender] || rec.gender);
  if (rec.roomType) parts.push(ROOM_LBL[rec.roomType]);
  if (rec.furnishing) parts.push(FURN_LBL[rec.furnishing]);
  if (hasSharing(rec.tab) && rec.sharing) parts.push(`${rec.sharing} sharing`);
  if (rec.attachedBath) parts.push('Attached bath');
  if (rec.gated) parts.push('Gated');
  if (rec.verifiedOnly) parts.push('Verified');
  return parts.join(' · ');
}

/* Records only filters the active tab honours, mirroring the tab-gated FilterBar so a stale value
   never rides along invisibly. */
export function buildFlatmateAlertRecord(filters, tab) {
  const rec = {
    kind: 'flatmates',
    tab,
    q: filters.q || '',
    locality: filters.locality || '',
    ...budgetFields(filters.budget),
    moveIn: filters.moveIn || '',
    gender: filters.gender || '',
    strictGender: !!filters.gender && !!filters.genderOnly && tab !== TAB_PEOPLE,
    roomType: tab === TAB_TEAMS ? '' : (filters.roomType || ''),
    furnishing: tab === TAB_MOVE_IN ? (filters.furnishing || '') : '',
    sharing: hasSharing(tab) ? (filters.sharing || '') : '',
    attachedBath: tab === TAB_MOVE_IN ? !!filters.attachedBath : false,
    gated: tab === TAB_MOVE_IN ? !!filters.gated : false,
    verifiedOnly: !!filters.verifiedOnly,
    vibe: [...(filters.vibe || [])],
  };
  rec.label = flatmateAlertLabel(rec);
  return rec;
}

/* Normalised list of display chips for a flatmates alert record. */
export function flatmateCriteriaChips(rec) {
  const meta = tabMeta(rec.tab);
  const chips = [{ icon: meta.icon, text: meta.word }];

  if (rec.locality) chips.push({ icon: 'map-pin', text: rec.locality });
  const budget = budgetText(rec);
  if (budget) chips.push({ icon: 'wallet', text: `${budget}/mo` });

  const move = moveInText(rec);
  if (move) chips.push({ icon: 'calendar', text: move });

  if (rec.gender) chips.push({ icon: rec.strictGender ? 'venus' : 'user', text: rec.strictGender ? ONLY_LBL[rec.gender] : GENDER_LBL[rec.gender] || rec.gender });
  if (rec.roomType) chips.push({ icon: 'door-open', text: ROOM_LBL[rec.roomType] });
  if (rec.furnishing) chips.push({ icon: 'sofa', text: FURN_LBL[rec.furnishing] });
  if (hasSharing(rec.tab) && rec.sharing) chips.push({ icon: 'users-round', text: `${rec.sharing} sharing` });
  if (rec.attachedBath) chips.push({ icon: 'bath', text: 'Attached bath' });
  if (rec.gated) chips.push({ icon: 'lock-keyhole', text: 'Gated society' });
  if (rec.verifiedOnly) chips.push({ icon: 'shield-check', text: 'Verified only' });
  vibeChipTexts(rec.vibe).forEach((text) => chips.push({ icon: 'sparkles', text }));

  return chips;
}
