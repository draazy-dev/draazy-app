export const fmtRent = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
export const fmtAreaSqft = (n) => (Number(n) || 0).toLocaleString('en-IN') + ' sq.ft';
