const KINDS = new Set(['listing-pass', 'contact-pack']);

export const toPlanCatalogueEntry = (row) => ({
  id: row.id,
  slug: KINDS.has(row.kind) ? row.kind : null,
  name: row.name,
  kind: row.kind ?? null,
  audience: row.audience,
  price: row.price,
  billingCycle: row.billingCycle,
  termDays: row.termDays ?? null,
  listingLimit: row.listingLimit ?? null,
  contactLimit: row.contactLimit ?? null,
  features: row.features || [],
});
