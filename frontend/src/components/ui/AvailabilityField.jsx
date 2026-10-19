import { useTranslation } from 'react-i18next';
import DateField from './DateField.jsx';
import { addDaysIso, firstOfNextMonthIso, istToday, MAX_AVAILABLE_DAYS } from '../../lib/availability.js';

/** Availability entry: two quick chips plus a date; the value is always an ISO date. */
export default function AvailabilityField({ value, onChange, dataErr, invalid, ariaLabel, className = '' }) {
  const { t } = useTranslation();
  const today = istToday();
  const chips = [['now', today], ['nextMonth', firstOfNextMonthIso(today)]];
  return (
    <div className="space-y-2.5" role="group" aria-label={ariaLabel} data-testid="availability-field">
      <div className="flex flex-wrap gap-2">
        {chips.map(([key, date]) => {
          const on = value === date;
          return (
            <button key={key} type="button" onClick={() => onChange(date)} aria-pressed={on}
              className={`seg text-sm font-semibold px-4 min-h-[44px] inline-flex items-center rounded-full text-gray-300 box-border shrink-0${on ? ' active' : ''}`}>
              {t(`availability.chip_${key}`)}
            </button>
          );
        })}
      </div>
      <DateField value={value} onChange={onChange} min={today} max={addDaysIso(today, MAX_AVAILABLE_DAYS)}
        dataErr={dataErr} invalid={invalid} ariaLabel={ariaLabel} className={`${className} min-h-[44px]`} />
    </div>
  );
}
