import { Link } from 'react-router';
import Icon from '../../../../components/Icon.jsx';
import { fmtINR } from '../../../../lib/format.js';
import { detailPath } from '../../flatmates/helpers.js';

const isLive = (r) => r.status === 'active' && (r.modStatus === 'live' || r.modStatus === 'approved');

/* Flatmate rooms a tenant listed in the owner's flat, confirmed by the owner on WhatsApp. */
export default function HomeRooms({ rooms }) {
  if (!rooms?.length) return null;
  return (
    <div className="border-t border-white/6 px-3 py-2.5 sm:px-4" data-testid="home-rooms">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Flatmate posts in this home</p>
      <ul className="mt-1.5 space-y-1.5">
        {rooms.map((r) => {
          const live = isLive(r);
          const body = (
            <>
              <Icon name="bed-double" className="w-4 h-4 flex-shrink-0 text-teal-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{r.roomType || 'Room'} · {fmtINR(r.budget)}/mo</span>
                <span className="block text-[11px] text-gray-500">Posted by {r.tenantFirstName}</span>
              </span>
              <span className={'dz-tag self-center font-semibold ' + (live ? 'bg-brand-teal/10 text-brand-teal-3' : 'bg-amber-500/15 text-amber-300')}>
                {live ? 'Live' : 'In review'}
              </span>
            </>
          );
          return (
            <li key={r.id}>
              {live ? (
                <Link to={detailPath('room', r.id)} className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1 hover:bg-white/5">{body}</Link>
              ) : (
                <div className="flex min-h-[44px] items-center gap-2.5 px-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
