const INCOME_CATS= ['Rent received', 'Deposit received', 'Other income'];
const EXPENSE_CATS = ['Society maintenance', 'Property tax', 'Home loan EMI', 'Repairs', 'Insurance', 'Utilities', 'Commission / fees', 'Other expense'];
export { INCOME_CATS, EXPENSE_CATS };

export const CAT_KEYS = {
  'Rent received': 'fin.catRentReceived',
  'Deposit received': 'fin.catDepositReceived',
  'Other income': 'fin.catOtherIncome',
  'Society maintenance': 'fin.catMaintenance',
  'Property tax': 'fin.catPropertyTax',
  'Home loan EMI': 'fin.catEmi',
  Repairs: 'fin.catRepairs',
  Insurance: 'fin.catInsurance',
  Utilities: 'fin.catUtilities',
  'Commission / fees': 'fin.catCommission',
  'Other expense': 'fin.catOtherExpense',
};

const finKey = (mobile, propId) => `draazyFin:${mobile || 'anon'}:${propId || 'all'}`;

function get(k, def) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; }
}
function set(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { }
  return v;
}

export function getTransactions(mobile, propId) { return get(finKey(mobile, propId), []); }
export function setTransactions(mobile, propId, txns) { return set(finKey(mobile, propId), txns); }

export function periodStart(period, now = new Date()) {
  switch (period) {
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'year':
      return now.getMonth() >= 3
        ? new Date(now.getFullYear(), 3, 1)
        : new Date(now.getFullYear() - 1, 3, 1);
    default:
      return null;
  }
}

export function filterByPeriod(txns, period, now = new Date()) {
  const start = periodStart(period, now);
  if (!start) return [...(txns || [])];
  return (txns || []).filter((t) => new Date(t.date) >= start);
}

const moves = (tx, sign) => {
  const key = tx.type === 'income' ? 'income' : 'expense';
  const moved = (Number(tx.amount) || 0) * sign;
  return { key, moved, netMoved: key === 'income' ? moved : -moved };
};

export function summaryAfter(summary, tx, sign, period, now = new Date()) {
  if (!filterByPeriod([tx], period, now).length) return summary;
  const { key, moved, netMoved } = moves(tx, sign);
  return { ...summary, [key]: summary[key] + moved, net: summary.net + netMoved };
}

export function cashflowAfter(cashflow, tx, sign) {
  const { key, moved, netMoved } = moves(tx, sign);
  const month = String(tx.date || '').slice(0, 7);
  return cashflow.map((p) => (p.month === month ? { ...p, [key]: p[key] + moved, net: p.net + netMoved } : p));
}

const totals = (txns) => {
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  return { income, expense, net: income - expense, count: txns.length };
};

export function financeSummary(mobile, propId, period = 'all', now = new Date()) {
  return totals(filterByPeriod(getTransactions(mobile, propId), period, now));
}

export function exportTransactionsCSV(txns, propId) {
  const header = ['Date', 'Type', 'Category', 'Amount', 'Note', 'Repeat'];
  const rows = txns.map((t) => [t.date, t.type, t.category, t.amount, t.note || '', t.recurring || 'none']);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `draazy-transactions-${propId || 'all'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportStatementPDF(txns, propId, title) {
  const summary = totals(txns);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.text('Property Finance Statement', 20, 20);
  doc.setFontSize(10);
  let top = 28;
  if (title) { doc.text(String(title), 20, top); top += 6; }
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 20, top);

  doc.setFontSize(12);
  doc.text(`Total Income: ₹${summary.income.toLocaleString('en-IN')}`, 20, 42);
  doc.text(`Total Expense: ₹${summary.expense.toLocaleString('en-IN')}`, 20, 50);
  doc.text(`Net: ₹${summary.net.toLocaleString('en-IN')}`, 20, 58);

  doc.setFontSize(10);
  let y = 72;
  doc.text('Date', 20, y); doc.text('Type', 50, y); doc.text('Category', 75, y); doc.text('Amount', 140, y);
  y += 8;

  txns.slice(0, 40).forEach((t) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(t.date || '', 20, y);
    doc.text(t.type || '', 50, y);
    doc.text((t.category || '').slice(0, 20), 75, y);
    doc.text(`₹${(t.amount || 0).toLocaleString('en-IN')}`, 140, y);
    y += 6;
  });

  doc.save(`draazy-statement-${propId || 'all'}.pdf`);
}
