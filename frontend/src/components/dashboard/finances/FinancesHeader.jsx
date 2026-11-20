import { useTranslation } from 'react-i18next';
import Select from '../../ui/Select.jsx';

export default function FinancesHeader({ finProp, setFinProp, listings, finPeriod, setFinPeriod, periodOpts }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 max-w-[25rem]">
        <Select value={finProp} onChange={setFinProp} options={(listings || []).map((l) => ({ value: String(l.uuid || l.id), label: l.title }))} placeholder={t('fin.selectProperty')} className="w-full" />
      </div>
      <div className="w-36 shrink-0"><Select value={finPeriod} onChange={setFinPeriod} options={periodOpts} className="w-full" /></div>
    </div>
  );
}