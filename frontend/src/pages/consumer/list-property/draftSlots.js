export const DRAFT_OWNER_KEY = '__owner';
const SHARED_KEY = 'dzDraft:list-property:v3';

/* Signed-out work lives in the device-wide slot; a signed-in owner gets a slot of their own, so the next
   account on a shared phone neither sees nor overwrites it. */
export const draftKeyFor = (owner) => (owner ? `${SHARED_KEY}:${owner}` : SHARED_KEY);

/* Moves the device-wide slot into `owner`'s when it is stamped with their id, or when it is unstamped guest work
   they typed in this tab before signing in (`guestWork`). Anyone else's guest draft stays out of their account. */
export function adoptSharedDraft(owner, { guestWork = false } = {}) {
  try {
    const draft = JSON.parse(localStorage.getItem(SHARED_KEY));
    if (!owner || !draft || typeof draft !== 'object') return;
    const stamp = draft[DRAFT_OWNER_KEY];
    if (stamp ? stamp !== owner : !guestWork) return;
    localStorage.setItem(draftKeyFor(owner), JSON.stringify({ ...draft, [DRAFT_OWNER_KEY]: owner }));
    localStorage.removeItem(SHARED_KEY);
  } catch { /* malformed or quota: the slot stays where it is */ }
}
