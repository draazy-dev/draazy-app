import { useTranslation } from 'react-i18next';
import Icon from '../../Icon.jsx';
import { fmtDate, fmtINR } from '../../../lib/format.js';
import { CAT_KEYS } from '../../../lib/data/finances.js';
import { Card } from './helpers.jsx';

export default function ActivityPanel({ finType, setFinType, typeOpts, hasAny, filteredTxs, showAllTx, setShowAllTx, onAdd, onRemove }) {
  const { t } = useTranslation();
  const txRow = (tx) => (
    <div key={tx.id} className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ' + (tx.type === 'income' ? 'bg-emerald-400/15 text-emerald-400' : 'bg-rose-400/15 text-rose-400')}>
          <Icon name={tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'} className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm truncate">{t(CAT_KEYS[tx.category] || tx.category, { defaultValue: tx.category })}{tx.note ? ` — ${tx.note}` : ''}</p>
          {/* The wire spells "not recurring" as 'none'; the mapper's fallback is ''. */}
          <p className="text-gray-400 text-xs">{fmtDate(tx.date) || tx.date}{tx.recurring && tx.recurring !== 'none' ? ` · ${t('fin.recurringTag')}` : ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={'text-sm font-semibold ' + (tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>{tx.type === 'income' ? '+' : '−'}{fmtINR(tx.amount)}</span>
        <button type="button" onClick={() => onRemove(tx.id)} aria-label={t('fin.removeTx')} className="text-gray-500 hover:text-rose-400 p-2.5 -mr-2.5"><Icon name="trash-2" className="w-4 h-4" /></button>
      </div>
    </div>
  );

  if (!hasAny) {
    return (
      <Card className="px-4 py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3"><Icon name="receipt-indian-rupee" className="w-6 h-6 text-gray-500" /></div>
        <p className="text-gray-200 text-sm font-medium">{t('fin.noTx')}</p>
        <p className="text-gray-400 text-xs mt-1">{t('fin.noTxSub')}</p>
        <button type="button" onClick={onAdd} className="dz-control dz-control--action px-4 gap-2 mt-4 inline-flex"><Icon name="plus" className="w-4 h-4" /> {t('fin.addTransaction')}</button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div role="group" aria-label={t('fin.filterType')} className="inline-flex items-center gap-0.5 p-1 rounded-full border border-white/10 bg-white/[0.05]">
          {typeOpts.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={finType === o.value}
              onClick={() => setFinType(o.value)}
              className={'dz-chip border-transparent ' + (finType === o.value ? 'bg-brand-teal text-ink' : 'bg-transparent text-gray-400 hover:text-white')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onAdd} aria-label={t('fin.addTransaction')} className="dz-control dz-control--action px-4 gap-2 shrink-0"><Icon name="plus" className="w-4 h-4" aria-hidden="true" /> {t('fin.add')}</button>
      </div>
      <Card className="px-4 sm:px-5 py-1">
        {filteredTxs.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">{t('fin.noMatch')}</p>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {filteredTxs.slice(0, showAllTx ? filteredTxs.length : 5).map(txRow)}
            </div>
            {filteredTxs.length > 5 && (
              <button type="button" onClick={() => setShowAllTx((v) => !v)} className="mb-2 w-full text-center text-xs text-teal-400 hover:text-teal-300 py-2">
                {showAllTx ? t('fin.showLess') : t('fin.viewAll', { count: filteredTxs.length })}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
