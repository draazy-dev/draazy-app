export const DRAFT_OWNER_KEY = '__owner';
const SHARED_KEY = 'dzDraft:list-property:v3';

export const draftKeyFor = (owner) => (owner ? `${SHARED_KEY}:${owner}` : SHARED_KEY);

export function adoptSharedDraft(owner, { guestWork = false } = {}) {
  try {
    const draft = JSON.parse(localStorage.getItem(SHARED_KEY));
    if (!owner || !draft || typeof draft !== 'object') return;
    const stamp = draft[DRAFT_OWNER_KEY];
    if (stamp ? stamp !== owner : !guestWork) return;
    localStorage.setItem(draftKeyFor(owner), JSON.stringify({ ...draft, [DRAFT_OWNER_KEY]: owner }));
    localStorage.removeItem(SHARED_KEY);
  } catch { }
}
