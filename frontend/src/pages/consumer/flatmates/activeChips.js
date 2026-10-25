import { budgetIsAny, isDateVal, BUDGET_MIN, BUDGET_MAX } from './helpers.js';
import { TAB_MOVE_IN, TAB_PEOPLE, TAB_TEAMS } from './model.js';
import { fmtDate } from './alertCriteria.js';

/** One removable chip per filter narrowing the board. Gated by tab exactly as `FilterControls` is,
 *  so a chip never names a filter whose control the tab hides. */
export default function flatmateActiveChips(filters, tab, t, budgetLbl, setF) {
  const place = tab === TAB_MOVE_IN;
  const genderText = filters.genderOnly && tab !== TAB_PEOPLE
    ? t(filters.gender === 'male' ? 'flatmates.menOnlyHomes' : 'flatmates.womenOnlyHomes')
    : t(filters.gender === 'male' ? 'flatmates.gMen' : 'flatmates.gWomen');
  const rows = [
    ['q', filters.q && `“${filters.q}”`, { q: '' }],
    ['budget', !budgetIsAny(filters.budget) && budgetLbl + t('flatmates.perMonth'), { budget: [BUDGET_MIN, BUDGET_MAX] }],
    ['locality', filters.locality, { locality: '' }],
    ['near', filters.near && t('flatmates.nearChip', {
      label: filters.nearLabel || t('flatmates.placeWord'),
      radius: filters.nearRadius,
      unit: t(filters.nearMode === 'min' ? 'flatmates.unitMin' : 'flatmates.unitKm'),
    }), { near: '', nearLabel: '', nearRadius: 5, nearMode: 'km' }],
    ['moveIn', filters.moveIn === 'now' ? t('flatmates.chipMoveInNow') : isDateVal(filters.moveIn) && t('flatmates.chipMoveInBy', { date: fmtDate(filters.moveIn) }), { moveIn: '' }],
    ['gender', filters.gender && genderText, { gender: '', genderOnly: false }],
    ['roomType', tab !== TAB_TEAMS && filters.roomType && t(filters.roomType === 'private' ? 'flatmates.optPrivateRoom' : 'flatmates.optSharedRoom'), { roomType: '' }],
    ['furnishing', place && filters.furnishing && t(filters.furnishing === 'semi' ? 'flatmates.furnSemi' : 'flatmates.furnFurnished'), { furnishing: '' }],
    ['sharing', tab === TAB_TEAMS && filters.sharing && t('flatmates.nSharing', { n: filters.sharing }), { sharing: '' }],
    ['verifiedOnly', filters.verifiedOnly && t('flatmates.verifiedOnly'), { verifiedOnly: false }],
    ['gated', place && filters.gated && t('flatmates.gatedSociety'), { gated: false }],
    ['attachedBath', place && filters.attachedBath && t('flatmates.attachedBath'), { attachedBath: false }],
    ...filters.vibe.map((token) => {
      const [key, answer] = token.split(':');
      return ['vibe:' + token, t(`flatmates.ls.a_${key}_${answer}`), { vibe: filters.vibe.filter((x) => x !== token) }];
    }),
  ];
  return rows.filter(([, label]) => label).map(([id, label, patch]) => ({ id, label, remove: () => setF(patch) }));
}
