import Icon from '../../../../components/Icon.jsx';
import PropertyImage from '../../../../components/ui/PropertyImage.jsx';
import { fmtINR } from '../../../../lib/format.js';
import { FURNISH_LABEL, LISTING_STATUS_CLS } from './helpers.js';
import CardActions from './CardActions.jsx';
import HomeRooms from './HomeRooms.jsx';

// Private (managed-only) property, not yet posted to buyers. A home saved from a tenant's room post has no rent
// or photos yet, so it publishes through the full wizard instead of the one-tap publish.
export default function PrivateListingCard({ l, home, onPublish, onDelete }) {
  const fromRoom = !!l.sourceRoomId;
  const bhk = home?.bhk ?? l.bhk;
  const furnishing = home?.furnishing ?? l.furnishing;
  return (
    <div className="rounded-xl bg-white/[0.03] overflow-hidden" data-testid={fromRoom ? 'owner-home-card' : undefined}>
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <PropertyImage src={l.image} alt={l.title} className="w-24 h-24 rounded-xl object-cover flex-shrink-0 sm:w-20 sm:h-20 sm:rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 sm:flex-1">
            <p className="text-white text-sm font-semibold sm:truncate">{l.title}</p>
            {(bhk || furnishing) && (
              <p className="text-gray-500 text-[11px] mt-0.5">
                {[bhk && (/BHK|RK/i.test(bhk) ? bhk : `${bhk} BHK`), furnishing && (FURNISH_LABEL[String(furnishing).toLowerCase()] || furnishing)].filter(Boolean).join(' · ')}
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
          : { label: 'Publish to buyers', icon: 'globe', tone: 'emerald', onClick: () => onPublish(l) }}
        items={[
          { icon: 'gauge', label: 'Property tools', to: `/owner-hub/property/${l.managedId}` },
          { icon: 'trash-2', label: 'Delete', tone: 'danger', onClick: () => onDelete(l) },
        ]}
      />
    </div>
  );
}
