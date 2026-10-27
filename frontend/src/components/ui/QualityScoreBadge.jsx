import { useTranslation } from 'react-i18next';
import { qualityColor } from '../../lib/qualityScore.js';
import { classNames } from '../../lib/format.js';

export default function QualityScoreBadge({ listing }) {
  const { t } = useTranslation();
  const score = listing?.qualityScore;
  if (!Number.isFinite(score)) return null;
  const c = qualityColor(score);

  return (
    <div className={classNames('dz-tag', c.bg, c.text)} title={t('ui.qualityShort', { score })}>
      <ScoreRing score={score} color={c.ring} size={12} />
      <span className="text-[10px] font-semibold tabular-nums">{score}</span>
    </div>
  );
}

function ScoreRing({ score, color, size }) {
  const r = size * 0.42;
  const circumference = 2 * Math.PI * r;
  const dashLength = (score / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={color}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={size * 0.15} opacity="0.2" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={size * 0.15} strokeDasharray={`${dashLength} ${circumference}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
