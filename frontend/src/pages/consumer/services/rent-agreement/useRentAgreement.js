import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../../../lib/useScrollReveal.js';
import { useLatest, useSignInGate } from '../../../../lib/useSignInGate.js';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { usePricing } from '../../../../context/PricingContext.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { inviteRouteFor, isActive } from '../../../../lib/serviceRequestStatus.js';
import { listDocuments, uploadDocument } from '../../../../services/documentService.js';
import { REVISIT_READ } from '../../../../services/http.js';
import { useFormDraft } from '../../../../lib/hooks.js';
import { OWNER_DOCS, OWNER_VAULT_CAT, LAST_PUBLIC_STEP, MAX_LICENSORS, MAX_TENANTS, DECLARATION_VERSION, REVIEW_STEP } from './constants.js';
import { digits, num, rentForTerm, emptyTenant, emptyProp, emptyOwner, emptyCoOwner, emptyInvite, emptyTerms, DETAILS_MAX_CHARS, detailsChars, largestFreeTextField, redactIdentityNumbers, hasIdentityNumbers, identityReminderFields, missingIdentityReminderFields, identityParties, fillBlanks, namesOtherFlat, filingKey, listingAnswers, readSavedKyc } from './helpers.js';
import { docReady, stepErrors as formStepErrors, startDateBounds } from './validation.js';
import { collectDocs as collectFormDocs, draftDocRefs, filedDocSlots, removeIndexedDocs } from './documents.js';
import { useRaFurniture } from './useRaFurniture.js';
import { useRaPayment } from './useRaPayment.js';
import { useEntitlements } from '../../property/useEntitlements.js';
import { getDealFees } from '../../../../services/feesService.js';
import { leaveLicenceStamp } from '../../../../lib/toolCalc.js';
import { myListing, myListings } from '../../../../services/propertyService.js';
import { rentAgreementRenewal, rentAgreementHomeRenewal } from '../../../../services/rentService.js';
import {
  addServiceRequestDoc,
  addServiceRequestDocFromVault,
  cancelServiceRequest,
  createCoFillServiceRequest,
  decideServiceRequestInvite,
  createServiceRequest as createServiceRequestLive,
  getServiceRequest,
  inviteServiceRequestParty,
  listMyServiceRequestInvites,
  listServiceRequests,
  openServiceRequestCheckout,
  recordServiceRequestIdentities,
  readMaskedServiceRequestIdentities,
  submitServiceRequestPartyDetails,
  updateServiceRequestDetails,
  withdrawServiceRequestParty,
} from '../../../../services/serviceRequestService.js';

const DRAFT_KEY = 'dzDraft:rentAgreement';

const withDefaults = (base, saved) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, saved?.[k] === undefined ? v : saved[k]]));

const invitedRole = (s) => (s?.ownerMode === 'invite' ? 'owner' : s?.tenantMode === 'invite' ? 'tenant' : null);

const heldCoFill = (r) => !invitedRole(r?.details?._state) && (r?.parties || []).some((p) => p?.status === 'accepted');

const partyNames = (s) => ({
  'owner-0': s?.owner?.oName,
  ...Object.fromEntries((s?.coOwners || []).map((c, i) => [`owner-${i + 1}`, c?.name])),
  ...Object.fromEntries((s?.tenants || []).map((t, i) => [`tenant-${i}`, t?.name])),
});
const sameName = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();
// The server drops a recorded PAN once its party is renamed, so it only counts as on file under the original name.
const stillHeld = (masked, state) => {
  const names = partyNames(state);
  return Object.fromEntries(Object.entries(masked).filter(([k, v]) => !v.name || sameName(v.name, names[k])));
};

export function useRentAgreement() {
  const rootRef = useScrollReveal();
  const { t: tr } = useTranslation();
  const { user, isIn, loading } = useAuth();
  const { toast } = useToast();
  const { fee } = usePricing();
  const formRef = useRef(null);
  const { mountedRef, paymentPending, paymentConfirming, payAndConfirm, resetPayment } = useRaPayment({ tr, toast });
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const routeState = useLocation().state;
  const openedToView = !!routeState?.raView;
  const sendToSignIn = useSignInGate();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const [restoredIdentityFields, setRestoredIdentityFields] = useState([]);
  const filedRef = useRef(null);
  const uploadedRef = useRef(new Map());
  const [openFaq, setOpenFaq] = useState(-1);
  const [startNew, setStartNew] = useState(false);

  const [mode, setMode] = useState('owner');
  const [inviteCtx, setInviteCtx] = useState(null);
  const { entitlements, refresh: refreshEntitlements } = useEntitlements(isIn && !inviteCtx);
  const discountPercent = entitlements?.agreements?.discountPercent ?? 0;
  const referralCredit = (entitlements?.agreements?.remaining ?? 0) >= 1 && discountPercent > 0;
  const [inviteError, setInviteError] = useState(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [myProperties, setMyProperties] = useState([]);
  useEffect(() => {
    if (!isIn) { setMyProperties([]); return undefined; }
    let alive = true;
    myListings(user, REVISIT_READ)
      .then((rows) => { if (alive) setMyProperties(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setMyProperties([]); });
    return () => { alive = false; };
  }, [isIn, user]);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [prop, setProp] = useState(emptyProp());

  const [owner, setOwner] = useState(emptyOwner(isIn, user));
  const [coOwners, setCoOwners] = useState([]);
  const [ownerDocs, setOwnerDocs] = useState({});
  const [ownerMode, setOwnerMode] = useState('fill');

  const [tenantMode, setTenantMode] = useState('fill');
  const [tenants, setTenants] = useState([emptyTenant()]);
  const [tenantDocs, setTenantDocs] = useState({});
  const [invite, setInvite] = useState(emptyInvite());

  const [terms, setTerms] = useState(emptyTerms());
  const [maint, setMaint] = useState('Tenant');
  const regArea = prop.gramPanchayat ? 'rural' : 'urban';
  const { furnItems, setFurnItems, custom, setCustom, isChecked, toggleFurn, bumpQty, removeFurn, addCustom, furnitureText } = useRaFurniture();
  const [clauses, setClauses] = useState('');

  const [declare, setDeclare] = useState(false);

  const setP = (k, v) => setProp((p) => ({ ...p, [k]: v }));
  const setO = (k, v) => setOwner((p) => ({ ...p, [k]: v }));
  const setT = (k, v) => setTerms((p) => ({ ...p, [k]: v }));
  const setTenant = (i, k, v) => setTenants((arr) => arr.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const setCoOwner = (i, k, v) => setCoOwners((arr) => arr.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const clearErr = (k) => setErrors((e) => (e[k] ? { ...e, [k]: false } : e));

  const captureFormState = () => ({
    step,
    prop, terms, maint, regArea, furnItems, clauses, declare,
    ...(ownerMode === 'invite'
      ? { owner: { ...emptyOwner(false), oMobile: digits(invite.invMobile).slice(-10) }, coOwners: [] }
      : { owner, coOwners }),
    tenants: tenantMode === 'invite' ? tenants.map(({ police: _police, ...invited }) => invited) : tenants,
    tenantMode, ownerMode, invite, selectedPropertyId,
  });
  const captureShareableState = () => {
    const { selectedPropertyId: _selectedPropertyId, ...state } = captureFormState();
    return redactIdentityNumbers(state);
  };

  const applyFormState = (s) => {
    if (!s || typeof s !== 'object') return;
    if (typeof s.step === 'number') setStep(Math.min(s.step, REVIEW_STEP));
    if (s.prop) {
      const restored = withDefaults(emptyProp(), s.prop);
      setProp(restored);
    }
    if (s.selectedPropertyId) setSelectedPropertyId(s.selectedPropertyId);
    if (s.owner) setOwner(withDefaults(emptyOwner(false), s.owner));
    if (Array.isArray(s.coOwners)) setCoOwners(s.coOwners.slice(0, MAX_LICENSORS - 1).map((c) => withDefaults(emptyCoOwner(), c)));
    if (s.terms) {
      const restored = withDefaults(emptyTerms(), s.terms);
      setTerms({ ...restored, months: String(restored.months), rent: digits(s.terms.rent), deposit: digits(s.terms.deposit), nrDeposit: digits(s.terms.nrDeposit) });
    }
    if (s.maint) setMaint(s.maint);
    if (s.furnItems) setFurnItems(s.furnItems);
    if (s.clauses != null) setClauses(s.clauses);
    if (s.declare != null) setDeclare(s.declare);
    if (s.tenants) setTenants(s.tenants.map((t) => withDefaults(emptyTenant(), t)));
    if (s.tenantMode === 'invite' && s.invite?.invMobile && !(s.tenants || []).some((t) => digits(t.mobile))) {
      setTenants([withDefaults(emptyTenant(), { ...(s.tenants?.[0] || {}), name: s.invite.invName || '', mobile: s.invite.invMobile })]);
    }
    if (s.tenantMode) setTenantMode(s.tenantMode);
    setOwnerMode(s.ownerMode === 'invite' ? 'invite' : 'fill');
    if (s.invite) setInvite(s.invite);
    if (s.docRefs) {
      const restore = (refs) => (cur) => ({
        ...cur,
        ...Object.fromEntries(Object.entries(draftDocRefs(refs)).filter(([k]) => !docReady(cur[k]))),
      });
      setOwnerDocs(restore(s.docRefs.owner));
      setTenantDocs(restore(s.docRefs.tenant));
    }
  };

  const [activeRequests, setActiveRequests] = useState([]);
  const [requestsNonce, setRequestsNonce] = useState(0);
  useEffect(() => {
    if (!isIn || !user?.mobile) { setActiveRequests([]); return undefined; }
    let alive = true;
    listServiceRequests('rental', requestsNonce ? undefined : REVISIT_READ)
      .then((rs) => { if (alive) setActiveRequests((rs || []).filter((r) => isActive(r.status))); })
      .catch(() => { if (alive) setActiveRequests([]); });
    return () => { alive = false; };
  }, [isIn, user, done, requestsNonce]);
  const ownRequests = activeRequests.filter((r) => !r.myPartyId);
  const locked = mode === 'owner' && !done && !startNew && activeRequests.length > 0;
  const joinedOnly = ownRequests.length === 0;

  const stalledInvite = (() => {
    const side = (r, role) => (r.parties || []).filter((p) => p?.role === role);
    const r = ownRequests.find((x) => {
      const role = invitedRole(x.details?._state);
      if (!role) return false;
      if (role !== 'tenant') return !side(x, role).some((p) => p.status === 'invited' || p.status === 'accepted');
      const count = Math.max(1, (x.details?._state?.tenants || []).length);
      return Array.from({ length: count }).some((_, i) => !side(x, role)
        .some((p) => Number(p.partyIndex || 0) === i && (p.status === 'invited' || p.status === 'accepted')));
    });
    if (!r) return null;
    const role = invitedRole(r.details._state);
    const partyIndex = role === 'tenant'
      ? Array.from({ length: Math.max(1, (r.details?._state?.tenants || []).length) })
        .findIndex((_, i) => !side(r, role).some((p) => Number(p.partyIndex || 0) === i && (p.status === 'invited' || p.status === 'accepted')))
      : 0;
    return {
      requestId: r.id,
      role,
      partyIndex,
      declined: side(r, role).find((p) => Number(p.partyIndex || 0) === partyIndex && p.status === 'declined') || null,
    };
  })();
  const [recovering, setRecovering] = useState(false);
  const recoverInvite = async (action, mobile) => {
    if (recovering || !stalledInvite) return;
    setRecovering(true);
    try {
      if (action === 'cancel') {
        await cancelServiceRequest(stalledInvite.requestId);
      } else {
        if (stalledInvite.declined) await withdrawServiceRequestParty(stalledInvite.requestId, stalledInvite.declined.id);
        await inviteServiceRequestParty(stalledInvite.requestId, { role: stalledInvite.role, partyIndex: stalledInvite.partyIndex, mobile: digits(mobile) });
      }
      if (mountedRef.current) toast(tr(action === 'cancel' ? 'services.ra.declined.cancelled' : 'services.ra.declined.reinvited'), 'success');
    } catch (err) {
      console.error('Rent Agreement invite recovery failed', err?.status);
      if (mountedRef.current) toast(tr('services.ra.declined.failed'), 'error');
    } finally {
      if (mountedRef.current) { setRecovering(false); setRequestsNonce((n) => n + 1); }
    }
  };

  const tenantFillsLater = (r) => invitedRole(r.details?._state) === 'tenant';
  const payables = [
    ...ownRequests.filter((r) => r.status === 'awaiting_payment' && Number(r.amount) > 0
      && invitedRole(r.details?._state) !== 'owner'
      && (tenantFillsLater(r) || (r.id !== stalledInvite?.requestId && !(r.parties || []).some((p) => p.status === 'invited')))),
    ...activeRequests.filter((r) => r.myPartyId && r.payableByMe),
  ];
  const payable = payables[0] || null;
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const payFiled = async (request = payable) => {
    if (payingRef.current || !request) return;
    payingRef.current = true;
    setPaying(true);
    try {
      const checkout = await openServiceRequestCheckout(request.id, DECLARATION_VERSION);
      const status = await payAndConfirm(checkout, Number(request.amount) || null);
      if (mountedRef.current && status === 'cancelled') toast(tr('services.ra.checkoutFailed'), 'error');
      else if (mountedRef.current && status && status !== 'awaiting_payment') toast(tr('services.ra.pay.paid'), 'success');
    } catch (err) {
      console.error('Rent Agreement checkout refused', err?.status);
      if (mountedRef.current) toast(err?.status === 409 && err?.message ? tr('services.ra.checkoutIncomplete', { detail: err.message }) : tr('services.ra.checkoutFailed'), 'error');
    } finally {
      payingRef.current = false;
      refreshEntitlements();
      if (mountedRef.current) { setPaying(false); setRequestsNonce((n) => n + 1); }
    }
  };

  const liveParty = (r, role) => (r.parties || []).some((p) => p?.role === role && (p.status === 'invited' || p.status === 'accepted'));
  const continuable = ownRequests.find((r) => r.status === 'awaiting_payment' && !r.paymentSessionId && r.details?._state
    && (invitedRole(r.details._state) ? liveParty(r, invitedRole(r.details._state)) : heldCoFill(r) || !(r.parties || []).length)) || null;
  const topUpRef = useRef(null);
  const topUpBaselineRef = useRef(null);
  const [coFilledRole, setCoFilledRole] = useState(null);
  const [maskedIds, setMaskedIds] = useState({});
  const maskedForRef = useRef(null);
  const loadMaskedIds = (id, state) => {
    maskedForRef.current = id;
    const current = () => mountedRef.current && maskedForRef.current === id;
    const names = state ? partyNames(state) : {};
    return readMaskedServiceRequestIdentities(id)
      .then((ids) => {
        if (current()) setMaskedIds(Object.fromEntries(Object.entries(ids || {}).map(([k, v]) => [k, names[k] ? { ...v, name: names[k] } : v])));
      })
      .catch(() => { if (current()) toast(tr('services.ra.maskedIdsFailed'), 'error'); });
  };
  const answersKey = () => filingKey({ ...captureShareableState(), step: 0 });
  const restoreFiledDocs = (request) => {
    const filed = filedDocSlots(request);
    const fill = (add) => (cur) => ({ ...cur, ...Object.fromEntries(Object.entries(add).filter(([k]) => !cur[k]?.dataUrl)) });
    setOwnerDocs(fill(filed.owner));
    setTenantDocs(fill(filed.tenant));
  };
  useEffect(() => {
    if (topUpRef.current && topUpBaselineRef.current == null) topUpBaselineRef.current = answersKey();
  });
  const continueFiled = () => {
    if (!continuable) return;
    if (heldCoFill(continuable)) { holdFiled(continuable); return; }
    const role = invitedRole(continuable.details._state);
    if (!restored || role) applyFormState(continuable.details._state);
    const coFilled = role && (continuable.parties || []).some((p) => p?.role === role && p.status === 'accepted') ? role : null;
    setCoFilledRole(coFilled);
    setMaskedIds({});
    loadMaskedIds(continuable.id, continuable.details._state);
    restoreFiledDocs(continuable);
    if (invitedRole(continuable.details._state)) {
      topUpRef.current = continuable;
      topUpBaselineRef.current = null;
    } else filedRef.current = { key: filingKey({ details: continuable.details, propertyId: continuable.propertyId || undefined }), request: continuable };
    setPendingRequestId(continuable.id);
    setSelectedPropertyId(continuable.propertyId || null);
    setStep(0);
    setStartNew(true);
  };

  const [viewingFiled, setViewingFiled] = useState(null);
  const [editingFiled, setEditingFiled] = useState(null);
  const [inviteEditing, setInviteEditing] = useState(false);
  const canView = (r) => (r.myPartyId ? r.editableByMe || !!r.details?._state : r.mySideSubmitted && !!r.details?._state);
  const viewOwnFiled = (r) => {
    if (!r?.details?._state) return;
    applyFormState(r.details._state);
    setCoFilledRole(invitedRole(r.details._state));
    setMaskedIds({});
    loadMaskedIds(r.id, r.details._state);
    setOwnerDocs({});
    setTenantDocs({});
    restoreFiledDocs(r);
    filedRef.current = null;
    setSelectedPropertyId(r.propertyId || null);
    setErrors({});
    setEditingFiled(null);
    setViewingFiled(r);
    setStep(0);
    setStartNew(true);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const viewSubmitted = (r) => {
    if (r?.myPartyId) navigate(inviteRouteFor({ id: r.myPartyId, requestId: r.id }), { state: { raView: true } });
    else viewOwnFiled(r);
  };
  const holdFiled = (r) => {
    viewOwnFiled(r);
    setViewingFiled(null);
    setEditingFiled(r);
  };
  const heldId = routeState?.raHold;
  useEffect(() => {
    const r = heldId && ownRequests.find((x) => x.id === heldId && heldCoFill(x));
    if (!r) return;
    const kyc = readSavedKyc(user?.mobile) || {};
    holdFiled(r);
    setOwner((o) => ({ ...fillBlanks(o, { oName: user?.name || kyc.name, oDob: kyc.dob, oAge: kyc.age }), oMobile: digits(user?.mobile).slice(-10) }));
    navigate('/services/rent-agreement', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume the hand-over once, when the request list arrives
  }, [heldId, activeRequests]);
  const editSubmitted = () => {
    if (mode === 'invite') {
      setInviteEditing(true);
      setStep(inviteCtx?.invite?.toRole === 'owner' ? 1 : 2);
      return;
    }
    if (!viewingFiled?.editableByMe) return;
    setEditingFiled(viewingFiled);
    setViewingFiled(null);
  };
  const closeFiled = () => {
    if (mode === 'invite') {
      navigate('/services/rent-agreement');
      return;
    }
    startNewAgreement();
    setStartNew(false);
  };
  const discardEdits = () => {
    if (mode === 'invite') {
      if (inviteCtx?.req?.details?._state) applyFormState(inviteCtx.req.details._state);
      setInviteEditing(false);
      setErrors({});
      setStep(0);
      return;
    }
    if (editingFiled) viewOwnFiled(editingFiled);
    else closeFiled();
  };
  const viewOnly = !done && (mode === 'invite' ? !!inviteCtx && !inviteEditing && (!!inviteCtx.req?.mySideSubmitted || openedToView) : !!viewingFiled);
  const viewedRequest = viewOnly ? (mode === 'invite' ? inviteCtx.req : viewingFiled) : null;

  const startNewAgreement = () => {
    clearDraft();
    setStep(0);
    setErrors({});
    setLiveStep(null);
    setProp(emptyProp());
    setSelectedPropertyId(null);
    setOwner(emptyOwner(isIn, user));
    setCoOwners([]);
    setOwnerDocs({});
    setOwnerMode('fill');
    setTenantMode('fill');
    setTenants([emptyTenant()]);
    setTenantDocs({});
    setInvite(emptyInvite());
    setTerms(emptyTerms());
    setMaint('Tenant');
    setFurnItems([]);
    setCustom({ name: '', qty: 1 });
    setClauses('');
    setDeclare(false);
    setInviteResult(null);
    setCopied(false);
    setOpenFaq(-1);
    resetPayment();
    setPendingRequestId(null);
    filedRef.current = null;
    topUpRef.current = null;
    topUpBaselineRef.current = null;
    setCoFilledRole(null);
    setMaskedIds({});
    maskedForRef.current = null;
    uploadedRef.current = new Map();
    setEditingFiled(null);
    setViewingFiled(null);
    setStartNew(true);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!hasIdentityNumbers(saved)) return;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...redactIdentityNumbers(saved),
        identityReminders: identityReminderFields(saved),
      }));
    } catch {}
  }, []);

  const form = {
    ...captureShareableState(),
    identityReminders: identityReminderFields(captureFormState()),
    docRefs: { owner: draftDocRefs(ownerDocs), tenant: draftDocRefs(tenantDocs) },
  };
  const restoreFormState = (upd) => {
    const next = typeof upd === 'function' ? upd(captureFormState()) : upd;
    setRestoredIdentityFields(Array.isArray(next?.identityReminders) ? next.identityReminders : []);
    applyFormState(next);
  };
  const { restored, clear: clearDraft, flush: flushDraft, startFresh } = useFormDraft(DRAFT_KEY, form, restoreFormState, { enabled: mode === 'owner' && !done && !viewingFiled && !editingFiled, ignore: ['oName', 'oMobile', 'step'] });

  const gated = mode === 'owner' && !loading && !isIn;

  const gateToSignIn = (resume) => {
    flushDraft();
    sendToSignIn('services', undefined, resume);
  };

  useLayoutEffect(() => {
    if (!gated) return;
    if (step > LAST_PUBLIC_STEP) setStep(LAST_PUBLIC_STEP);
  }, [gated, step]);

  useEffect(() => {
    if (mode !== 'owner' || !isIn) return;
    const kyc = readSavedKyc(user?.mobile);
    if (kyc) {
      setOwner((o) => ({ ...o, oName: o.oName || kyc.name || '', oDob: o.oDob || kyc.dob || '', oAge: o.oAge || kyc.age || '', oMobile: o.oMobile || kyc.mobile || '' }));
    } else {
      setOwner((o) => ({ ...o, oName: o.oName || user?.name || '', oMobile: o.oMobile || user?.mobile || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed owner only when mode/sign-in flips
  }, [mode, isIn]);

  const persistOwnerKYC = () => {
    if (mode !== 'owner' || ownerMode === 'invite' || !isIn) return;
    try {
      const mob = digits(owner.oMobile || user?.mobile || '');
      if (!mob) return;
      localStorage.setItem('draazyOwnerKYC:' + mob, JSON.stringify({ name: owner.oName, dob: owner.oDob, age: owner.oAge, mobile: owner.oMobile, savedAt: Date.now() }));
    } catch {}
  };

  const vaultEnabled = mode === 'owner' && isIn && !!user?.mobile;
  useEffect(() => {
    if (!vaultEnabled) return;
    let cancelled = false;
    (async () => {
      const personal = await listDocuments(user.mobile, 'personal', REVISIT_READ).catch(() => null);
      if (cancelled || !personal) return;
      const held = new Set(personal.map((d) => String(d.id)));
      setOwnerDocs((cur) => {
        const next = { ...cur };
        OWNER_DOCS.forEach(([, k]) => {
          const d = next[k];
          if (d?.vaultDocId && !d.dataUrl && !held.has(String(d.vaultDocId))) next[k] = { fileName: d.fileName, reattach: true };
          if (docReady(next[k])) return;
          const hit = personal.find((row) => row.category === OWNER_VAULT_CAT[k] && row.id);
          if (hit) next[k] = { fileName: hit.name, mime: hit.mime, vaultDocId: hit.id, fromVault: true };
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh vault only when it becomes available
  }, [vaultEnabled]);

  const saveOwnerDocToVault = async (k, d, file) => {
    if (!vaultEnabled || !d?.dataUrl || d.fromVault || !file) return;
    const cat = OWNER_VAULT_CAT[k];
    if (!cat) return;
    try {
      const existing = await listDocuments(user.mobile, 'personal', REVISIT_READ);
      const saved = existing.find((x) => x.category === cat && x.name === d.fileName)
        || await uploadDocument(user.mobile, 'personal', { category: cat, file });
      if (!saved?.id || !mountedRef.current) return;
      setOwnerDocs((s) => (s[k]?.dataUrl === d.dataUrl ? { ...s, [k]: { ...s[k], vaultDocId: saved.id } } : s));
    } catch {}
  };

  const [feeRow, setFeeRow] = useState(null);
  const [feeStatus, setFeeStatus] = useState('loading');
  const [feeAttempt, setFeeAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFeeStatus('loading');
    getDealFees('rent')
      .then((f) => {
        if (!alive) return;
        setFeeRow(f || null);
        setFeeStatus(f ? 'ready' : 'error');
      })
      .catch(() => {
        if (!alive) return;
        setFeeRow(null);
        setFeeStatus('error');
      });
    return () => { alive = false; };
  }, [feeAttempt]);
  const retryFees = () => setFeeAttempt((n) => n + 1);

  const cost = useMemo(() => {
    const rent = num(terms.rent), dep = num(terms.deposit), nr = num(terms.nrDeposit);
    const months = parseInt(terms.months, 10) || 11;
    const answers = { rent, dep, months, status: feeStatus, retry: retryFees };
    if (feeStatus !== 'ready' || !feeRow) {
      return { ...answers, stamp: null, exactPaise: null, reg: null, dhc: null, service: null, total: null, computed: [], notes: null };
    }
    const years = Math.ceil(months / 12);
    const computed = [];
    let stamp = feeRow.stampDuty, exactPaise = null;
    if (stamp == null) {
      ({ stamp, exactPaise } = leaveLicenceStamp(rentForTerm(rent, months, terms.increment, terms.incrementEvery), nr, dep, years));
      computed.push('stamp');
    }
    let reg = feeRow.registration;
    if (reg == null) { reg = regArea === 'rural' ? 500 : 1000; computed.push('reg'); }
    const dhc = 300;
    const service = feeRow.platformFee;
    const waived = referralCredit ? Math.floor((service * discountPercent) / 100) : 0;
    return {
      ...answers,
      stamp, exactPaise, reg, dhc, service, waived, discountPercent,
      total: service + stamp + reg + dhc - waived,
      computed,
      notes: feeRow.notes || null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retryFees is a stable state increment
  }, [terms.rent, terms.deposit, terms.nrDeposit, terms.months, terms.increment, terms.incrementEvery, regArea, feeStatus, feeRow, referralCredit, discountPercent]);

  const propertyLine = () =>[prop.flatNo, prop.society, prop.locality, prop.city].filter(Boolean).join(', ');
  const invitedLabel = () => 'Invited: ' + (invite.invName || '••••••' + digits(invite.invMobile).slice(-4)) + ' (pending)';
  const tenantNames = () => (tenantMode === 'invite' ? invitedLabel() : tenants.map((t) => t.name.trim()).filter(Boolean).join(', '));
  const buildDetails = () => ({
    property: propertyLine(), ownerName: ownerMode === 'invite' ? invitedLabel() : owner.oName || user?.name || 'Owner', tenants: tenantNames(),
    rent: cost.rent, deposit: cost.dep, nrDeposit: num(terms.nrDeposit), months: terms.months,
    startDate: terms.startDate, regArea: regArea === 'urban' ? 'Municipal / Urban' : 'Rural',
    _state: captureShareableState(),
  });

  const detailsSize = detailsChars(buildDetails());
  const detailsTooLong = detailsSize > DETAILS_MAX_CHARS;
  const detailsWorstField = largestFreeTextField(captureShareableState());

  const inviteRole = inviteCtx?.invite?.toRole || null;
  const inviteAwaitingPayment = inviteCtx?.req?.status === 'awaiting_payment';
  const formSnapshot = () => ({ mode, inviteRole, prop, owner, coOwners, ownerMode, tenantMode, tenants, invite, terms, ownerDocs, tenantDocs });
  const collectDocs = () => collectFormDocs(formSnapshot());

  const addTenant = () => setTenants((arr) => (arr.length < MAX_TENANTS ? [...arr, emptyTenant()] : arr));
  const removeTenant = (i) => {
    if (tenants.length <= 1) return;
    setTenants((arr) => arr.filter((_, idx) => idx !== i));
    setTenantDocs((d) => removeIndexedDocs(d, 't', i));
    setErrors({});
  };
  const addCoOwner = () => {
    if (coOwners.length >= MAX_LICENSORS - 1) return;
    setCoOwners((arr) => [...arr, emptyCoOwner()]);
    setOwner((o) => (o.capacity === 'owner' ? { ...o, capacity: 'co-owner' } : o));
  };
  const removeCoOwner = (i) => {
    setCoOwners((arr) => arr.filter((_, idx) => idx !== i));
    setOwnerDocs((d) => removeIndexedDocs(d, 'c', i));
    if (coOwners.length === 1) setOwner((o) => (o.capacity === 'co-owner' ? { ...o, capacity: 'owner' } : o));
    setErrors({});
  };
  const startBounds = startDateBounds();

  const signInSentRef = useRef(false);
  useEffect(() => {
    const partyId = searchParams.get('party');
    const requestId = searchParams.get('request');
    if (!partyId && !requestId) return;
    if (loading) return;
    if (!isIn || !user?.mobile) {
      setInviteError({ kind: 'signin' });
      if (!signInSentRef.current) sendToSignIn('invite');
      signInSentRef.current = true;
      return;
    }
    setInviteError((e) => (e?.kind === 'signin' ? null : e));
    let alive = true;
    (async () => {
      try {
        const invites = await listMyServiceRequestInvites();
        if (!alive) return;
        const row = (invites || []).find((inv) =>
          partyId && requestId
            ? inv?.id === partyId && inv?.requestId === requestId
            : inv?.id === partyId || inv?.requestId === requestId,
        );
        if (row && row.status === 'declined') {
          if (alive) setInviteError({ kind: 'expired' });
          return;
        }
        const reqId = row?.requestId || requestId;
        if (!reqId) {
          if (alive) setInviteError({ kind: 'expired' });
          return;
        }
        if (row && row.status !== 'accepted') {
          try {
            await decideServiceRequestInvite(row.id, 'accept');
          } catch (err) {
            if (err?.status === 409) {
              if (alive) setInviteError({ kind: 'blocked', detail: err.message || '' });
              return;
            }
          }
        }
        const req = await getServiceRequest(reqId);
        if (!req) {
          if (alive) setInviteError({ kind: 'expired' });
          return;
        }
        if (!alive) return;
        setInviteError(null);
        if (!req.myPartyId && req.status === 'awaiting_payment' && heldCoFill(req)) {
          navigate('/services/rent-agreement', { replace: true, state: { raHold: req.id } });
          return;
        }
        const partyRow = row || (req.parties || []).find((p) => p?.id === partyId);
        const role = partyRow?.role || 'tenant';
        const partyIndex = Number(partyRow?.partyIndex) || 0;
        setInviteCtx({
          invite: {
            inviteId: row?.id || partyId,
            reqId,
            toRole: role,
            partyIndex,
            toName: null,
            toMobile: digits(user.mobile),
          },
          req,
        });
        setMode('invite');
        if (req.details && req.details._state) applyFormState(req.details._state);
        restoreFiledDocs(req);
        loadMaskedIds(reqId);
        const kyc = readSavedKyc(user.mobile) || {};
        if (role === 'tenant') {
          setTenants((arr) => arr.map((item, idx) => (idx === partyIndex
            ? fillBlanks(item || emptyTenant(), { name: user.name || kyc.name, dob: kyc.dob, mobile: digits(user.mobile).slice(-10), age: kyc.age })
            : item)));
        } else {
          setOwner((o) => ({ ...fillBlanks(o, { oName: user.name || kyc.name, oDob: kyc.dob, oAge: kyc.age }), oMobile: digits(user.mobile).slice(-10) }));
        }
        setOwnerMode('fill');
        setTenantMode('fill');
        setStep(0);
      } catch {
        if (alive) setInviteError({ kind: 'expired' });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invite URL should resolve once per signed-in user
  }, [searchParams, isIn, loading, user]);

  const [myInvites, setMyInvites] = useState([]);
  useEffect(() => {
    if (mode === 'invite' || !isIn || !user?.mobile) { setMyInvites([]); return; }
    if (searchParams.get('party')) return;
    let alive = true;
    listMyServiceRequestInvites(REVISIT_READ)
      .then((rows) => {
        if (!alive) return;
        setMyInvites((rows || []).filter((row) => row?.status === 'invited').map((row) => ({
          inviteId: row.id,
          requestId: row.requestId,
          fromName: row.invitedBy,
          property: null,
          href: inviteRouteFor(row),
        })));
      })
      .catch(() => { if (alive) setMyInvites([]); });
    return () => { alive = false; };
  }, [mode, isIn, user, searchParams]);

  const listingPickRef = useRef(0);
  const propRef = useRef(prop);
  const listingRefusedRef = useRef(false);
  useEffect(() => { propRef.current = prop; }, [prop]);
  const applyListing = async (l, { overwrite }) => {
    const id = l.uuid || l.id;
    const seq = ++listingPickRef.current;
    const full = await myListing(id, user).catch(() => null);
    if (!mountedRef.current || seq !== listingPickRef.current) return false;
    const { prop: answers, terms: termAnswers } = listingAnswers(full || l);
    if (!overwrite && namesOtherFlat(propRef.current, answers)) {
      listingRefusedRef.current = true;
      toast(tr('services.ra.listingOtherFlat'), 'info');
      return false;
    }
    setSelectedPropertyId(id || null);
    const { areaUnit, ...rest } = answers;
    const address = { flatNo: '', society: '', societyId: '', locality: '', pincode: '', area: '', floor: '' };
    const set = overwrite ? { ...address, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v)) } : null;
    setProp((cur) => ({
      ...(set ? { ...cur, ...set } : fillBlanks(cur, rest)),
      ...(rest.area && (overwrite || !String(cur.area ?? '').trim()) ? { areaUnit } : {}),
    }));
    setTerms((cur) => fillBlanks(cur, termAnswers));
    ['flatNo', 'society', 'locality', 'pincode', 'area'].forEach(clearErr);
    return true;
  };
  const pickListing = (l) => applyListing(l, { overwrite: true });

  const listingAppliedRef = useRef(null);
  useEffect(() => {
    if (mode === 'invite') return;
    const reissue = searchParams.get('reissue') === '1';
    const listingId = searchParams.get('listing') || searchParams.get('flat');
    if (!listingId || listingAppliedRef.current === listingId) return;
    const l = myProperties.find((row) => row.id === listingId || row.slug === listingId);
    if (!l) return;
    // eslint-disable-next-line
    listingAppliedRef.current = listingId;
    applyListing(l, { overwrite: false }).then((applied) => {
      if (applied && reissue) toast(tr('services.ra.reissueHint'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume listing URL once without overwriting edits
  }, [searchParams, mode, myProperties]);

  const renewHomeId = searchParams.get('renewHome');
  const renewId = searchParams.get('renew') || renewHomeId;
  const renewAppliedRef = useRef(null);
  useEffect(() => {
    if (!renewId || mode === 'invite' || !isIn || renewAppliedRef.current === renewId) return;
    renewAppliedRef.current = renewId;
    (renewHomeId ? rentAgreementHomeRenewal(renewHomeId) : rentAgreementRenewal(renewId)).catch(() => null).then((res) => {
      if (!mountedRef.current) return;
      if (res) {
        if (Object.keys(res.prop).length) setProp((cur) => fillBlanks(cur, res.prop));
        const tenantRows = res.tenants.filter((p) => p.name || digits(p.mobile)).slice(0, MAX_TENANTS);
        if (tenantRows.length) {
          setTenants(tenantRows.map((p) => ({ ...emptyTenant(), name: p.name, mobile: digits(p.mobile).slice(-10) })));
          setTenantMode('fill');
        }
        const ownerMobile = digits(res.owner?.mobile);
        if (ownerMobile.length >= 10 && ownerMobile.slice(-10) !== digits(user?.mobile).slice(-10)) {
          setOwnerMode('invite');
          setInvite((cur) => ({ ...cur, invName: res.owner.name || '', invMobile: ownerMobile.slice(-10) }));
        }
        const start = res.startDate;
        const startDate = start && (start < startBounds.min ? startBounds.min : start > startBounds.max ? startBounds.max : start);
        setTerms((cur) => ({
          ...cur,
          ...(res.rent ? { rent: String(res.rent) } : {}),
          ...(res.deposit ? { deposit: String(res.deposit) } : {}),
          ...(res.months ? { months: String(res.months) } : {}),
          ...(startDate ? { startDate } : {}),
        }));
      }
      toast(tr('services.ra.renewHint', { price: fee('rentAgreementPlatform') }));
      setSearchParams((cur) => {
        const rest = new URLSearchParams(cur);
        rest.delete('renew');
        rest.delete('renewHome');
        return rest;
      }, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume the renewal URL once without overwriting edits
  }, [renewId, mode, isIn]);
  const stepErrors = (s) => formStepErrors(s, {
    ...formSnapshot(), listed: !!selectedPropertyId, selfMobile: mode === 'invite' ? undefined : user?.mobile, held: stillHeld(maskedIds, { owner, coOwners, tenants }),
  });
  const [liveStep, setLiveStep] = useState(null);
  const [errorFocus, setErrorFocus] = useState(0);
  const flagErrors = (s, e) => { setErrors(e); setLiveStep(s); setErrorFocus((n) => n + 1); };
  useEffect(() => {
    if (liveStep === null || liveStep !== step) return;
    setErrors(stepErrors(step));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errors recompute from the listed form slices
  }, [prop, owner, coOwners, ownerMode, tenantMode, tenants, invite, terms, ownerDocs, tenantDocs]);
  useEffect(() => {
    if (!errorFocus) return;
    const el = formRef.current?.querySelector('.step-panel.active .err, .step-panel.active .dz-invalid, .step-panel.active [aria-invalid="true"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const control = el.matches('input, select, textarea, button') ? el : el.querySelector('input, select, textarea, button');
    control?.focus({ preventScroll: true });
  }, [errorFocus]);
  const validateStep = (s) => {
    const e = stepErrors(s);
    if (Object.keys(e).length) { flagErrors(s, e); toast(tr('services.ra.validationRequired'), 'error'); return false; }
    setErrors(e);
    return true;
  };
  const next = () => {
    if (viewOnly) { setStep((s) => Math.min(REVIEW_STEP, s + 1)); scrollTop(); return; }
    if (!validateStep(step)) return;
    if (gated && step >= LAST_PUBLIC_STEP) { gateToSignIn(() => latestStep.current.next()); return; }
    if (detailsTooLong) toast(tr('services.ra.detailsTooLong', { field: tr(detailsWorstField.label), over: detailsSize - DETAILS_MAX_CHARS }), 'error');
    setStep((s) => Math.min(REVIEW_STEP, s + 1));
    scrollTop();
  };
  const prev = () => { setStep((s) => Math.max(0, s - 1)); scrollTop(); };
  const scrollTop = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const copyInviteLink = async () => {
    if (!inviteResult?.link) return;
    try {
      await navigator.clipboard.writeText(inviteResult.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(tr('services.ra.invite.copied'), 'success');
    } catch {
      toast(tr('services.ra.invite.copyFail'), 'error');
    }
  };

  const [withdrawing, setWithdrawing] = useState(false);
  const withdrawInvite = async () => {
    if (withdrawing || !inviteResult?.requestId || !inviteResult?.partyId) return;
    setWithdrawing(true);
    try {
      await withdrawServiceRequestParty(inviteResult.requestId, inviteResult.partyId);
      if (!mountedRef.current) return;
      setInviteResult(null);
      setDone(false);
      setStartNew(false);
      setRequestsNonce((n) => n + 1);
      toast(tr('services.ra.invite.withdrawn'), 'success');
    } catch (err) {
      console.error('Rent Agreement invite withdraw failed', err?.status || err?.message);
      if (mountedRef.current) toast(tr('services.ra.invite.withdrawFailed'), 'error');
    } finally {
      if (mountedRef.current) setWithdrawing(false);
    }
  };

  const releaseFiled = () => {
    const release = (cur) => Object.fromEntries(Object.entries(cur).map(([k, d]) => [k, d?.filedOn ? { fileName: d.fileName, reattach: true } : d]));
    setOwnerDocs(release);
    setTenantDocs(release);
  };

  const uploadDocs = async (requestId, docs) => {
    let ok = true;
    let stale = false;
    for (const d of docs) {
      if (d.file.filedOn) { stale = stale || d.file.filedOn !== requestId; continue; }
      const slot = `${requestId}:${d.key}`;
      const ref = d.file.dataUrl || `vault:${d.file.vaultDocId}`;
      if (uploadedRef.current.get(slot) === ref) continue;
      try {
        // eslint-disable-next-line no-await-in-loop -- uploads must preserve request/doc order
        await (d.file.dataUrl
          ? addServiceRequestDoc(requestId, d.file)
          : addServiceRequestDocFromVault(requestId, { documentId: d.file.vaultDocId, category: d.file.category }));
        uploadedRef.current.set(slot, ref);
      } catch (err) {
        console.error('Rent Agreement document upload failed', err?.status || err?.message);
        ok = false;
      }
    }
    if (stale) { releaseFiled(); return 'reattach'; }
    return ok;
  };

  const handOff = async (requestId, parties, docs) => {
    let identitiesError = null;
    try {
      await recordServiceRequestIdentities(requestId, parties);
    } catch (err) {
      console.error('Rent Agreement identity hand-off failed', err?.status || err?.message);
      identitiesError = err?.status === 422 ? 'services.ra.identitiesDuplicate' : 'services.ra.identitiesRetry';
    }
    const docsOk = await uploadDocs(requestId, docs);
    if (identitiesError) return tr(identitiesError);
    if (docsOk === 'reattach') return tr('services.ra.docsReattach');
    if (!docsOk) return tr('services.ra.docsRetry');
    return null;
  };

  const checkoutFiled = async (requestId) => {
    let checkout;
    try {
      checkout = await openServiceRequestCheckout(requestId, DECLARATION_VERSION);
    } catch (err) {
      console.error('Rent Agreement checkout refused', err?.status);
      return err?.status === 409 && err?.message ? tr('services.ra.checkoutIncomplete', { detail: err.message }) : tr('services.ra.checkoutFailed');
    }
    await payAndConfirm(checkout, cost.total);
    refreshEntitlements();
    return null;
  };

  const finishOwnerRequest = async (requestId, docs) => {
    const handOffFailure = await handOff(requestId, identityParties({ owner, coOwners, tenants }), docs);
    return handOffFailure || checkoutFiled(requestId);
  };

  const shareInvite = (request, role, inviteMobile) => {
    const party = (request?.parties || []).find((p) => p?.role === role && p?.status === 'invited')
      || (request?.parties || [])[0]
      || null;
    const property = propertyLine();
    const invitePath = inviteRouteFor({ id: party?.id, requestId: request?.id });
    const link = new URL(invitePath, window.location.origin).toString();
    const signupLink = new URL(`/signup?next=${encodeURIComponent(invitePath)}`, window.location.origin).toString();
    const inviter = role === 'owner' ? tenants[0]?.name?.trim() || user?.name || 'Your tenant' : owner.oName || user?.name || 'Your owner';
    const text = `Hi${invite.invName ? ' ' + invite.invName : ''}, ${inviter} invited you to complete your rent-agreement details on Draazy${property ? ` for ${property}` : ''}. Please sign in (or create an account) first, then open this invite: ${link}\n\nSign up: ${signupLink}`;
    setInviteResult({
      toName: invite.invName || '',
      toMobile: inviteMobile,
      link,
      waLink: `https://wa.me/91${inviteMobile}?text=${encodeURIComponent(text)}`,
      requestId: request?.id || null,
      partyId: party?.id || null,
      pending: !!party?.pending,
      maskedMobile: party?.mobile || null,
    });
  };

  const settleFiled = () => {
    filedRef.current = null;
    setPendingRequestId(null);
  };

  const requestCancelled = (id) => {
    if (filedRef.current?.request?.id === id) settleFiled();
    setRequestsNonce((n) => n + 1);
  };

  const fileRequest = async (key, create, docs) => {
    const filed = filedRef.current;
    if (filed?.key === key) return filed.request;
    if (filed && docs.some((d) => d.file.filedOn)) {
      releaseFiled();
      if (mountedRef.current) toast(tr('services.ra.docsReattach'), 'error');
      return null;
    }
    if (filed) {
      await cancelServiceRequest(filed.request.id);
      settleFiled();
    }
    const request = await create();
    filedRef.current = { key, request };
    setPendingRequestId(request?.id || null);
    return request;
  };

  const submitOwner = async (details, propertyId, docs) => {
    persistOwnerKYC();
    const invitingRole = ownerMode === 'invite' ? 'owner' : tenantMode === 'invite' ? 'tenant' : null;
    const tenantInvites = tenantMode === 'invite'
      ? tenants.map((row, i) => ({ row, i, mobile: digits(row.mobile) })).filter((row) => row.mobile)
      : [];
    const inviteMobile = invitingRole === 'tenant' ? tenantInvites[0]?.mobile : digits(invite.invMobile);
    const ownParties = invitingRole === 'owner' ? { tenants } : invitingRole === 'tenant' ? { owner, coOwners } : { owner, coOwners, tenants };
    if (editingFiled) {
      const unpaid = editingFiled.status === 'awaiting_payment';
      await updateServiceRequestDetails(editingFiled.id, details);
      const failure = await handOff(editingFiled.id, identityParties(ownParties), docs)
        || (unpaid ? await checkoutFiled(editingFiled.id) : null);
      if (!mountedRef.current) return false;
      if (failure) { toast(failure, 'error'); return false; }
      if (unpaid) { setEditingFiled(null); return true; }
      toast(tr('services.ra.summary.saved'), 'success');
      closeFiled();
      setRequestsNonce((n) => n + 1);
      return false;
    }
    if (topUpRef.current) {
      const request = topUpRef.current;
      if (answersKey() !== topUpBaselineRef.current) {
        toast(tr('services.ra.locked.topUpChanged', { context: invitingRole === 'owner' ? 'owner' : undefined }), 'error');
        return false;
      }
      const failure = await handOff(request.id, identityParties(ownParties), docs);
      if (!mountedRef.current) return false;
      if (failure) { toast(failure, 'error'); return false; }
      topUpRef.current = null;
      topUpBaselineRef.current = null;
      setCoFilledRole(null);
      setMaskedIds({});
      releaseFiled();
      settleFiled();
      clearDraft();
      toast(tr('services.ra.locked.toppedUp'), 'success');
      setStartNew(false);
      setRequestsNonce((n) => n + 1);
      return false;
    }
    if (invitingRole && inviteMobile) {
      const request = await fileRequest(JSON.stringify({ details, propertyId, inviteMobile }),
        () => createCoFillServiceRequest({ request: { type: 'rental', details, propertyId }, role: invitingRole, mobile: inviteMobile }), docs);
      if (!request) return false;
      let invitedRequest = request;
      if (invitingRole === 'tenant') {
        for (const row of tenantInvites.slice(1)) {
          // eslint-disable-next-line no-await-in-loop -- tenant invites chain from the first request
          invitedRequest = await inviteServiceRequestParty(request.id, { role: 'tenant', mobile: row.mobile, partyIndex: row.i });
        }
      }
      const failure = await handOff(request?.id, identityParties(ownParties), docs);
      if (failure) {
        if (mountedRef.current) toast(failure, 'error');
        return false;
      }
      settleFiled();
      shareInvite(invitedRequest, invitingRole, inviteMobile);
      if (invitingRole === 'tenant') {
        const payFailure = await checkoutFiled(request.id);
        if (payFailure && mountedRef.current) toast(payFailure, 'error');
      }
      return true;
    }
    const key = filingKey({ details, propertyId });
    const request = await fileRequest(key,
      () => createServiceRequestLive({ type: 'rental', service: 'Rent Agreement', customer: { name: details.ownerName }, details, propertyId }), docs);
    if (!request) return false;
    const failure = await finishOwnerRequest(request?.id, docs);
    if (failure) {
      if (mountedRef.current) toast(failure, 'error');
      return false;
    }
    settleFiled();
    return true;
  };

  const submitInvitee = async (details) => {
    const requestId = inviteCtx.req.id;
    await submitServiceRequestPartyDetails(requestId, details);
    const partyIndex = Number(inviteCtx.invite?.partyIndex) || 0;
    const identityRows = inviteRole === 'owner'
      ? identityParties({ owner, coOwners })
      : identityParties({ tenants: [tenants[partyIndex] || emptyTenant()] })
        .map((row) => ({ ...row, partyIndex }));
    const docs = inviteRole === 'owner' ? collectDocs() : collectDocs()
      .filter((doc) => doc.category.startsWith(`tenant-${partyIndex}-`));
    const failure = await handOff(requestId, identityRows, docs);
    if (failure) { toast(failure, 'error'); return false; }
    return true;
  };

  const generate = async () => {
    if (submitting || done) return;
    if (loading) return;
    if (!isIn) { gateToSignIn(() => latestStep.current.generate()); return; }
    for (let s = 0; s < REVIEW_STEP; s++) {
      const e = stepErrors(s);
      if (Object.keys(e).length) { setStep(s); flagErrors(s, e); toast(tr('services.ra.validationRequired'), 'error'); return; }
    }
    if (!declare) { toast(tr('services.ra.declarationRequired'), 'error'); return; }
    if (detailsTooLong) {
      setStep(detailsWorstField.step);
      toast(tr('services.ra.detailsTooLong', { field: tr(detailsWorstField.label), over: detailsSize - DETAILS_MAX_CHARS }), 'error');
      scrollTop();
      return;
    }
    const details = buildDetails();
    const propertyReference = listingRefusedRef.current ? null : searchParams.get('listing') || searchParams.get('flat');
    const propertyId = selectedPropertyId
      || myProperties.find((row) => row.id === propertyReference || row.slug === propertyReference)?.uuid
      || undefined;

    setSubmitting(true);
    let finished = false;
    try {
      if (mode === 'owner') finished = await submitOwner(details, propertyId, collectDocs());
      else if (mode === 'invite' && inviteCtx) finished = await submitInvitee(details);
      if (finished && mode === 'owner') clearDraft();
    } catch (err) {
      console.error('Rent Agreement submit failed', err?.status || err?.message);
      if (mountedRef.current) toast(err?.status === 409 && err?.message ? err.message : err?.status === 422 && err?.message ? tr('services.ra.detailsRejected', { detail: err.message }) : tr('services.ra.saveError'), 'error');
      return;
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }

    if (!finished || !mountedRef.current) return;
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseOwnerMode = (m) => {
    setOwnerMode(m);
    setErrors({});
    if (m !== 'invite') return;
    setTenantMode('fill');
    const self = digits(user?.mobile || '').slice(-10);
    if (!self || tenants.some((row) => digits(row.mobile).slice(-10) === self)) return;
    setTenants((arr) => [fillBlanks(arr[0] || emptyTenant(), { name: user?.name, mobile: self }), ...arr.slice(1)]);
  };

  const fc = (k) => 'field w-full px-4 py-3 rounded-xl text-white text-sm' + (errors[k] ? ' err' : '');
  const labelIdentityReminder = (field) => {
    const role = tr(`services.ra.identityReminder.${field.role}`, { n: field.index + 1 });
    return `${role} ${tr(`services.ra.identityReminder.${field.field}`)}`;
  };
  const missingIdentityFields = missingIdentityReminderFields(restoredIdentityFields, captureFormState());
  const identityReminders = {
    owner: missingIdentityFields.filter((field) => field.step === 'owner').map(labelIdentityReminder),
    tenant: missingIdentityFields.filter((field) => field.step === 'tenant').map(labelIdentityReminder),
    review: missingIdentityFields.map(labelIdentityReminder),
  };
  const latestStep = useLatest({ next, generate });
  const editingSubmitted = !!editingFiled || (mode === 'invite' && inviteEditing && !!inviteCtx?.req?.mySideSubmitted);
  const holdingUnpaid = editingFiled?.status === 'awaiting_payment';

  return {
    rootRef, formRef, tr, isIn, user, navigate,
    step, errors, done, openFaq, setOpenFaq,
    mode, inviteError, inviteResult, copied,
    withdrawInvite, withdrawing,
    prop, setP, setProp, selectedPropertyId, setSelectedPropertyId, myProperties, pickListing,
    owner, setO, coOwners, setCoOwner, addCoOwner, removeCoOwner, ownerDocs, setOwnerDocs, vaultEnabled, saveOwnerDocToVault,
    ownerMode, chooseOwnerMode, inviteRole, inviteAwaitingPayment,
    tenantMode, setTenantMode, tenants, setTenant, addTenant, removeTenant, tenantDocs, setTenantDocs, invite, setInvite,
    terms, setT, startBounds, maint, setMaint, regArea, furnItems, custom, setCustom, clauses, setClauses,
    isChecked, toggleFurn, bumpQty, removeFurn, addCustom, furnitureText,
    declare, setDeclare, generate, submitting, pendingRequestId, paymentPending, paymentConfirming,
    clearErr, fc, cost, locked, joinedOnly, gated, startNewAgreement, restored, startFresh, myInvites,
    identityReminders,
    stalledInvite, recoverInvite, recovering, payable, payables, payFiled, paying, continuable, continueFiled, coFilledRole, maskedIds: stillHeld(maskedIds, { owner, coOwners, tenants }),
    continuableHeld: heldCoFill(continuable),
    requestCancelled,
    viewOnly, viewedRequest, viewSubmitted, canView, editSubmitted, discardEdits, closeFiled, editingSubmitted, holdingUnpaid,
    detailsSize, detailsMax: DETAILS_MAX_CHARS, detailsTooLong, detailsWorstField,
    copyInviteLink, next, prev, signInToInvite: () => sendToSignIn('invite'),
  };
}
