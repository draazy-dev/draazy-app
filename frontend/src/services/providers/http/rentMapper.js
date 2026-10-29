export function toTenancyViewModel(row) {
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    rent: Number(row?.rent) || 0,
    deposit: Number(row?.deposit) || 0,
    startDate: row?.startDate || null,
    endDate: row?.endDate || null,
    status: row?.status || 'active',
    active: (row?.status || 'active') === 'active',
    pending: row?.status === 'pending',
    confirmed: ['active', 'ended', 'terminated'].includes(row?.status || 'active'),
    tenantId: row?.tenant?.id || '',
    tenantName: row?.tenant?.name || '',
    tenantMobile: row?.tenant?.mobile || '',
    ownerId: row?.owner?.id || '',
    ownerName: row?.owner?.name || '',
    ownerMobile: row?.owner?.mobile || '',
  };
}

export function toTenancyDeclarationViewModel(row) {
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    declarantId: row?.declarantId || '',
    declarantName: row?.declarantName || '',
    livedFrom: row?.livedFrom || null,
    livedTo: row?.livedTo || null,
    status: row?.status || 'pending',
    confirmed: row?.status === 'confirmed',
    decidedAt: row?.decidedAt || null,
  };
}

export function toTenantProfileViewModel(row) {
  if (!row || (!row.mobile && !row.name)) return null;
  return {
    mobile: row.mobile || '',
    name: row.name || '',
    occupation: row.occupation || '',
    income: row.income == null ? null : Number(row.income),
    occupants: row.occupants || '',
    moveIn: row.moveIn || null,
    priorLandlord: row.priorLandlord || '',
    about: row.about || '',
    score: row.score == null ? null : Number(row.score),
    verified: !!row.verified,
  };
}

export function toTransactionViewModel(row) {
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    type: row?.type || 'expense',
    category: row?.category || '',
    amount: Number(row?.amount) || 0,
    date: row?.date || null,
    note: row?.note || '',
    recurring: row?.recurring || '',
  };
}

export function toRentalViewModel(row) {
  return {
    id: row?.id || '',
    address: row?.address || '',
    monthlyRent: Number(row?.monthlyRent) || 0,
    deposit: row?.deposit == null ? null : Number(row.deposit),
    leaseStart: row?.leaseStart || null,
    leaseEnd: row?.leaseEnd || null,
    status: row?.status || 'active',
    monthsPaid: Number(row?.monthsPaid) || 0,
    totalPaid: Number(row?.totalPaid) || 0,
    fyPaid: Number(row?.fyPaid) || 0,
  };
}

export const toSummaryViewModel = (row) => ({
  income: Number(row?.income) || 0,
  expense: Number(row?.expense) || 0,
  net: Number(row?.net) || 0,
  occupancyRate: row?.occupancyRate == null ? null : Number(row.occupancyRate),
});

export const toCashflowPoint = (row) => ({
  month: row?.month || '',
  income: Number(row?.income) || 0,
  expense: Number(row?.expense) || 0,
  net: Number(row?.net) || 0,
});

export const toDueViewModel = (row) => ({
  id: row?.id || '',
  propId: row?.propertyId || '',
  propertyId: row?.propertyId || '',
  type: row?.type || 'expense',
  category: row?.category || '',
  amount: Number(row?.amount) || 0,
  date: row?.date || null,
  note: row?.note || '',
  recurring: row?.recurring || '',
  nextDue: row?.nextDue || null,
  daysUntil: Number(row?.daysUntil) || 0,
  overdue: (Number(row?.daysUntil) || 0) < 0,
});

export function toBasisViewModel(row) {
  const has = row && (row.purchasePrice != null || row.purchaseDate || row.currentValue != null);
  if (!has) return null;
  return {
    purchasePrice: row.purchasePrice == null ? null : Number(row.purchasePrice),
    purchaseDate: row.purchaseDate || null,
    loanOutstanding: row.loanOutstanding == null ? null : Number(row.loanOutstanding),
    emi: row.emi == null ? null : Number(row.emi),
    currentValue: row.currentValue == null ? null : Number(row.currentValue),
  };
}

export function toRentAgreementViewModel(row) {
  const startDate = row?.startDate || null;
  const months = Number(row?.durationMonths) || 0;
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    tenantMobile: row?.tenantMobile || '',
    rent: Number(row?.rent) || 0,
    deposit: Number(row?.deposit) || 0,
    startDate,
    durationMonths: months || null,
    endDate: row?.endDate || null,
    date: startDate,
    status: row?.status || 'draft',
    documentUrl: row?.documentUrl || null,
  };
}
