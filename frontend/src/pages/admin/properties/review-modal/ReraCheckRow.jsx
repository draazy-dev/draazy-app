import { Copy, ExternalLink } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext.jsx';
import { classNames } from '../../../../lib/format.js';
import { mahaReraSearchUrl } from '../../../../lib/maharera.js';

export const RERA_REVIEW_ITEM = 'RERA ID checked on MahaRERA';

const RESULTS = [
  { value: 'verified', label: 'Verified', on: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' },
  { value: 'not_found', label: 'Not found', on: 'border-rose-400/50 bg-rose-500/20 text-rose-100' },
  { value: 'mismatch', label: 'Mismatch', on: 'border-amber-400/50 bg-amber-500/20 text-amber-100' },
];

export default function ReraCheckRow({ reraId, result, onRecord }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reraId);
      toast('RERA ID copied');
    } catch {
      toast('Could not copy the RERA ID', 'error');
    }
  };
  return (
    <div data-testid="rera-check" className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-sm font-semibold text-gray-100">{RERA_REVIEW_ITEM}</p>
      <p className="break-all font-mono text-xs text-gray-300">{reraId}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="rera-copy" onClick={copy}
          className="dz-btn dz-btn-ghost min-h-[44px] text-xs"><Copy className="h-3.5 w-3.5" /> Copy RERA ID</button>
        <a href={mahaReraSearchUrl(reraId)} target="_blank" rel="noopener noreferrer"
          className="dz-btn dz-btn-ghost min-h-[44px] text-xs"><ExternalLink className="h-3.5 w-3.5" /> Open MahaRERA search</a>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="RERA check result">
        {RESULTS.map((r) => (
          <button key={r.value} type="button" data-testid={`rera-${r.value}`} aria-pressed={result === r.value}
            onClick={() => onRecord(r.value)}
            className={classNames('min-h-[44px] rounded-xl border px-2 text-xs font-semibold transition-colors',
              result === r.value ? r.on : 'border-white/10 text-gray-200 hover:bg-white/[0.05]')}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
