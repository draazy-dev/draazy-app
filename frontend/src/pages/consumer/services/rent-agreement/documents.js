import { OWNER_DOC_CATEGORY } from './constants.js';
import { coOwnerDocSlots, docReady, ownerDocSlots, TENANT_DOC_KEYS, tenantDocSlots } from './validation.js';

export function collectDocs({ mode, inviteRole, ownerMode, tenantMode, owner, coOwners = [], tenants = [], ownerDocs = {}, tenantDocs = {} }) {
  const out = [];
  const push = (key, category, doc) => {
    if (docReady(doc)) out.push({ key, category, file: { fileName: doc.fileName, dataUrl: doc.dataUrl, vaultDocId: doc.vaultDocId, filedOn: doc.filedOn, mime: doc.mime, category } });
  };
  if (mode === 'invite' ? inviteRole === 'owner' : ownerMode !== 'invite') {
    ownerDocSlots(owner).forEach((k) => push(k, OWNER_DOC_CATEGORY[k], ownerDocs[k]));
    coOwners.forEach((c, i) => coOwnerDocSlots(c, i).forEach((k) => push(k, `licensor-${i + 1}-${k.split('-')[1]}`, ownerDocs[k])));
  }
  if (mode === 'invite' ? inviteRole !== 'owner' : tenantMode !== 'invite') {
    tenants.forEach((tenant, i) => tenantDocSlots(tenant, i)
      .forEach(({ key, slug }) => push(key, `tenant-${i}-${slug}`, tenantDocs[key])));
  }
  return out;
}

export function draftDocRefs(docs) {
  return Object.fromEntries(Object.entries(docs && typeof docs === 'object' ? docs : {})
    .filter(([, d]) => typeof d?.fileName === 'string' && !d.error)
    .map(([k, d]) => [k, d.vaultDocId
      ? { fileName: d.fileName, mime: d.mime, vaultDocId: String(d.vaultDocId), fromVault: true }
      : { fileName: d.fileName, reattach: true }]));
}

const OWNER_SLOT_BY_CATEGORY = Object.fromEntries(Object.entries(OWNER_DOC_CATEGORY).map(([k, c]) => [c, k]));

function slotForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (OWNER_SLOT_BY_CATEGORY[c]) return { side: 'owner', key: OWNER_SLOT_BY_CATEGORY[c] };
  const co = c.match(/^licensor-([1-9]\d*)-([a-z]+)$/);
  if (co) return { side: 'owner', key: `c${Number(co[1]) - 1}-${co[2]}` };
  const tenant = c.match(/^tenant-(\d+)-([a-z]+)$/);
  const tenantSlot = TENANT_DOC_KEYS[tenant?.[2]];
  return tenantSlot ? { side: 'tenant', key: `t${tenant[1]}-${tenantSlot}` } : null;
}

export function filedDocSlots(request) {
  const filed = { owner: {}, tenant: {} };
  for (const doc of request?.docs || []) {
    const slot = slotForCategory(doc.category);
    if (slot && !filed[slot.side][slot.key]) filed[slot.side][slot.key] = { fileName: doc.fileName, filedOn: request.id };
  }
  return filed;
}

export function removeIndexedDocs(docs, prefix, index) {
  const re = new RegExp(`^${prefix}(\\d+)-(.+)$`);
  return Object.fromEntries(Object.entries(docs).flatMap(([k, v]) => {
    const m = k.match(re);
    if (!m) return [[k, v]];
    const i = Number(m[1]);
    if (i === index) return [];
    return [[i > index ? `${prefix}${i - 1}-${m[2]}` : k, v]];
  }));
}
