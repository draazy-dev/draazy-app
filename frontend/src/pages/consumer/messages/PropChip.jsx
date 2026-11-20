import { Link, useNavigate } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import PropertyImage from '../../../components/ui/PropertyImage.jsx';
import { fmtINR } from '../../../lib/format.js';

const displayPrice = (p) => {
  if (!p?.price) return '';
  if (typeof p.price === 'string' && (p.price.includes('Cr') || p.price.includes('L') || p.price.includes('/mo') || p.price.includes(' '))) return p.price;
  const num = typeof p.price === 'number' ? p.price : parseInt(String(p.price).replace(/[^\d]/g, ''), 10);
  if (!num) return String(p.price);
  return p.deal === 'rent' ? `${fmtINR(num)}/mo` : fmtINR(num);
};

const listingLine = (property) => [property?.bhk, property?.loc].filter(Boolean).join(' · ');

export default function PropChip({ t, propertyId, property, href, canSchedule = true }) {
  const navigate = useNavigate();
  const gone = property?.available === false;
  return (
    <div className={'pc-propchip' + (gone ? ' unavailable' : '')} data-testid="chat-propchip">
      {gone ? <div className="pc-prop-empty"><Icon name="home" className="w-5 h-5" /></div> : <PropertyImage src={property?.img} alt="" />}
      <div className="t"><p>{property?.title}</p><p>{gone ? 'No longer listed' : [displayPrice(property), listingLine(property)].filter(Boolean).join(' · ')}</p></div>
      {!gone && canSchedule ? <button type="button" onClick={() => navigate(`/schedule-visit?listing=${propertyId}`)}>Schedule visit</button> : null}
      <Link to={href || `/property/${propertyId}`}>{t('misc.msgViewListing')}</Link>
    </div>
  );
}
