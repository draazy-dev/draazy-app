import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import BadgeRequestCard from './BadgeRequestCard.jsx';
import RoomBadgeRequestCard from './RoomBadgeRequestCard.jsx';
import PersonIdBadgeCard from './PersonIdBadgeCard.jsx';
import { flatmateKindOf } from '../../lib/data/myListings.js';
import AgreementPerks from './AgreementPerks.jsx';
import PropertyImage from '../ui/PropertyImage.jsx';
import Select from '../ui/Select.jsx';
import Tip from '../ui/Tip.jsx';
import useAsyncList from '../../hooks/useAsyncList.js';
import LoadError from '../LoadError.jsx';
import { fmtINR, timeAgo, avatarFor } from '../../lib/format.js';
import { formatSize, checklistFromDocs, DOC_CATEGORIES, docInfo, ownerDocCategories, offersHomeLoan } from '../../lib/data/documents.js';
import { listDocuments, uploadDocument, deleteDocument, listDocRequests, respondDocRequest, getDocumentUrl } from '../../services/documentService.js';
import { myTenancies, myRentAgreements } from '../../services/rentService.js';
import { toRentalCards } from '../../lib/data/tenancy.js';
import { openDocFrom } from '../../lib/openDoc.js';
import { DOCUMENT_ACCEPT, DOCUMENT_GUIDANCE_KEY, PDF_GUIDANCE_KEY } from '../../lib/uploads/policy.js';
import { userMessage } from '../../lib/userMessage.js';

const OWNER_GROUPS = [
  { id: 'title', titleKey: 'dash.grpTitle', subKey: 'dash.grpTitleSub', icon: 'scroll-text', tone: 'teal', cats: DOC_CATEGORIES['Title & Ownership'] },
  { id: 'society', titleKey: 'dash.grpSociety', subKey: 'dash.grpSocietySub', icon: 'building-2', tone: 'teal', cats: DOC_CATEGORIES['Society'] },
  { id: 'approvals', titleKey: 'dash.grpApprovals', subKey: 'dash.grpApprovalsSub', icon: 'file-badge', tone: 'teal', cats: DOC_CATEGORIES['Approvals & Plans'] },
  { id: 'purchase', titleKey: 'dash.grpPurchase', subKey: 'dash.grpPurchaseSub', icon: 'receipt-indian-rupee', tone: 'teal', cats: DOC_CATEGORIES['Purchase & Payments'] },
  { id: 'tax', titleKey: 'dash.grpTax', subKey: 'dash.grpTaxSub', icon: 'zap', tone: 'amber', cats: DOC_CATEGORIES['Tax & Utilities'] },
];

const findDoc = (list, category) =>
  (list || []).find((d) => d.category === category) ||
  (list || []).find((d) => d.category?.toLowerCase().includes(category.toLowerCase().slice(0, 8)));

const countDone = (cats, docs) => cats.filter((c) => findDoc(docs, c)).length;

const agreementMatchesProp = (ra, propId, listing) => {
  if (ra.propId) return ra.propId === propId;
  const t = (listing?.title || '').toLowerCase();
  const raT = (ra.property || ra.title || '').toLowerCase();
  return !!t && !!raT && (raT.includes(t) || t.includes(raT));
};

function Ring({ done, total, size = 72, stroke = 7, loading = false }) {
  const pct = total ? done / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = total > 0 && done === total;
  const col = complete ? 'stroke-emerald-400' : done > 0 ? 'stroke-teal-400' : 'stroke-white/20';
  if (loading) {
    return (
      <div className="relative flex-shrink-0 animate-pulse" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} className="stroke-white/[0.08]" strokeWidth={stroke} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} className="stroke-white/[0.18]" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.75} />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-white/[0.08]" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white text-sm font-bold leading-none">{done}<span className="text-gray-500 text-[10px] font-semibold">/{total}</span></span>
      </div>
    </div>
  );
}

function InfoDot({ category }) {
  const { t } = useTranslation();
  const info = docInfo(category);
  if (!info) return null;
  return (
    <Tip title={info.title} body={info.body}>
      <button type="button" aria-label={t('dash.whatIsCat', { category })} className="absolute top-2 right-2 z-20 w-5 h-5 rounded-full bg-white/8 hover:bg-white/15 text-gray-400 hover:text-teal-300 flex items-center justify-center transition pointer-events-auto">
        <Icon name="info" className="w-3 h-3" />
      </button>
    </Tip>
  );
}

function DocTile({ category, doc, onUpload, onRemove, onView }) {
  const { t } = useTranslation();
  const hasInfo = !!docInfo(category);
  if (doc) {
    return (
      <div className="relative rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 flex flex-col gap-2 min-h-[96px] transition hover:border-emerald-400/40">
        <InfoDot category={category} />
        <div className={'flex items-start gap-2 ' + (hasInfo ? 'pr-6' : '')}>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0"><Icon name="file-text" className="w-4 h-4 text-emerald-400" /></div>
          <p className="text-white text-xs font-semibold leading-tight line-clamp-2 flex-1 min-w-0">{category}</p>
        </div>
        <p className="text-gray-500 text-[10px] truncate">{doc.name}{doc.size ? ' · ' + formatSize(doc.size) : ''}</p>
        <div className="flex items-center gap-1.5 mt-auto">
          <button onClick={() => onView(doc)} className="flex-1 text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 font-semibold inline-flex items-center justify-center gap-1"><Icon name="eye" className="w-3 h-3" /> {t('dash.view')}</button>
          <button onClick={() => onRemove(doc.id)} className="text-gray-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10" aria-label={t('dash.removeCat', { category })}><Icon name="trash-2" className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="group relative rounded-xl border border-dashed border-white/15 bg-white/[0.02] min-h-[96px] transition hover:border-teal-400/50 hover:bg-teal-400/[0.04]">
      <button onClick={() => onUpload(category)} className="absolute inset-0 w-full h-full rounded-xl" aria-label={t('dash.uploadCat', { category })} />
      <InfoDot category={category} />
      <div className="relative pointer-events-none p-3 flex flex-col gap-2 h-full">
        <div className={'flex items-start gap-2 ' + (hasInfo ? 'pr-6' : '')}>
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-400/15 transition"><Icon name="file-up" className="w-4 h-4 text-gray-500 group-hover:text-teal-400 transition" /></div>
          <p className="text-gray-400 text-xs font-medium leading-tight line-clamp-2 flex-1 min-w-0 group-hover:text-gray-300">{category}</p>
        </div>
        <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-semibold text-teal-400/80 group-hover:text-teal-300"><Icon name="upload" className="w-3 h-3" /> {t('dash.upload')}</span>
      </div>
    </div>
  );
}

function CategoryCard({ group, docs, open, onToggle, onUpload, onRemove, onView }) {
  const { t } = useTranslation();
  const total = group.cats.length;
  const done = countDone(group.cats, docs);
  const complete = total > 0 && done === total;
  const toneCls = group.tone === 'amber' ? 'bg-amber-500/15 text-amber-400' : 'bg-teal-500/15 text-teal-400';
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button onClick={() => onToggle(group.id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-white/[0.02] transition" aria-expanded={open}>
        <div className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + toneCls}><Icon name={group.icon} className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-semibold truncate">{t(group.titleKey)}</p>
            <span className={'dz-tag font-semibold ' + (complete ? 'bg-emerald-500/15 text-emerald-300' : done ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.08] text-gray-400')}>{done}/{total}</span>
          </div>
          {group.subKey && <p className="text-gray-500 text-xs mt-0.5 truncate">{t(group.subKey)}</p>}
          <div className="mt-2 h-1 rounded-full bg-white/[0.08] overflow-hidden max-w-[240px]">
            <div className={'h-full rounded-full transition-all duration-500 ' + (complete ? 'bg-emerald-400' : 'bg-teal-400')} style={{ width: (total ? (done / total) * 100 : 0) + '%' }} />
          </div>
        </div>
        <Icon name="chevron-down" className={'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      <div className={'px-4 sm:px-5 border-t border-white/5 overflow-hidden transition-all duration-200 ' + (open ? 'max-h-[3000px] pb-5 pt-4 opacity-100' : 'max-h-0 pb-0 pt-0 opacity-0')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {group.cats.map((cat) => <DocTile key={cat} category={cat} doc={findDoc(docs, cat)} onUpload={onUpload} onRemove={onRemove} onView={onView} />)}
        </div>
      </div>
    </div>
  );
}

function PanelCard({ id, icon, tone, title, sub, badge, open, onToggle, children }) {
  const toneCls = tone === 'amber' ? 'bg-amber-500/15 text-amber-400' : tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-teal-500/15 text-teal-400';
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button onClick={() => onToggle(id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-white/[0.02] transition" aria-expanded={open}>
        <div className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + toneCls}><Icon name={icon} className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-semibold truncate">{title}</p>
            {badge}
          </div>
          {sub && <p className="text-gray-500 text-xs mt-0.5 truncate">{sub}</p>}
        </div>
        <Icon name="chevron-down" className={'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      <div className={'px-4 sm:px-5 border-t border-white/5 overflow-hidden transition-all duration-200 ' + (open ? 'max-h-[3000px] pb-5 pt-4 opacity-100' : 'max-h-0 pb-0 pt-0 opacity-0')}>{children}</div>
    </div>
  );
}

const pill = (cls, children) => <span className={'dz-tag font-semibold ' + cls}>{children}</span>;

function AgreementList({ ras, emptyText, ownerView = false }) {
  const { t } = useTranslation();
  if (!ras.length) {
    return (
      <div className="text-center py-6">
        <Icon name="file-signature" className="w-8 h-8 text-gray-600 mx-auto" />
        <p className="text-gray-500 text-sm mt-2">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ras.map((ra, i) => (
        <div key={ra.id || i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-teal-400/15 flex items-center justify-center flex-shrink-0"><Icon name="file-text" className="w-4 h-4 text-teal-400" /></div>
            <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{ra.property || ra.title || t('dash.agreementFallback')}</p><p className="text-gray-500 text-[11px] truncate">{ra.tenant || t('dash.tenantFallback')} · {ra.date || 'N/A'}</p></div>
            <button className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-300 font-semibold hover:bg-white/10 flex-shrink-0">{t('dash.download')}</button>
          </div>
          <AgreementPerks ra={ra} isOwner={ownerView} />
        </div>
      ))}
    </div>
  );
}

function VaultSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] min-h-[96px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function DocumentsTab({ user, listings, toast, isOwner = false, onRoomBadgeChanged }) {
  const { t } = useTranslation();
  const propList = (listings || []).filter((listing) => !!listing.uuid);
  const [rental, setRental] = useState({ tenancies: [], agreements: [], loaded: false });
  useEffect(() => {
    let alive = true;
    Promise.all([
      myTenancies().catch(() => []),
      myRentAgreements().catch(() => []),
    ]).then(async ([rows, agreementRows]) => {
      if (!alive) return;
      const tenancies = await toRentalCards((rows || []).filter((row) => row.confirmed));
      if (!alive) return;
      setRental({
        tenancies,
        agreements: agreementRows || [],
        loaded: true,
      });
    });
    return () => { alive = false; };
  }, [user]);

  const tenancies = rental.tenancies;
  const agreements = rental.agreements;
  const isTenant = tenancies.length > 0 || (!isOwner && agreements.length > 0);

  const [pickedContext, setContext] = useState(null);
  const searchParams = useSearchParams()[0];
  const linkedProp = searchParams.get('prop');
  const linkedRoom = searchParams.get('room') || searchParams.get('group') || searchParams.get('post');
  const linkedKind = searchParams.get('room') ? 'room' : searchParams.get('group') ? 'group' : 'post';
  const linkedFlatmate = linkedRoom ? `${linkedKind}:${linkedRoom}` : null;
  const flatmateOption = (l) => ({ value: `${flatmateKindOf(l)}:${l.id}`, label: `${l.title} · ${t('dash.roomBadge.flatmateTag')}` });
  const needsPropertyProof = (l) => l.hostRole === 'tenant' && !l.flatmatePost && !(l.flatmateGroup && l.hunting);
  const flatmateListings = (listings || []).filter((l) => l.flatmate && !l.propertyId);
  const proofOptions = flatmateListings.filter(needsPropertyProof).map(flatmateOption);
  const flatmateOptions = [
    ...proofOptions,
    ...flatmateListings.filter((l) => l.flatmatePost || (l.flatmateGroup && l.hunting)).map(flatmateOption),
  ];
  if (linkedFlatmate && !flatmateOptions.some((o) => o.value === linkedFlatmate)) {
    flatmateOptions.unshift({ value: linkedFlatmate, label: t('dash.roomBadge.roomFallback') });
  }
  const contexts = [(propList.length > 0 || flatmateOptions.length > 0) && 'owner', isTenant && 'tenancy'].filter(Boolean);
  const context = contexts.includes(pickedContext) ? pickedContext : contexts[0] || null;
  const appliedRoom = useRef(null);
  const linkedListing = linkedProp ? propList.find((l) => l.id === linkedProp || l.uuid === linkedProp) : null;
  const [docProp, setDocProp] = useState(linkedFlatmate || linkedListing?.id || propList[0]?.id || '');
  useEffect(() => {
    if (linkedFlatmate && appliedRoom.current !== linkedFlatmate) {
      appliedRoom.current = linkedFlatmate;
      setContext('owner');
      setDocProp(linkedFlatmate);
    }
  }, [linkedFlatmate]);
  const appliedLink = useRef(linkedListing ? linkedProp : null);
  const [tenProp, setTenProp] = useState('');
  useEffect(() => {
    if (!tenProp && tenancies[0]?.propId) setTenProp(tenancies[0].propId);
  }, [tenancies, tenProp]);
  useEffect(() => {
    if (linkedListing && appliedLink.current !== linkedProp) {
      appliedLink.current = linkedProp;
      setDocProp(linkedListing.id);
      return;
    }
    if (!propList.some((l) => l.id === docProp) && !flatmateOptions.some((o) => o.value === docProp)) {
      setDocProp(propList[0]?.id || proofOptions[0]?.value || '');
    }
  }, [listings, linkedProp]); // eslint-disable-line react-hooks/exhaustive-deps -- linkedProp derives from listings
  useEffect(() => {
    if (tenancies.length && !tenancies.some((t) => t.propId === tenProp)) setTenProp(tenancies[0].propId);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- initial property follows the signed-in user
  const [openSections, setOpenSections] = useState({ title: true });
  const toggle = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const selectedListing = propList.find((l) => l.id === docProp);
  const [flatmateKind, flatmateId] = flatmateOptions.some((o) => o.value === docProp) ? docProp.split(':') : [];
  const personKind = flatmateId && (flatmateKind === 'post' || (flatmateKind === 'group' && flatmateListings.some((l) => l.id === flatmateId && l.hunting)));
  const docPropertyId = selectedListing?.uuid;
  const mobile = user?.mobile;
  const ownerVaultEnabled = !!mobile && !!docPropertyId;
  const [ownerDocs, ownerStatus, setOwnerDocs, reloadOwner, ownerError] = useAsyncList(
    () => listDocuments(mobile, docPropertyId), [mobile, docPropertyId], ownerVaultEnabled,
  );
  const [personalDocs, personalStatus, , reloadPersonal, personalError] = useAsyncList(
    () => listDocuments(mobile, 'personal'), [mobile], !!mobile,
  );
  const [docReqs, reqStatus, setDocReqs, reloadReqs, reqError] = useAsyncList(
    () => listDocRequests(mobile), [mobile], !!mobile,
  );
  const activePropRef = useRef(docPropertyId);
  activePropRef.current = docPropertyId;
  const relevantCats = selectedListing ? ownerDocCategories(selectedListing) : [];
  const uploadedCats = new Set(ownerDocs.map((d) => d.category));
  const ownerGroups = OWNER_GROUPS
    .map((g) => ({ ...g, cats: g.cats.filter((c) => relevantCats.includes(c) || uploadedCats.has(c)) }))
    .filter((g) => g.cats.length > 0);
  const ownerCats = ownerGroups.flatMap((g) => g.cats);
  const checklist = offersHomeLoan(selectedListing) ? checklistFromDocs(ownerDocs, relevantCats) : null;
  const propAgreements = agreements.filter((ra) => agreementMatchesProp(ra, docPropertyId, selectedListing));
  const selectedTenancy = tenancies.find((t) => t.propId === tenProp) || tenancies[0];
  const tenancyAgreements = selectedTenancy
    ? agreements.filter((ra) => agreementMatchesProp(ra, selectedTenancy.propId, selectedTenancy))
    : agreements;

  const listingOptions = propList.map((l) => ({ value: l.id, label: l.title + (l.deal === 'rent' ? ` · ${t('dash.dealRent')}` : ` · ${t('dash.dealSale')}`) }));
  const propOptions = [...listingOptions, ...flatmateOptions];

  const uploadForCategory = (category) => {
    const targetProp = docPropertyId;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = DOCUMENT_ACCEPT;
    inp.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const created = await uploadDocument(mobile, targetProp, { category, file });
        if (created && activePropRef.current === targetProp) {
          setOwnerDocs((prev) => [created, ...prev]);
        }
        toast(t('dash.uploadedToast', { file: file.name, category }), 'success');
      } catch (error) {
        toast(userMessage(error, t('dash.uploadFailedToast')), 'error');
      }
    };
    inp.click();
  };
  const removeDoc = async (id) => {
    const targetProp = docPropertyId;
    try {
      const remaining = await deleteDocument(mobile, targetProp, id);
      if (activePropRef.current === targetProp) setOwnerDocs(remaining || []);
      toast(t('dash.docRemovedToast'));
    } catch { toast(t('dash.docRemoveFailedToast'), 'error'); }
  };
  const handleDocReq = async (reqId, grant) => {
    let updated;
    try {
      updated = await respondDocRequest(mobile, reqId, grant ? 'granted' : 'declined');
    } catch {
      toast(t('dash.reqFailedToast'), 'error');
      return;
    }
    const nextStatus = grant ? 'granted' : 'declined';
    setDocReqs((prev) => prev.map((r) => (r.id === reqId ? (updated || { ...r, status: nextStatus }) : r)));
    if (!grant) { toast(t('dash.reqDeclinedToast'), 'info'); return; }
    const shared = updated?.sharedDocumentCount || 0;
    if (shared > 0) {
      toast(t('dash.accessGrantedToast'), 'success');
    } else {
      toast(t('dash.approvedNoDocToast'), 'info');
    }
  };
  const viewDoc = async (doc) => {
    if (!(await openDocFrom(() => getDocumentUrl(doc.id)))) toast(t('dash.noPreviewToast'));
  };

  const headerDone = context === 'owner' ? countDone(ownerCats, ownerDocs) : (tenancyAgreements.length ? 1 : 0);
  const headerTotal = context === 'owner' ? ownerCats.length : 1;
  const pendingReqs = docReqs.filter((r) => r.status === 'pending').length;
  const vaultLoading = context === 'owner' && ownerStatus === 'loading' && ownerDocs.length === 0;

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-2xl p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4">
              {(context === 'owner' ? !!selectedListing : context === 'tenancy') && <Ring done={headerDone} total={headerTotal} loading={vaultLoading} size={60} stroke={6} />}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon name="folder-lock" className="w-5 h-5 text-teal-400" />
                  <h2 className="text-white text-lg font-bold">{t('dash.vaultTitle')}</h2>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed mt-1.5 flex items-start gap-1.5">
                  <Icon name="lock" className="w-3.5 h-3.5 mt-1 text-emerald-400 flex-shrink-0" />
                  {t('dash.vaultSub')}
                </p>
              </div>
            </div>
            {context === 'owner' && (
              <ul className="mt-4 space-y-2.5 text-xs leading-relaxed">
                <li className="flex items-start gap-2 text-gray-400">
                  <Icon name="file-text" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {t(DOCUMENT_GUIDANCE_KEY)}
                </li>
                <li className="flex items-start gap-2 text-amber-200">
                  <Icon name="file-signature" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {t(PDF_GUIDANCE_KEY)}
                </li>
              </ul>
            )}
            {contexts.length > 1 && (
              <div className="inline-flex max-w-full overflow-x-auto mt-4 p-1 rounded-full bg-white/5 border border-white/10">
                {[
                  ['owner', 'home', 'dash.ctxOwner'],
                  ['tenancy', 'key', 'dash.ctxTenancy'],
                ].map(([c, ic, labelKey]) => (
                  <button key={c} onClick={() => setContext(c)} className={'shrink-0 px-4 min-h-11 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5 ' + (context === c ? 'bg-brand-teal text-ink' : 'text-gray-400 hover:text-white')}>
                    <Icon name={ic} className="w-3.5 h-3.5" /> {t(labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {context === 'owner' && (
            <div className="sm:w-64 flex-shrink-0">
              <label className="text-gray-500 text-[11px] font-medium mb-1.5 block">{t('dash.managingFor')}</label>
              <Select value={docProp} onChange={setDocProp} options={propOptions} placeholder={t('dash.selectProperty')} className="w-full" />
            </div>
          )}
          {context === 'tenancy' && tenancies.length > 1 && (
            <div className="sm:w-64 flex-shrink-0">
              <label className="text-gray-500 text-[11px] font-medium mb-1.5 block">{t('dash.rentedHome')}</label>
              <Select value={tenProp} onChange={setTenProp} options={tenancies.map((x) => ({ value: x.propId, label: x.title }))} placeholder={t('dash.selectRental')} className="w-full" />
            </div>
          )}
        </div>
      </div>

      {rental.loaded && !context && (
        <p className="glass-card rounded-2xl p-4 sm:p-5 text-gray-400 text-sm">{t('dash.vaultEmpty')}</p>
      )}

      {context === 'owner' && (
        <>
          {flatmateId ? (
            <>
              {personKind ? <PersonIdBadgeCard key={docProp} /> : (
                <RoomBadgeRequestCard key={`${mobile}:${docProp}`} kind={flatmateKind} roomId={flatmateId} personalDocs={personalDocs}
                  onRequested={() => { reloadPersonal(); onRoomBadgeChanged?.(flatmateId); }} toast={toast} />
              )}
              {personalStatus === 'error' && <LoadError message={t('dash.vaultLoadError')} error={personalError} onRetry={reloadPersonal} t={t} />}
            </>
          ) : selectedListing ? (
            <>
              {ownerStatus === 'error' ? (
              <LoadError message={t('dash.vaultLoadError')} error={ownerError} onRetry={reloadOwner} t={t} />
            ) : ownerStatus === 'loading' && ownerDocs.length === 0 ? (
              <VaultSkeleton />
            ) : (
              <>
                {ownerStatus === 'ready' ? (
                  <BadgeRequestCard key={selectedListing.uuid} listing={selectedListing} docs={ownerDocs} onUpload={uploadForCategory} toast={toast} />
                ) : null}
                {ownerGroups.map((g) => (
                  <CategoryCard key={g.id} group={g} docs={ownerDocs} open={!!openSections[g.id]} onToggle={toggle} onUpload={uploadForCategory} onRemove={removeDoc} onView={viewDoc} />
                ))}
              </>
            )}

            {(selectedListing.deal === 'rent' || propAgreements.length > 0) && (
              <PanelCard id="ownerAgreements" icon="file-signature" tone="teal" title={t('dash.rentAgreement')}
                sub={t('dash.agreementForProp', { title: selectedListing.title })}
                badge={propAgreements.length ? pill('bg-teal-500/15 text-teal-300', String(propAgreements.length)) : null}
                open={!!openSections.ownerAgreements} onToggle={toggle}>
                <AgreementList ras={propAgreements} ownerView emptyText={t('dash.noAgreementProp')} />
              </PanelCard>
            )}
            {ownerStatus === 'ready' && checklist?.items.length > 0 && (
              <PanelCard id="checklist" icon="clipboard-list" tone="amber" title={t('dash.loanChecklist')} sub={t('dash.loanChecklistSub')}
                badge={pill(checklist.items.every((i) => i.done) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300', `${checklist.items.filter((i) => i.done).length}/${checklist.items.length}`)}
                open={!!openSections.checklist} onToggle={toggle}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {checklist.items.map((it) => (
                    <div key={it.name} className={'flex items-center gap-3 p-2.5 rounded-lg border ' + (it.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/[0.08] bg-white/[0.02]')}>
                      <Icon name={it.done ? 'check-circle' : 'circle'} className={'w-4 h-4 flex-shrink-0 ' + (it.done ? 'text-emerald-400' : 'text-gray-500')} />
                      <span className={'text-xs ' + (it.done ? 'text-emerald-300' : 'text-gray-400')}>{it.name}</span>
                    </div>
                  ))}
                </div>
              </PanelCard>
            )}
            </>
          ) : null}

          {(docReqs.length > 0 || reqStatus === 'error') && (
            <PanelCard id="requests" icon="user-check" tone="teal" title={t('dash.docRequests')} sub={t('dash.docRequestsSub')}
              badge={reqStatus !== 'error' && pendingReqs > 0 ? pill('bg-amber-500/15 text-amber-300', t('dash.pendingCount', { count: pendingReqs })) : null}
              open={openSections.requests !== false} onToggle={toggle}>
              {reqStatus === 'error' ? (
                <LoadError message={t('dash.reqsLoadError')} error={reqError} onRetry={reloadReqs} t={t} />
              ) : (
                <div className="space-y-3">
                  {docReqs.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">{avatarFor(r.buyerName)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{r.buyerName}</p>
                        <p className="text-gray-500 text-xs">{t('dash.requestedLine', { docType: (r.categories || [r.docType]).join(', ') })} · {timeAgo(r.requestedAt)}</p>
                      </div>
                      {r.status === 'pending' ? (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => handleDocReq(r.id, true)} className="px-3 py-1.5 rounded-lg bg-teal-500/15 text-teal-300 text-xs font-semibold hover:bg-teal-500/25 flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5" /> {t('dash.grant')}</button>
                          <button onClick={() => handleDocReq(r.id, false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-xs font-semibold hover:bg-white/10 flex items-center gap-1"><Icon name="x" className="w-3.5 h-3.5" /> {t('dash.decline')}</button>
                        </div>
                      ) : r.status === 'granted' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300 font-medium flex-shrink-0"><Icon name="badge-check" className="w-3.5 h-3.5" /> {t('dash.granted')}</span>
                      ) : r.status === 'expired' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium flex-shrink-0"><Icon name="clock" className="w-3.5 h-3.5" /> {t('dash.accessExpired')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium flex-shrink-0"><Icon name="x-circle" className="w-3.5 h-3.5" /> {t('dash.declined')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          )}
        </>
      )}

      {context === 'tenancy' && (
        <>
          {selectedTenancy && (
            <div className="glass-card rounded-2xl p-4 sm:p-5 flex items-center gap-4">
              <PropertyImage src={selectedTenancy.image} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{selectedTenancy.title}</p>
                <p className="text-gray-500 text-xs truncate">{selectedTenancy.address}</p>
                <p className="text-gray-400 text-xs mt-0.5">{t('dash.landlordLine', { name: selectedTenancy.ownerName })}{selectedTenancy.rent ? ` · ${t('dash.perMonth', { amount: fmtINR(selectedTenancy.rent) })}` : ''}</p>
              </div>
            </div>
          )}

          <PanelCard id="tenancyAgreement" icon="file-signature" tone="teal" title={t('dash.rentAgreement')}
            sub={selectedTenancy ? t('dash.agreementForProp', { title: selectedTenancy.title }) : t('dash.agreementForRental')}
            badge={tenancyAgreements.length ? pill('bg-teal-500/15 text-teal-300', String(tenancyAgreements.length)) : null}
            open={openSections.tenancyAgreement !== false} onToggle={toggle}>
            <AgreementList ras={tenancyAgreements} emptyText={t('dash.noAgreementRental')} />
          </PanelCard>
        </>
      )}
    </div>
  );
}
