const KINDS = new Set(['listing-pass', 'contact-pack']);

/** Wire `PlanDto` → the catalogue shape the pricing page reads; `slug` is the wire `kind` that routes and gates use. */
export const toPlanCatalogueEntry = (row) => ({
  id: row.id,
  slug: KINDS.has(row.kind) ? row.kind : null,
  name: row.name,
  kind: row.kind ?? null,
  audience: row.audience,
  price: row.price,
  billingCycle: row.billingCycle,
  termDays: row.termDays ?? null,
  // A null entitlement is the plan stating no number, never unlimited.
  listingLimit: row.listingLimit ?? null,
  contactLimit: row.contactLimit ?? null,
  features: row.features || [],
});
