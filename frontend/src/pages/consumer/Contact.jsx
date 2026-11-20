import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import PropertyImage from '../../components/ui/PropertyImage.jsx';
import { useScrollReveal } from '../../lib/useScrollReveal.js';
import { maskPhone } from '../../lib/contact.js';
import { supportLink } from '../../lib/supportLink.js';
import { getProperty } from '../../services/propertyService.js';
import { fmtINR } from '../../lib/format.js';
import { SUPPORT_PHONE, SUPPORT_TEL, SUPPORT_WHATSAPP } from '../../lib/supportContact.js';

const WA_SUPPORT = `${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Hi Draazy, I need help with a property enquiry.')}`;

function titleOf(p) {
  if (!p) return '';
  if (p.title) return p.title;
  return `${p.bhkNum ? p.bhkNum + ' BHK ' : ''}${p.type || 'Property'}`;
}

export default function Contact() {
  const rootRef = useScrollReveal();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const ref = params.get('ref');

  const [refListing, setRefListing] = useState(null);
  useEffect(() => {
    if (!ref) { setRefListing(null); return undefined; }
    let current = true;
    getProperty(ref)
      .then((p) => { if (current) setRefListing(p || null); })
      .catch(() => { if (current) setRefListing(null); });
    return () => { current = false; };
  }, [ref]);
  const refTitle = titleOf(refListing);

  const owner = refListing
    ? {
        name: refListing.owner || 'Owner',
        mobile: refListing.ownerMobile || '',
        profile: refListing.ownerId ? `/owner/${refListing.ownerId}` : '/owner',
      }
    : null;
  const ownerInitials = (owner?.name || 'O')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={rootRef}>
      <div className="pt-8 lg:pt-10 pb-20 min-h-[100dvh]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 sm:mb-10 reveal">
            <span className="dz-tag bg-teal-500/10 border border-teal-500/20 text-teal-400 font-semibold mb-3">
              {t('misc1.contactBadge')}
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{t('misc1.contactTitle')}</h1>
            <p className="text-gray-400 text-sm max-w-lg">{t('misc1.contactSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-4 reveal">
              <Link
                to={supportLink('general')}
                data-testid="contact-chat-cta"
                className="flex items-center gap-3 rounded-2xl border border-teal-400/30 bg-teal-400/[0.06] px-4 py-4 transition-colors hover:border-teal-400/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-400/10">
                  <Icon name="message-square" className="w-5 h-5 text-teal-400" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{t('misc.supportChatTitle')}</span>
                  <span className="block text-xs text-gray-500">{t('misc.supportChatBody')}</span>
                </span>
                <Icon name="arrow-right" className="w-4 h-4 shrink-0 text-gray-500" />
              </Link>
              {refListing ? (
                <Link to={`/property/${refListing.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/15 transition-colors">
                  <PropertyImage src={refListing.image} alt="" width={56} height={44} className="w-14 h-11 rounded-lg object-cover shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-teal-300/80 font-semibold">{t('misc1.contactEnquiringAbout')}</p>
                    <p className="text-sm font-semibold text-white truncate">{refTitle}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {refListing.locality ? `${refListing.locality} · ` : ''}
                      {refListing.deal === 'rent' ? `₹${(refListing.price || 0).toLocaleString('en-IN')}/mo` : fmtINR(refListing.price)}
                    </p>
                  </div>
                  <Icon name="arrow-right" className="w-4 h-4 text-teal-400 ml-auto shrink-0" />
                </Link>
              ) : null}
              {owner ? (
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4">{t('misc1.contactDirectTitle')}</h2>
                  <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Icon name="hand-coins" className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-300 font-medium">{t('misc1.contactNoBrokerage')}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">{ownerInitials}</div>
                    <div><p className="text-white font-semibold">{owner.name}</p>{refListing.ownerVerified ? <p className="text-gray-500 text-xs flex items-center gap-1"><Icon name="badge-check" className="w-3.5 h-3.5 text-teal-400" /> {t('misc1.contactVerifiedOwner')}</p> : null}</div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Icon name="phone-off" className="w-4 h-4 text-slate-500" />
                        <span className="tracking-wider">{maskPhone(owner.mobile)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><Icon name="lock-keyhole" className="w-3 h-3" /> {t('misc1.contactHiddenPrivacy')}</p>
                    </div>
                    <Link to={`/property/${refListing.id}`} className="btn-teal w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold"><Icon name="lock-keyhole" className="w-4 h-4" /> {t('misc1.contactRequestIt')}</Link>
                    <Link to={owner.profile} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 text-gray-300 text-sm hover:bg-white/10 transition-all"><Icon name="user" className="w-4 h-4" /> {t('misc1.contactViewOwnerProfile')}</Link>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="reveal">
              <div className="glass-card rounded-2xl p-6">
                <p className="text-white font-semibold text-sm mb-1">{t('misc1.contactSupportTitle')}</p>
                <p className="text-gray-500 text-xs mb-3">{t('misc1.contactSupportHours')}</p>
                <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
                  <Icon name="clock" className="w-4 h-4 text-teal-400" />
                  <span className="text-xs text-teal-300 font-medium">{t('misc1.contactResponseTime')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
                  <a href={SUPPORT_TEL} className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 min-h-[44px] py-3 px-2 lg:px-4 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm hover:bg-white/10 transition-all">
                    <Icon name="headset" className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="font-semibold text-xs lg:hidden">{t('misc1.contactCall')}</span>
                    <span className="font-semibold hidden lg:inline">{SUPPORT_PHONE}</span>
                  </a>
                  <a href={WA_SUPPORT} target="_blank" rel="noopener noreferrer" className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 min-h-[44px] py-3 px-2 lg:px-4 rounded-xl border border-emerald-500/20 text-emerald-300 text-sm hover:bg-emerald-500/10 transition-all">
                    <Icon name="message-circle" className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-xs lg:hidden">{t('misc1.contactWhatsappShort')}</span>
                    <span className="font-semibold hidden lg:inline">{t('misc1.contactWhatsapp')}</span>
                  </a>
                  <a href="mailto:support@draazy.com" className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 min-h-[44px] py-3 px-2 lg:px-4 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-sm hover:bg-white/10 transition-all">
                    <Icon name="mail" className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="font-semibold text-xs lg:hidden">{t('misc1.contactEmailShort')}</span>
                    <span className="truncate hidden lg:inline">support@draazy.com</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="dz-sticky-cta lg:hidden" role="navigation" aria-label="Quick contact support">
        <a href={SUPPORT_TEL} className="btn-teal flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold py-3 px-4 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"><Icon name="phone" className="w-4 h-4" /> {t('misc1.contactCall')}</a>
        <a href={WA_SUPPORT} target="_blank" rel="noopener noreferrer" className="h-btn flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"><Icon name="message-circle" className="w-4 h-4" /> {t('misc1.contactWhatsappShort')}</a>
      </div>
    </div>
  );
}
