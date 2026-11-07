import { CHIP_TONE } from '../../../components/admin/WorkQueue.jsx';
import { fmtDateTime, fmtINR } from '../../../lib/format.js';
import { PROPERTY_TYPES } from '../../consumer/list-property/constants.js';
import { userMessage } from '../../../lib/userMessage.js';

export const STAGES = [
  { value: 'new', label: 'New', tone: CHIP_TONE.sky },
  { value: 'contacted', label: 'Contacted', tone: CHIP_TONE.teal },
  { value: 'interested', label: 'Interested', tone: CHIP_TONE.violet },
  { value: 'converted', label: 'Converted', tone: CHIP_TONE.green },
  { value: 'lost', label: 'Lost', tone: CHIP_TONE.neutral },
  { value: 'not-reachable', label: 'Not reachable', tone: CHIP_TONE.amber },
  { value: 'do-not-call', label: 'Do not call', tone: CHIP_TONE.red },
];
export const STAGE_BY_VALUE = Object.fromEntries(STAGES.map((s) => [s.value, s]));
export const STAGE_FILTERS = [{ value: '', label: 'All' }, ...STAGES.map(({ value, label }) => ({ value, label }))];
export const STAGE_CHANGES = STAGES.filter((s) => s.value !== 'new' && s.value !== 'converted');
export const NEEDS_FOLLOW_UP = ['contacted', 'interested'];
export const OPEN_STAGES = ['new', 'contacted', 'interested'];

export const SERVICES = [
  { value: 'rent-agreement', label: 'Rent agreement' },
  { value: 'legal', label: 'Legal' },
  { value: 'interior', label: 'Interior' },
  { value: 'packers', label: 'Packers' },
  { value: 'valuation', label: 'Valuation' },
  { value: 'loans', label: 'Home loans' },
  { value: 'listing', label: 'Listing' },
  { value: 'home-search', label: 'Home search' },
];
export const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

export const LEAD_TYPES = [
  { value: 'owner', label: 'Owner' },
  { value: 'seeker', label: 'Buyer / Tenant' },
  { value: 'flatmate', label: 'Flatmate' },
];
export const LEAD_TYPE_LABEL = Object.fromEntries(LEAD_TYPES.map((t) => [t.value, t.label]));
export const INTENTS = {
  owner: [{ value: 'sell', label: 'Sell' }, { value: 'rent-out', label: 'Rent out' }],
  seeker: [{ value: 'buy', label: 'Buy' }, { value: 'rent', label: 'Rent' }],
  flatmate: [{ value: 'has-room', label: 'Has a room' }, { value: 'needs-room', label: 'Needs a room' }],
};
export const INTENT_LABEL = Object.fromEntries(Object.values(INTENTS).flat().map((i) => [i.value, i.label]));
export { PROPERTY_TYPES };
export const PROPERTY_TYPE_LABEL = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.value, t.label]));
const HOMES = ['flat', 'independent', 'villa'];
export const BHK = [
  { value: '1rk', label: '1 RK' },
  ...['1', '2', '3', '4', '5+'].map((v) => ({ value: v, label: `${v} BHK` })),
];
export const BHK_LABEL = Object.fromEntries(BHK.map((b) => [b.value, b.label]));
export const LEAD_SOURCES = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'inbound-call', label: 'They called us' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Referral' },
  { value: 'flyer', label: 'Flyer / banner' },
  { value: 'draazy', label: 'Draazy site' },
  { value: 'portal', label: 'Other portal' },
  { value: 'other', label: 'Other' },
];
export const LEAD_SOURCE_LABEL = Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label]));
export const TYPE_FILTERS = [{ value: '', label: 'Everyone' }, ...LEAD_TYPES];

const MONTHLY = ['rent-out', 'rent', 'has-room', 'needs-room'];

export function budgetLabel(type, intent) {
  if (type === 'owner') return intent === 'rent-out' ? 'Expected rent / month' : 'Expected price';
  if (type === 'flatmate') return 'Rent / month';
  return intent === 'rent' ? 'Rent budget / month' : 'Budget';
}

export const fmtBudget = (n, intent) => (n ? `${fmtINR(n)}${MONTHLY.includes(intent) ? '/mo' : ''}` : '');

export function profileLine(profile) {
  const bhk = profile.bhk.map((b) => BHK_LABEL[b] || b).join(', ');
  const homes = profile.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t] || t).join(', ');
  return [bhk, homes, profile.localities, fmtBudget(profile.budget, profile.intent)].filter(Boolean).join(' · ');
}

export const showsBhk = (type, propertyTypes) => type === 'flatmate' || !propertyTypes.length || propertyTypes.some((t) => HOMES.includes(t));

export const emptyProfile = () => ({
  name: '', leadType: '', intent: '', propertyTypes: [], bhk: [], localities: '', budget: '', leadSource: '', sourceDetail: '',
});

export const profileForm = (lead) => {
  const p = lead.profile ?? {};
  return {
    name: lead.name ?? '',
    leadType: p.leadType ?? '',
    intent: p.intent ?? '',
    propertyTypes: p.propertyTypes ?? [],
    bhk: p.bhk ?? [],
    localities: p.localities ?? '',
    budget: p.budget ? String(p.budget) : '',
    leadSource: p.leadSource ?? '',
    sourceDetail: p.sourceDetail ?? '',
  };
};

export const profileReady = (form) => Boolean(form.leadType && form.leadSource);

export function toProfile(form) {
  const flatmate = form.leadType === 'flatmate';
  const bhk = showsBhk(form.leadType, form.propertyTypes) ? form.bhk : [];
  return {
    name: form.name.trim() || undefined,
    leadType: form.leadType,
    intent: form.intent || undefined,
    propertyTypes: flatmate ? [] : form.propertyTypes,
    bhk,
    localities: form.localities.trim() || undefined,
    budget: Number(form.budget) || undefined,
    leadSource: form.leadSource,
    sourceDetail: form.sourceDetail.trim() || undefined,
  };
}

export function withType(form, leadType) {
  const keepIntent = INTENTS[leadType]?.some((i) => i.value === form.intent);
  return {
    ...form,
    leadType,
    intent: keepIntent ? form.intent : '',
    propertyTypes: leadType === 'flatmate' ? [] : form.propertyTypes,
  };
}

export const SOURCE_LABEL = {
  'rent-agreement': 'Rent agreement',
  'unpaid-checkout': 'Unpaid checkout',
  'quote-request': 'Quote request',
  'lease-ending': 'Lease ending',
  flatmate: 'Flatmate post',
  manual: 'Added by staff',
};

export const CHANNELS = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
];
export const OUTCOMES = [
  { value: 'connected', label: 'Spoke to them' },
  { value: 'no-answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'switched-off', label: 'Switched off' },
  { value: 'wrong-number', label: 'Wrong number' },
  { value: 'message-sent', label: 'Message sent' },
];
export const OUTCOMES_BY_CHANNEL = {
  call: ['connected', 'no-answer', 'busy', 'switched-off', 'wrong-number'],
  whatsapp: ['message-sent', 'connected', 'wrong-number'],
  sms: ['message-sent', 'connected', 'wrong-number'],
};
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label]));

export const ACTIVITY_LABEL = {
  call: 'Call', whatsapp: 'WhatsApp', sms: 'SMS', note: 'Note', stage: 'Stage', assign: 'Assigned',
  claim: 'Claimed', release: 'Released', reveal: 'Number viewed', convert: 'Converted', profile: 'Profile',
};

export const CONSENT_LABEL = { 'opted-in': 'Opted in to calls', 'service-only': 'Service follow-up only' };

export const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

export const when = (iso) => fmtDateTime(iso) || '—';

const pad = (n) => String(n).padStart(2, '0');

export function inDays(days, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const toIso = (local) => (local ? new Date(local).toISOString() : null);

export function openLink(href, newTab) {
  const a = document.createElement('a');
  a.href = href;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const isFuture = (local) => Boolean(local) && new Date(local).getTime() > Date.now();

const FRIENDLY = {
  'lead-cap': 'You have 50 open leads — close some first.',
  'lead-cooldown': 'This lead was contacted in the last 24 hours. Try again after the wait.',
  'lead-closed': 'This lead is closed, so nothing more can be logged on it.',
  'lead-conversion-invalid': 'That payment cannot be credited to this lead.',
};

export function leadError(e) {
  if (e?.code === 'lead-owned') return userMessage(e, 'Another staff member owns this lead.');
  if (FRIENDLY[e?.code]) return FRIENDLY[e.code];
  if (e?.status === 403) return 'Only the lead’s owner can do that.';
  return userMessage(e, 'That did not go through. Try again.');
}
