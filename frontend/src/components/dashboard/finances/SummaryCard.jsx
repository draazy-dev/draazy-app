import { useTranslation } from 'react-i18next';
import Icon from '../../Icon.jsx';
import Tip from '../../ui/Tip.jsx';
import { fmtINR } from '../../../lib/format.js';
import { Card } from './helpers.jsx';

const signedINR = (n) => (n < 0 ? '−' : '') + fmtINR(Math.abs(n));

function Trend({ trend }) {
  if (!trend) return null;
  const up = trend.dir === 'up';
  return (
    <p className={'mt-1 flex items-center gap-1 text-xs ' + (up ? 'text-emerald-400' : 'text-rose-400')}>
      <Icon name={up ? 'trending-up' : 'trending-down'} className="w-3.5 h-3.5" aria-hidden="true" /> {trend.text}
    </p>
  );
}

function Figure({ icon, tone, label, value, trend }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className={'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' + tone} aria-hidden="true">
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-gray-400 text-xs">{label}</p>
        <p className="text-white text-base font-semibold leading-tight mt-0.5">{value}</p>
        <Trend trend={trend} />
      </div>
    </div>
  );
}

export default function SummaryCard({ summary, kpiTrend, health }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-gray-400 text-xs font-medium">{t('fin.kpiNet')}</p>
          <p className={'text-3xl font-bold leading-tight mt-1 ' + (summary.net < 0 ? 'text-rose-300' : 'text-white')}>{signedINR(summary.net)}</p>
          <Trend trend={kpiTrend.net} />
        </div>
        <Tip title={t('fin.healthTipTitle')} body={t('fin.healthTipBody')}>
          <button type="button" aria-label={t('fin.healthAria', { label: health.label })} className={'dz-chip shrink-0 cursor-help ' + health.cls}>
            <span className={'w-2 h-2 rounded-full ' + health.dot} aria-hidden="true" /> {health.label}
            <Icon name="info" className="opacity-60" aria-hidden="true" />
          </button>
        </Tip>
      </div>
      <div className="grid grid-cols-2 sm:flex sm:gap-12 gap-3 mt-4 pt-4 border-t border-white/10">
        <Figure icon="arrow-down-left" tone="bg-emerald-400/15 text-emerald-400" label={t('fin.kpiCollected')} value={fmtINR(summary.income)} trend={kpiTrend.income} />
        <Figure icon="arrow-up-right" tone="bg-rose-400/15 text-rose-400" label={t('fin.kpiExpenses')} value={fmtINR(summary.expense)} />
      </div>
    </Card>
  );
}
