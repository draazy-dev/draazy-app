import { Link } from 'react-router';
import Icon from '../../../../components/Icon.jsx';
import PropertyImage from '../../../../components/ui/PropertyImage.jsx';
import { fmtArea, fmtDate, fmtINR } from '../../../../lib/format.js';
import { publishHref } from '../../owner-hub/helpers.js';
import { FURNISH_LABEL, LISTING_STATUS_CLS } from './helpers.js';
import CardActions from './CardActions.jsx';
import HomeRooms from './HomeRooms.jsx';

export default function PrivateListingCard({ l, home, onDelete }) {
  const fromRoom = !!l.sourceRoomId;
  const bhk = home?.bhk ?? l.bhk;
  const furnishing = home?.furnishing ?? l.furnishing;
  const detailsHref = `/owner-hub/property/${l.managedId}`;
  const facts = [
    bhk && (/BHK|RK/i.test(bhk) ? bhk : `${bhk} BHK`),
    l.area && fmtArea(l.area, l.areaUnit),
    furnishing && (FURNISH_LABEL[String(furnishing).toLowerCase()] || furnishing),
  ].filter(Boolean);
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-card shadow-[var(--tile-shadow)] overflow-hidden" data-testid={fromRoom ? 'owner-home-card' : 'private-listing-card'}>
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <Link to={detailsHref} className="flex-shrink-0" aria-label={l.title}>
          <PropertyImage src={l.image} alt={l.title} className="w-24 h-24 rounded-xl object-cover sm:w-20 sm:h-20 sm:rounded-lg" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 sm:flex-1">
            <Link to={detailsHref} className="block text-white text-sm font-semibold hover:text-brand-teal-2 sm:truncate">{l.title}</Link>
            {facts.length > 0 && <p className="text-gray-500 text-[11px] mt-0.5">{facts.join(' · ')}</p>}
            {l.agreementVerified && (
              <span className="dz-tag font-semibold mt-1.5 bg-emerald-500/15 text-emerald-300" data-testid="private-agreement-verified">
                <Icon name="badge-check" className="w-3 h-3" />Agreement verified
              </span>
            )}
            {l.rented && l.tenantName && (
              <p className="text-[11px] text-gray-400 mt-1" data-testid="private-tenant">
                Rented to {l.tenantName}{l.leaseEnd ? ` till ${fmtDate(l.leaseEnd)}` : ''}
              </p>
            )}
            <p className="text-xs mt-0.5">
              {l.locality && <span className="text-gray-500">{l.locality}{fromRoom ? '' : ' · '}</span>}
              {fromRoom
                ? <span className="block text-gray-400 mt-0.5">Only you can see this. Add rent and photos to list it.</span>
                : <span className="text-white font-semibold">{fmtINR(l.price)}{l.deal === 'rent' ? '/mo' : ''}</span>}
            </p>
            {!fromRoom && (
              <div className="mt-2 max-w-[220px]">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1"><span>Passport</span><span>{l.passportPct}%</span></div>
                <div className="insight-bar"><span style={{ width: `${l.passportPct}%` }} /></div>
              </div>
            )}
          </div>
          <span className={'dz-tag font-semibold self-start ' + (fromRoom ? LISTING_STATUS_CLS.pending : LISTING_STATUS_CLS.private)}>
            <Icon name={fromRoom ? 'shield-alert' : 'lock'} className="w-3 h-3" />{fromRoom ? 'Unverified' : 'Private'}
          </span>
        </div>
      </div>
      {fromRoom && <HomeRooms rooms={home?.rooms} />}
      <CardActions
        primary={fromRoom
          ? { label: 'Complete & publish', icon: 'pencil', tone: 'emerald', to: `/list-property?deal=rent&home=${encodeURIComponent(l.managedId)}` }
          : { label: 'Add photos & publish', icon: 'globe', tone: 'emerald', to: publishHref(l) }}
        items={[
          { icon: 'eye', label: 'View details', to: detailsHref },
          { icon: 'trash-2', label: 'Delete', tone: 'danger', onClick: () => onDelete(l) },
        ]}
      />
    </div>
  );
}
