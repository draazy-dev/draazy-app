import { ShieldCheck } from 'lucide-react';
import { fmtAgo } from '../../../../lib/format.js';

const EVIDENCE = { electricity_bill: 'light bill' };

function basisOf(review) {
  if (review.tier === 'owner') return 'Owner host: the badge follows their own Verified property listing.';
  if (review.tier !== 'tenant') return null;
  const evidence = EVIDENCE[review.evidenceType] || 'rent agreement';
  const consent = review.ownerConsent ? 'Owner consent given.' : 'Owner consent still missing.';
  return `Tenant host: ${evidence} as evidence. ${consent}`;
}

/* The Properties desk's banner, minus its decline: the decision itself sits in the badge section below. */
export default function BadgeRequestBanner({ review }) {
  const basis = basisOf(review);
  return (
    <div data-testid="badge-request-banner" className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-indigo-100">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Host is seeking the Verified property badge
      </div>
      {basis ? <p className="mt-1 text-xs text-indigo-100/80">{basis}</p> : null}
      <p className="mt-1 text-xs text-indigo-100/80">
        Requested{review.createdAt ? ` ${fmtAgo(review.createdAt)}` : ''}. Check the evidence in the badge section, then approve or reject.
      </p>
    </div>
  );
}
