/* Passport completeness: basics, a valuation, a document, and rent details or a vacant mark. */

export function passportChecklist(prop, docCount = 0) {
  const basics = !!(prop.locality && prop.bhkNum && prop.area);
  const valued = !!prop.valuation;
  const hasDoc = docCount > 0;
  const rentReady = prop.rented ? !!(prop.monthlyRent && prop.tenantName && prop.tenantMobile) : true;
  const furnished = !!prop.furnishing;
  return [
    { key: 'basics', labelKey: 'ownerHub.ckBasics', done: basics },
    { key: 'furnishing', labelKey: 'ownerHub.ckFurnishing', done: furnished },
    { key: 'valued', labelKey: 'ownerHub.ckValued', done: valued },
    { key: 'docs', labelKey: 'ownerHub.ckDocs', done: hasDoc },
    { key: 'rent', labelKey: prop.rented ? 'ownerHub.ckRent' : 'ownerHub.ckOccupancy', done: rentReady },
  ];
}

export function passportPercent(prop, docCount = 0) {
  const items = passportChecklist(prop, docCount);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
