import { useTranslation } from 'react-i18next';
import DualRange from '../../../../components/ui/DualRange.jsx';
import { fmtINR } from '../../../../lib/format.js';
import { fmtRent } from '../format.js';
import { FilterGroup, Divider } from '../FilterControls.jsx';

const budgetLabel = (v) => fmtINR(v) + (v === 50000000 ? '+' : '');
const rentLabel = (v) => fmtRent(v) + (v === 100000 ? '+' : '');

export default function BudgetSection({ f, set }) {
  const { t } = useTranslation();
  const isRent = f.deal === 'rent';
  return (
    <>
      {!isRent ? (
        <FilterGroup icon="indian-rupee" title={t('listings.budgetRange')} summary={f.budget[0] === 0 && f.budget[1] === 50000000 ? '' : `${fmtINR(f.budget[0])} - ${budgetLabel(f.budget[1])}`}>
          <DualRange min={0} max={50000000} step={500000} value={f.budget} onChange={(v) => set({ budget: v })} label={t('listings.budgetRange')} format={budgetLabel} />
        </FilterGroup>
      ) : (
        <FilterGroup icon="indian-rupee" title={t('listings.monthlyRent')} summary={f.rent[0] === 0 && f.rent[1] === 100000 ? '' : `${fmtRent(f.rent[0])} - ${rentLabel(f.rent[1])}`}>
          <DualRange min={0} max={100000} step={1000} value={f.rent} onChange={(v) => set({ rent: v })} label={t('listings.monthlyRent')} format={rentLabel} />
        </FilterGroup>
      )}
      <Divider />
    </>
  );
}
