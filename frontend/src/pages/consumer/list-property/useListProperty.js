import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext.jsx';
import { useFormDraft } from '../../../lib/hooks';
import { parseAmount } from '../../../lib/format';
import { myListing, checkOwnDuplicate, confirmOwnerListing } from '../../../services/propertyService.js';
import { getOwnerListingState } from '../../../components/listing/ListingStatusCard.jsx';
import { ADDRESS_PARTS, hasStoredAddress } from '../../../lib/listingFormDetails.js';
import { createRoom, updateRoom } from '../../../services/flatmateService.js';
import { canSplitIntoRooms } from '../../../lib/data/flatSplit.js';
import { loadWizardQuota } from '../../../lib/data/listingQuota.js';
import { formatMoneyInput } from './format.js';
import { toMoney, roundMoney } from './sanitize.js';
import { haptic } from '../../../lib/haptics.js';
import { SESSION_ENDED_EVENT } from '../../../services/http.js';
import {
  isResidentialType, isLandType, isCommercialType, isHouseType, COMMERCIAL_SPEC_KEYS,
  leaseKindOf, LEASE_DEFAULTS, defaultAreaUnitFor, FLOOR_PLAN_CATEGORY, photoCategoriesFor,
  homeTypeLabelFor, withInFlatAsFurniture,
} from './constants.js';
import { initialForm } from './initialForm.js';
import { classifyChanges } from './editPolicy.js';
import { scrollToError, validateStep1, validateLocationStep, validatePricingStep, validateStep3, validateFlatmateRoom, validateFlatmateLocation, validateFlatmatePricing } from './validation.js';
import { triggerConfetti } from './confetti.js';
import { listingLabels, persistListing, roomHeadline } from './submit.js';
import { headlineOf } from '../../../lib/headline.js';
import { hasAgreementEvidence, numeric, terms } from '../flatmates/helpers.js';
import { computeProgress } from './progress.js';
import useListingMedia from './useListingMedia';
import useListingLocation from './useListingLocation';
import useRoomEdit, { useHomePrefill } from './useRoomEdit';
import { LISTING_STEPS } from './StepNav.jsx';
import { track } from '../../../lib/pmf.js';
import { DRAFT_OWNER_KEY, adoptSharedDraft, draftKeyFor } from './draftSlots.js';

const LIST_PROPERTY_DRAFT_PREFIX = 'dzDraft:list-property';
const LEGACY_LIST_PROPERTY_DRAFT_KEY = `${LIST_PROPERTY_DRAFT_PREFIX}:v2`;
const DRAFT_STEP_KEY = '__currentStep';
const DRAFT_PHOTOS_KEY = '__photos';
const DRAFT_RENT_MODE_KEY = '__rentMode';
const dealPreset = (searchParams, flatmateMode, editId) => {
  if (editId) return '';
  const deal = searchParams.get('deal');
  if (deal === 'buy' || deal === 'rent') return deal;
  return flatmateMode ? 'rent' : '';
};
const initialForEntry = (searchParams, flatmateMode, editId) => ({
  ...initialForm,
  deal: dealPreset(searchParams, flatmateMode, editId),
});
const bathroomsForBhk = (bhk) => {
  const n = Number(bhk);
  if (!Number.isFinite(n) || n <= 1) return '1';
  if (n === 2) return '2';
  return String(Math.min(4, n - 1));
};

const parseStep = (value) => {
  const named = { details: 1, location: 2, pricing: 3, photos: 4 }[String(value || '')];
  const numeric = Number.parseInt(value, 10);
  return named || (Number.isFinite(numeric) && numeric > 0 ? numeric : 1);
};

const durablePhotos = (value) => (Array.isArray(value) ? value : [])
  .map((photo) => {
    const url = typeof photo === 'string' ? photo : photo?.url;
    if (typeof url !== 'string' || !url || /^(data|blob):/i.test(url)) return null;
    return {
      url,
      category: photo?.category || 'Other',
      ...(photo?.photoHash ? { photoHash: photo.photoHash } : {}),
    };
  })
  .filter(Boolean);
const ownerDraftId = (user) => String(user?.id || user?.uuid || user?.mobile || '').trim();
const autoPlotArea = (form, field, value) => {
  if (form.propertyType === 'farmland' || form.areaUnit !== 'sqft') return '';
  const current = String(form.carpetArea || '').trim();
  const prevProduct = Number(form.plotLength) * Number(form.plotWidth);
  if (current && !(prevProduct > 0 && current === String(Math.round(prevProduct)))) return '';
  const length = Number(field === 'plotLength' ? value : form.plotLength);
  const width = Number(field === 'plotWidth' ? value : form.plotWidth);
  return length > 0 && width > 0 ? String(Math.round(length * width)) : '';
};

export default function useListProperty() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const flatmateMode = searchParams.get('flatmate') === '1';
  const editRoomId = flatmateMode && !editId ? searchParams.get('editRoom') : null;
  const homeId = !flatmateMode && !editId ? searchParams.get('home') : null;
  const rawStepParam = searchParams.get('step');
  const entryStep = parseStep(rawStepParam);
  const editEntryStep = useRef(entryStep);

  const [currentStep, setCurrentStep] = useState(1);
  const [rentMode, setRentMode] = useState(() => (flatmateMode && !editId ? 'flatmate' : 'whole'));
  const [showSuccess, setShowSuccess] = useState(false);
  const [postedListing, setPostedListing] = useState(null);
  const [postedRoom, setPostedRoom] = useState(null);
  const [savedListingStatus, setSavedListingStatus] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [errors, setErrors] = useState({});

  const [editApproved, setEditApproved] = useState(false);
  const [showIdentityGuard, setShowIdentityGuard] = useState(false);
  const [showDupGuard, setShowDupGuard] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  // Prevent another submit while the network write is pending.
  const [posting, setPosting] = useState(false);
  const [dupExistingId, setDupExistingId] = useState('');
  const [dupPending, setDupPending] = useState(false);
  const dupSeq = useRef(0);
  const stepRef = useRef(1);
  const [quota, setQuota] = useState({ used: 0, allowance: null });
  const [passListingId, setPassListingId] = useState('');
  useEffect(() => {
    if (editId || editRoomId || authLoading) return undefined;
    if (!user) {
      setQuota({ used: 0, allowance: null });
      return undefined;
    }
    let live = true;
    loadWizardQuota().then((q) => {
      if (!live) return;
      setQuota(q);
    });
    return () => { live = false; };
  }, [editId, editRoomId, authLoading, user]);

  const [form, setForm] = useState(() => initialForEntry(searchParams, flatmateMode, editId));
  const entryForm = useRef(form);
  // Async geocodes must read the latest form rather than an older render closure.
  const formRef = useRef(form);
  const skipLeaveGuard = useRef(false);
  const pendingLeave = useRef(null);
  const latestWizardUrl = useRef('/list-property');
  useEffect(() => { formRef.current = form; }, [form]);

  const ownerMobile = user?.mobile || '';
  const media = useListingMedia({ setErrors });
  const { photos, setPhotos, restorePhotos } = media;
  const ownerId = ownerDraftId(user);
  const previousOwnerId = useRef(ownerId);
  const expiredOwnerId = useRef('');
  const draftable = !editId && !editRoomId && !homeId;
  // Runs before the draft hook's first restore, so a draft left in the shared slot by this owner is found.
  const [draftOwner, setDraftOwner] = useState(() => { if (draftable) adoptSharedDraft(ownerId); return ownerId; });
  const keepWorkOnRestore = useRef(false);
  const signedIn = !!ownerId;
  const draftEnabled = draftable && !authLoading;
  const writeStepParam = useCallback((step, { replace = false, pushedFrom } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (step > 1) next.set('step', String(step));
      else next.delete('step');
      return next;
    }, { replace, state: pushedFrom ? { lpPushedFrom: pushedFrom } : undefined });
  }, [setSearchParams]);

  const setLocationForm = useCallback((update, { explicit = false } = {}) => setForm((previous) => {
    const next = typeof update === 'function' ? update(previous) : update;
    return !explicit && hasStoredAddress(previous)
      ? { ...next, ...Object.fromEntries(ADDRESS_PARTS.map((key) => [key, previous[key]])), societyId: previous.societyId }
      : next;
  }), []);
  const location = useListingLocation({ setForm: setLocationForm, formRef, errors, setErrors });
  const { set } = location;
  const locationSet = !!form.pinPlaced;
  const setField = (field, value) => {
    if (hasStoredAddress(form) && (ADDRESS_PARTS.includes(field) || field === 'societyId')) {
      setForm((previous) => ({ ...previous, [field]: value }));
    }
    if (field === 'plotLength' || field === 'plotWidth') {
      const filledArea = autoPlotArea(form, field, value);
      setForm((previous) => ({ ...previous, [field]: value, ...(filledArea ? { carpetArea: filledArea } : {}) }));
      if (errors[field] || (filledArea && errors.carpetArea)) {
        setErrors((previous) => {
          const next = { ...previous };
          delete next[field];
          if (filledArea) delete next.carpetArea;
          return next;
        });
      }
      return;
    }
    if (field === 'bhk') {
      setForm((previous) => ({
        ...previous,
        bhk: value,
        bathrooms: previous.bathrooms || bathroomsForBhk(value),
      }));
      if (errors.bhk || errors.bathrooms) {
        setErrors((previous) => {
          const next = { ...previous };
          delete next.bhk;
          if (value) delete next.bathrooms;
          return next;
        });
      }
      return;
    }
    if (field === 'totalFloors' && errors.floor === 'aboveTotal') setErrors(({ floor: _floor, ...rest }) => rest);
    set(field, value);
  };

  const restoreDraft = useCallback((update) => setForm((previous) => {
    const restored = withInFlatAsFurniture(typeof update === 'function' ? update(previous) : update);
    const legacyView = restored.facing === 'Park Facing' ? 'Garden'
      : restored.facing === 'Road Facing' ? 'Main Road' : null;
    return legacyView ? { ...restored, facing: '', overlooking: restored.overlooking || legacyView } : restored;
  }), []);
  const restoreDraftExtras = useCallback((saved) => {
    if (keepWorkOnRestore.current) {
      keepWorkOnRestore.current = false;
      return null;
    }
    const savedFields = { ...saved };
    delete savedFields.__documents;
    const {
      [DRAFT_STEP_KEY]: savedStep, [DRAFT_PHOTOS_KEY]: savedPhotos, [DRAFT_OWNER_KEY]: savedOwner,
      [DRAFT_RENT_MODE_KEY]: savedRentMode, ...fields
    } = savedFields;
    if (savedOwner && savedOwner !== ownerId) return null;
    const restoredPhotos = durablePhotos(savedPhotos);
    if (restoredPhotos.length) restorePhotos(restoredPhotos);
    const roomDraft = !editId && (flatmateMode || savedRentMode === 'flatmate');
    if (roomDraft) setRentMode('flatmate');
    const step = Math.min(parseStep(savedStep), LISTING_STEPS.length);
    if (step > 1) writeStepParam(step, { replace: true });
    // `?flatmate=1` hides the Sale/Rent picker, so a restored sale draft
    // must not strand the user outside the room flow.
    const roomFields = roomDraft ? { ...fields, deal: 'rent' } : fields;
    return roomFields.locality && !roomFields.localitySlug ? { ...roomFields, locality: '', localitySlug: '' } : roomFields;
  }, [editId, flatmateMode, ownerId, restorePhotos, writeStepParam]);
  const draftForm = useMemo(() => ({
    ...form,
    [DRAFT_STEP_KEY]: currentStep,
    [DRAFT_PHOTOS_KEY]: durablePhotos(photos),
    [DRAFT_OWNER_KEY]: draftOwner,
    [DRAFT_RENT_MODE_KEY]: rentMode,
  }), [currentStep, draftOwner, form, photos, rentMode]);
  useEffect(() => {
    if (editId) return;
    try { localStorage.removeItem(LEGACY_LIST_PROPERTY_DRAFT_KEY); } catch {}
  }, [editId]);
  const { clear: clearFormDraft, flush: flushFormDraft, startFresh } = useFormDraft(draftKeyFor(draftOwner), draftForm, restoreDraft, {
    enabled: draftEnabled,
    omit: ['agreementDeclared', 'agreementDoc', 'hostRole', 'ownerConsentMobile', 'ownerConsent', 'attachedPropertyId'],
    onRestore: restoreDraftExtras,
  });
  useEffect(() => {
    const onEnded = () => { expiredOwnerId.current = previousOwnerId.current; };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);
  useLayoutEffect(() => {
    const previous = previousOwnerId.current;
    if (previous === ownerId) return;
    previousOwnerId.current = ownerId;
    const expired = expiredOwnerId.current;
    if (ownerId) expiredOwnerId.current = '';
    /* An expired session keeps the listing for the same owner signing back in. */
    if (expired && (!ownerId || ownerId === expired)) return;
    if (!previous && !expired) {
      const working = form !== entryForm.current || photos.length > 0;
      if (draftable) adoptSharedDraft(ownerId, { guestWork: working });
      keepWorkOnRestore.current = working;
      setDraftOwner(ownerId);
      return;
    }
    flushFormDraft();
    keepWorkOnRestore.current = false;
    setDraftOwner(ownerId);
    dupSeq.current += 1;
    media.resetMedia();
    const fresh = initialForEntry(searchParams, flatmateMode, editId);
    setForm(fresh);
    formRef.current = fresh;
    entryForm.current = fresh;
    setCurrentStep(1);
    setRentMode(flatmateMode && !editId ? 'flatmate' : 'whole');
    setShowSuccess(false);
    setPostedListing(null);
    setPostedRoom(null);
    setPassListingId('');
    setSavedListingStatus('');
    setShowResetConfirm(false);
    setErrors({});
    setShowIdentityGuard(false);
    setShowDupGuard(false);
    setShowLeaveConfirm(false);
    setAuthPromptOpen(false);
    setPosting(false);
    setDupExistingId('');
    setDupPending(false);
    setQuota({ used: 0, allowance: null });
    writeStepParam(1, { replace: true });
  }, [draftable, editId, flatmateMode, flushFormDraft, form, media, ownerId, photos.length, writeStepParam]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  useEffect(() => { if (draftEnabled) setDraftHydrated(true); }, [draftEnabled]);
  const requestAuthPrompt = useCallback(() => {
    flushFormDraft();
    setAuthPromptOpen(true);
  }, [flushFormDraft]);
  const closeAuthPrompt = useCallback(() => setAuthPromptOpen(false), []);
  const handlePhotoUpload = useCallback((event) => {
    if (!signedIn) {
      event.target.value = '';
      requestAuthPrompt();
      return;
    }
    void media.handlePhotoUpload(event);
  }, [media, requestAuthPrompt, signedIn]);

  const isFlatmateMode = !editId && form.deal === 'rent' && rentMode === 'flatmate';

  const progressState = useMemo(
    () => computeProgress({ form, photos, isFlatmateMode }),
    [form, photos, isFlatmateMode],
  );

  useEffect(() => {
    // Entry intent wins over a draft, but never over an existing listing. The home type is reset
    // with the property type because they are one answer.
    if (flatmateMode && !editId) {
      setForm((f) => ({ ...f, deal: 'rent', propertyType: 'flat', homeTypeLabel: homeTypeLabelFor('flat'), hostRole: 'tenant' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flatmate mode.
  }, []);

  // Readiness belongs to a listing AND owner, never merely to the last completed request.
  const [editListing, setEditListing] = useState(null);
  const [editLoad, setEditLoad] = useState(null);
  const [editAttempt, setEditAttempt] = useState(0);
  const editKey = JSON.stringify([editId, ownerId, ownerMobile]);
  const editRequest = useRef(null);
  const roomEdit = useRoomEdit({ roomId: editRoomId, canLoad: !authLoading, setForm, setPhotos });
  useHomePrefill({ homeId, canLoad: !authLoading && signedIn, setForm });
  const roomBaseline = editRoomId ? roomEdit.baseline : undefined;
  // A room PATCH leaves the binding alone unless it changed, so a room on an archived society can still be saved.
  const roomSocietyField = !editRoomId ? { societyId: form.societyId || '' }
    : form.societyId === (roomBaseline?.societyId || '') ? {}
      : form.societyId ? { societyId: form.societyId } : { clearSociety: true };
  const editReady = (!editId || (!authLoading && !!ownerMobile && editLoad?.key === editKey
    && editLoad.status === 'ready' && !!editListing)) && (!editRoomId || roomEdit.status === 'ready');
  const editLoadError = (!!editId && !authLoading && (!ownerMobile
    || (editLoad?.key === editKey && editLoad.status === 'error'))) || (!!editRoomId && roomEdit.status === 'error');
  const editLoading = (!!editId || !!editRoomId) && !editReady && !editLoadError;
  const leaveGuardActive = useMemo(() => {
    if (showSuccess || skipLeaveGuard.current) return false;
    const baseline = editRoomId ? roomEdit.baseline || initialForm
      : editId && editListing?.form ? editListing.form : initialForm;
    const savedPhotoUrls = editRoomId ? roomEdit.photoUrls
      : editId ? (editListing?.images || editListing?.gallery || []).filter(Boolean) : [];
    const photoUrls = durablePhotos(photos).map((photo) => photo.url);
    const formDirty = JSON.stringify(form) !== JSON.stringify(baseline);
    const photosDirty = editId || editRoomId
      ? JSON.stringify(photoUrls) !== JSON.stringify(savedPhotoUrls)
      : photoUrls.length > 0;
    return posting || media.isMediaBusy || formDirty || photosDirty;
  }, [editId, editRoomId, editListing, form, media.isMediaBusy, photos, posting, roomEdit.baseline, roomEdit.photoUrls, showSuccess]);
  useEffect(() => {
    latestWizardUrl.current = `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash || ''}`;
  }, [routerLocation.hash, routerLocation.pathname, routerLocation.search]);
  const requestLeave = useCallback((target) => {
    pendingLeave.current = target;
    setShowLeaveConfirm(true);
  }, []);
  useEffect(() => {
    if (!leaveGuardActive) return undefined;
    const beforeUnload = (event) => {
      if (skipLeaveGuard.current) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [leaveGuardActive]);
  useEffect(() => {
    if (!leaveGuardActive) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      let url;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname.toLowerCase().startsWith('/list-property')) return;
      event.preventDefault();
      event.stopPropagation();
      requestLeave({ to: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [leaveGuardActive, requestLeave]);
  useEffect(() => {
    if (!leaveGuardActive) return undefined;
    const onPopState = () => {
      const url = new URL(window.location.href);
      if (url.pathname.toLowerCase().startsWith('/list-property')) return;
      const target = `${url.pathname}${url.search}${url.hash}`;
      const restore = latestWizardUrl.current || '/list-property';
      window.history.pushState({ lpLeaveGuard: true }, '', restore);
      navigate(restore, { replace: true });
      requestLeave({ to: target });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [leaveGuardActive, navigate, requestLeave]);
  const retryEditLoad = () => {
    if (editRoomId) { roomEdit.retry(); return; }
    editRequest.current = null;
    setEditLoad(null);
    setEditAttempt((attempt) => attempt + 1);
  };
  useEffect(() => {
    if (!editId) return undefined;
    const request = {};
    editRequest.current = request;
    setEditListing(null);
    setEditLoad(null);
    setForm(initialForEntry(searchParams, flatmateMode, editId));
    setPhotos([]);
    setEditApproved(false);
    setCurrentStep(editEntryStep.current);
    setErrors({});
    setShowSuccess(false);
    setSavedListingStatus('');
    setShowResetConfirm(false);
    setShowIdentityGuard(false);
    setShowDupGuard(false);
    const load = async () => {
      try {
        const listing = await myListing(editId, { id: ownerId, mobile: ownerMobile });
        if (editRequest.current !== request) return;
        if (!listing?.form) throw new Error('Listing unavailable');
        const placed = [listing.form.propLat, listing.form.propLng].every((value) => (typeof value === 'number'
          || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)));
        const loaded = withInFlatAsFurniture({
          ...initialForm,
          ...listing.form,
          /* Listings posted against the old boolean carry `naSanctioned`; without this the owner opens the edit on an
             unanswered picker and re-saving would erase their own answer. */
          naStatus: listing.form.naStatus || (listing.form.naSanctioned ? 'sanctioned' : ''),
          pinPlaced: placed,
          ...(placed ? {} : { propLat: initialForm.propLat, propLng: initialForm.propLng }),
        });
        const generated = listingLabels(loaded).title;
        const legacyGenerated = String(loaded.bhk) === '4' ? generated.replace(/^4 BHK /, '4+ BHK ') : generated;
        const snapshot = [generated, legacyGenerated].includes(loaded.title) ? { ...loaded, title: '' } : loaded;
        const imgs = (listing.images || listing.gallery || []).filter(Boolean);
        setForm(snapshot);
        setEditListing({ ...listing, form: snapshot });
        /* Categories are not stored, so photos come back as 'Other' — except the tagged plan, which `submit.js`
           reads: without restoring it, any save at all would withdraw the owner's floor plan unasked. */
        setPhotos(imgs.map((url) => ({
          url,
          category: url === listing.floorPlan ? FLOOR_PLAN_CATEGORY : 'Other',
        })));
        setEditApproved(/approved|verified|live/i.test(String(listing.status || '')));
        setEditLoad({ key: editKey, status: 'ready' });
      } catch {
        if (editRequest.current === request) setEditLoad({ key: editKey, status: 'error' });
      }
    };
    if (!authLoading && ownerMobile) void load();
    return () => { editRequest.current = null; };
  }, [editId, ownerId, ownerMobile, editKey, authLoading, editAttempt, setPhotos]);

  const editChanges = useMemo(() => {
    if (!editId || !editReady || !editListing) return null;
    return classifyChanges(editListing.form, form,
      (editListing.images || editListing.gallery || []).filter(Boolean), photos.map((p) => p.url).filter(Boolean));
  }, [editId, editReady, editListing, form, photos]);
  // A staff-posted draft is held to the new-listing bar: the desk asks far less than the owner wizard.
  const claimMode = !!editListing && getOwnerListingState(editListing) === 'confirm';
  const baseline = claimMode ? null : editListing;

  useEffect(() => {
    if (showSuccess) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [showSuccess]);

  const toggleInArray = useCallback((field, value) => {
    setForm((prev) => {
      const arr = prev[field] || [];
      return { ...prev, [field]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  }, []);

  const toggleTenant = useCallback((value) => {
    setForm((prev) => {
      let arr = prev.preferredTenants || [];
      if (value === 'anyone') return { ...prev, preferredTenants: arr.includes('anyone') ? [] : ['anyone'] };
      arr = arr.filter((x) => x !== 'anyone');
      if (value === 'bachelors') arr = arr.filter((x) => x !== 'bachelor-male' && x !== 'bachelor-female');
      if (value === 'bachelor-male' || value === 'bachelor-female') arr = arr.filter((x) => x !== 'bachelors');
      arr = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, preferredTenants: arr };
    });
  }, []);

  // Prevent another property's type-specific answers from silently being saved.
  const TYPE_SPECIFIC_KEYS = [
    'commercialType',
    'washrooms', 'shellType', 'parkingSpaces', 'powerBackup', 'pantry', 'camCharges', 'suitableFor', 'fixtures',
    'fitOutMonths', 'escalationPct', 'tenancyStatus', 'inPlaceRent', 'leaseExpiry',
    ...COMMERCIAL_SPEC_KEYS,
    'areaUnit', 'plotLength', 'plotWidth', 'openSides', 'roadWidth', 'cornerPlot', 'boundaryWall',
    'plotZone', 'plottedProject', 'naStatus', 'waterSource', 'electricity', 'roadAccess', 'otherRights', 'buyerEligibility',
    'plotArea', 'floorsInHouse', 'furniture', 'monthlyRent',
    // Commercial never asks for it, so a residential answer left behind would publish unseen.
    'age',
  ];
  const changePropertyType = useCallback((v) => {
    setForm((prev) => {
      const next = { ...prev, propertyType: v };
      TYPE_SPECIFIC_KEYS.forEach((k) => { next[k] = initialForm[k]; });
      /* Not a TYPE_SPECIFIC_KEY, because those reset to `initialForm` and every type would come
       * back "Flat". */
      next.homeTypeLabel = homeTypeLabelFor(v) || prev.homeTypeLabel;
      next.areaUnit = defaultAreaUnitFor(v);
      const kind = leaseKindOf(v);
      if (leaseKindOf(prev.propertyType) !== kind) Object.assign(next, LEASE_DEFAULTS[kind]);
      /* The land form renders neither control, and the stale possession is worse than cosmetic: an "under
         construction" left behind is what the validator's land exclusion exists to survive. */
      return isLandType(v) ? { ...next, overlooking: '', construction: '' } : next;
    });
    if (!photoCategoriesFor(v, '').includes(FLOOR_PLAN_CATEGORY)) {
      setPhotos((prev) => prev.map((p) => (
        p.category === FLOOR_PLAN_CATEGORY ? { ...p, category: 'Other' } : p
      )));
    }
    if (!isResidentialType(v)) setRentMode('whole');
    setErrors((prev) => {
      const n = { ...prev };
      ['propertyType', 'commercialType', 'monthlyRent', 'plotArea', 'washrooms', 'shellType'].forEach((k) => delete n[k]);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- type changes.
  }, [form.deal]);

  /* The subtype picks a use-profile, which decides which fixtures, amenities, specs and photo categories exist at all
     — Office to Warehouse otherwise keeps a Server Room the warehouse form cannot unpick. */
  const changeCommercialType = useCallback((v) => {
    setForm((prev) => ({
      ...prev,
      commercialType: v,
      fixtures: [],
      suitableFor: [],
      amenities: [],
      pantry: false,
      ...Object.fromEntries(COMMERCIAL_SPEC_KEYS.map((k) => [k, initialForm[k]])),
    }));
    /* Floor Plan is exempt: it carries a claim, and dropping it would quietly unpublish the
     * plan. */
    setPhotos((prev) => prev.map((p) => (
      p.category && p.category !== FLOOR_PLAN_CATEGORY ? { ...p, category: 'Other' } : p
    )));
    setErrors((prev) => {
      const n = { ...prev };
      delete n.commercialType;
      COMMERCIAL_SPEC_KEYS.forEach((k) => delete n[k]);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset follows current selectors only.
  }, [form.deal, form.propertyType]);

  const isResidential = () => isResidentialType(form.propertyType);
  const isLand = () => isLandType(form.propertyType);
  const isCommercial = () => isCommercialType(form.propertyType);
  const isHouse = () => isHouseType(form.propertyType);

  const money = (field) => ({
    value: formatMoneyInput(form[field]),
    onChange: (e) => set(field, toMoney(e.target.value)),
    onBlur: (e) => set(field, roundMoney(toMoney(e.target.value))),
  });
  const setDepositMonths = (months) => {
    const rent = parseAmount(form.monthlyRent);
    if (rent > 0) set('deposit', String(rent * months));
  };

  const lastStep = LISTING_STEPS.length;
  const maxReachableStep = useCallback(() => {
    const original = baseline?.form;
    if (isFlatmateMode) {
      if (Object.keys(validateFlatmateRoom(form, roomBaseline)).length) return 1;
      const locationErrors = validateFlatmateLocation(form, roomBaseline);
      if (!editId && !locationSet && !editListing) locationErrors.location = true;
      if (Object.keys(locationErrors).length) return 2;
      return Object.keys(validateFlatmatePricing(form, roomBaseline)).length ? 3 : lastStep;
    }
    if (Object.keys(validateStep1(form, original)).length) return 1;
    const locationErrors = validateLocationStep(form, original);
    if (!editId && !locationSet && !editListing) locationErrors.location = true;
    if (Object.keys(locationErrors).length) return 2;
    return Object.keys(validatePricingStep(form, original)).length ? 3 : lastStep;
  }, [baseline, editId, editListing, form, isFlatmateMode, lastStep, locationSet, roomBaseline]);
  const goToStep = useCallback((step, { replace = false } = {}) => {
    if (!editReady) return;
    dupSeq.current += 1;
    const next = Math.max(1, Math.min(Number(step) || 1, maxReachableStep(), lastStep));
    setCurrentStep(next);
    writeStepParam(next, { replace, pushedFrom: replace ? undefined : currentStep });
  }, [currentStep, editReady, lastStep, maxReachableStep, writeStepParam]);
  useEffect(() => {
    if (!editReady || (draftEnabled && !draftHydrated)) return;
    const requested = Math.min(entryStep, lastStep);
    const clamped = Math.min(requested, maxReachableStep());
    setCurrentStep(clamped);
    if (requested !== clamped || (clamped === 1 && rawStepParam)) writeStepParam(clamped, { replace: true });
  }, [draftEnabled, draftHydrated, editReady, entryStep, lastStep, maxReachableStep, rawStepParam, writeStepParam]);
  // After the swap, not before: on phones a smooth scroll started over the old step is cut short
  // as the page height changes.
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [currentStep]);
  // Back between steps is a history pop; the browser would restore the old step's footer position
  // over the scroll above.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => { stepRef.current = currentStep; }, [currentStep]);
  useEffect(() => () => { dupSeq.current += 1; }, []);
  const nextStep = () => {
    if (!editReady) return;
    const err = isFlatmateMode
      ? (currentStep === 1 ? validateFlatmateRoom(form, roomBaseline)
        : currentStep === 2 ? validateFlatmateLocation(form, roomBaseline)
          : currentStep === 3 ? validateFlatmatePricing(form, roomBaseline) : {})
      : (currentStep === 1 ? validateStep1(form, baseline?.form)
        : currentStep === 2 ? validateLocationStep(form, baseline?.form)
          : currentStep === 3 ? validatePricingStep(form, baseline?.form) : {});
    /* An edit is exempt: a listing published before the pin existed would otherwise be barred
     * from its own price correction. */
    if (currentStep === 2 && !locationSet && !editListing) err.location = true;
    if (Object.keys(err).length) { setErrors(err); scrollToError(err); return; }
    setErrors({});
    const advance = () => {
      if (currentStep < lastStep) {
        goToStep(currentStep + 1);
        // A validation failure must not produce the successful-advance haptic.
        haptic('step');
      }
    };
    // Sign in before the media step, which is the last one in both flows.
    if (currentStep === lastStep - 1 && !signedIn) {
      setCurrentStep(lastStep);
      writeStepParam(lastStep, { replace: false, pushedFrom: currentStep });
      requestAuthPrompt();
      return;
    }
    if (currentStep === 2 && !editId && !isFlatmateMode && signedIn) {
      if (dupPending) return;
      const seq = ++dupSeq.current;
      const stillHere = () => seq === dupSeq.current && stepRef.current === 2;
      setDupPending(true);
      checkOwnDuplicate({ fields: form })
        .then((mine) => {
          if (!stillHere()) return;
          if (!mine.found) { advance(); return; }
          setDupExistingId(mine.existingId || '');
          setShowDupGuard(true);
        }, (error) => {
          if (!stillHere()) return;
          if (error?.status === 401) requestAuthPrompt(); else advance();
        })
        .catch(() => {})
        .finally(() => setDupPending(false));
      return;
    }
    advance();
  };
  const prevStep = () => {
    if (!editReady || currentStep <= 1) return;
    dupSeq.current += 1;
    if (routerLocation.state?.lpPushedFrom === currentStep - 1) navigate(-1);
    else goToStep(currentStep - 1, { replace: true });
  };

  // Resetting an edit restores the server snapshot without touching a separate new-post draft.
  const openResetConfirm = () => { if (editReady) setShowResetConfirm(true); };
  const confirmReset = () => {
    if (!editReady || posting) return;
    skipLeaveGuard.current = true;
    if (editId || editRoomId) window.location.reload();
    else startFresh();
  };

  const finalizeListing = async () => {
    // Never PATCH unhydrated defaults over the owner's saved listing.
    if (!editReady) {
      toast(t('listProperty.editLoadFailed', 'We could not load that listing. Reload the page and try again.'), 'error');
      return;
    }
    const request = editRequest.current;
    const res = await persistListing({ form, user, editId, editListing, photos, homeId });
    if (editId && request !== editRequest.current) return;
    // Same owner already has this exact property live → stop and point them to it.
    if (res && res.ok === false && res.blocked) {
      setDupExistingId(res.existingId || '');
      setShowDupGuard(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (res && res.ok === false) {
      if (res.unauthenticated) { requestAuthPrompt(); return; }
      if (res.fieldErrors && Object.keys(res.fieldErrors).length) {
        const fieldErrors = res.fieldErrors;
        const step = Math.max(1, Math.min(res.fieldErrorStep || currentStep, lastStep));
        setCurrentStep(step);
        writeStepParam(step, { replace: true });
        setErrors((previous) => ({ ...previous, ...fieldErrors }));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const hasTarget = Object.keys(fieldErrors).some((key) => document.querySelector(`[data-err="${key}"]`));
          if (hasTarget) scrollToError(fieldErrors);
          else toast(res.error || 'Some listing details need attention.', 'error');
        }));
        if (res.unknownFields?.length) toast(res.error || 'Some listing details need attention.', 'error');
        return;
      }
      toast(res.error || 'Could not save your listing. Please try again.', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (claimMode) {
      try {
        await confirmOwnerListing(editId);
      } catch (error) {
        toast(error?.body?.message || error?.message || t('listProperty.claim.confirmFailed'), 'error');
        return;
      }
      skipLeaveGuard.current = true;
      toast(t('listProperty.claim.confirmed'), 'success');
      navigate('/dashboard#listings');
      return;
    }
    if (!editId) clearFormDraft();
    if (!editId) track('listing_submitted', { deal: res?.listing?.deal, type: res?.listing?.type });
    // Refresh owner eligibility and quota after consuming a new-post allowance.
    if (!editId) refreshUser();
    skipLeaveGuard.current = true;
    triggerConfetti();
    const splittable = !editId && canSplitIntoRooms(res?.listing);
    if (splittable) setPostedListing(res.listing);
    if (!editId && quota.full) setPassListingId(String(res?.listing?.uuid || res?.listing?.id || ''));
    setSavedListingStatus(res?.listing?.status || '');
    setShowSuccess(true);
  };

  const submitProperty = () => {
    if (!editReady || posting || media.isMediaProcessing()) return;
    if (!signedIn) { requestAuthPrompt(); return; }
    const step1Errors = editId ? validateStep1(form, baseline?.form) : {};
    const locationErrors = editId ? validateLocationStep(form, baseline?.form) : {};
    const pricingErrors = editId ? validatePricingStep(form, baseline?.form) : {};
    const err = {
      ...step1Errors,
      ...locationErrors,
      ...pricingErrors,
      ...validateStep3(form, photos, baseline, media.maxPhotos),
    };
    if (Object.keys(err).length) {
      const failStep = Object.keys(step1Errors).length ? 1
        : Object.keys(locationErrors).length ? 2
          : Object.keys(pricingErrors).length ? 3 : currentStep;
      setCurrentStep(failStep);
      writeStepParam(failStep, { replace: true });
      setErrors(err);
      scrollToError(err);
      return;
    }

    if (editId && editChanges?.identityChanged) { setShowIdentityGuard(true); return; }

    setPosting(true);
    finalizeListing()
      .catch((error) => {
        if (error?.status === 401) requestAuthPrompt();
        else toast('Could not post your listing. Please try again.', 'error');
      })
      .finally(() => setPosting(false));
  };

  const submitFlatmate = async () => {
    if (!editReady || editId || posting || media.isMediaProcessing()) return;
    if (!signedIn) { requestAuthPrompt(); return; }
    const stepErrors = [
      validateFlatmateRoom(form, roomBaseline),
      validateFlatmateLocation(form, roomBaseline),
      validateFlatmatePricing(form, roomBaseline),
      validateStep3(form, photos, roomBaseline && { form: roomBaseline, images: roomEdit.photoUrls }, media.maxPhotos),
    ];
    const err = Object.assign({}, ...stepErrors);
    if (photos.some((photo) => !photo.url)) err.photos = 'failed';
    if (Object.keys(err).length) {
      const failStep = stepErrors.findIndex((stepErr) => Object.keys(stepErr).length) + 1 || currentStep;
      if (failStep !== currentStep) { setCurrentStep(failStep); writeStepParam(failStep, { replace: true }); }
      setErrors(err);
      scrollToError(err);
      return;
    }
    setPosting(true);
    try {
      const agreementDoc = form.hostRole === 'tenant' && form.agreementDeclared ? form.agreementDoc : null;
      const house = isHouseType(form.propertyType);
      const room = {
        title: editRoomId && !roomEdit.storedTitle && !form.title.trim() ? undefined : headlineOf(form.title, roomHeadline(form)),
        homeTypeLabel: form.homeTypeLabel,
        bhk: form.bhk,
        roomType: form.roomType,
        attachedBath: form.attachedBath,
        ...numeric('occupants', form.occupants),
        ...terms(form),
        furnishing: form.furnishing,
        locality: form.locality,
        localitySlug: form.localitySlug,
        ...roomSocietyField,
        flatNumber: form.flatNumber,
        rentShare: form.rentShare,
        deposit: parseAmount(form.deposit),
        availableFrom: form.availableFrom,
        lookingFor: form.lookingFor,
        foodPref: form.foodPref,
        hostRole: form.hostRole,
        agreementDeclared: !!form.agreementDeclared && hasAgreementEvidence(agreementDoc),
        agreementDoc,
        ownerConsentMobile: form.ownerConsentMobile,
        ownerConsent: form.hostRole === 'tenant' && !!form.ownerConsent,
        propertyId: form.attachedPropertyId || undefined,
        photos: photos.map((photo) => photo.url),
        note: form.note,
        lat: form.propLat,
        lng: form.propLng,
        gatedCommunity: house && !!form.gatedCommunity,
        details: {
          ...(house ? numeric('floorsInHouse', form.floorsInHouse) : { floor: form.floor, ...numeric('totalFloors', form.totalFloors) }),
          ...numeric('bathrooms', form.bathrooms),
          ...numeric('balconies', form.balconies),
          furniture: form.furniture,
          tower: form.tower,
          street: form.street,
          landmark: form.landmark,
          pincode: form.pincode,
        },
      };
      if (editRoomId) {
        await updateRoom(editRoomId, room);
        skipLeaveGuard.current = true;
        toast(t('listProperty.edit.roomSaved'), 'success');
        navigate('/dashboard#properties');
        return;
      }
      setPostedRoom(await createRoom(room));
      clearFormDraft();
      skipLeaveGuard.current = true;
      triggerConfetti();
      setShowSuccess(true);
    } catch (err) {
      // The eligibility refusal explains what the host must change.
      const refused = err?.status === 400 && err?.message;
      toast(refused || (editRoomId ? t('listProperty.edit.roomSaveFailed') : 'Could not post your flatmate listing. Please try again.'), 'error');
      if (refused) window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setPosting(false);
    }
  };

  const postAnother = () => {
    skipLeaveGuard.current = true;
    startFresh();
  };
  const confirmLeave = () => {
    const target = pendingLeave.current;
    pendingLeave.current = null;
    setShowLeaveConfirm(false);
    flushFormDraft();
    skipLeaveGuard.current = true;
    if (target?.to) navigate(target.to);
  };

  return {
    ...media,
    ...location,
    handlePhotoUpload,
    set: setField,
    locationSet,
    t, navigate, editId, editRoomId, flatmateMode,
    editReady, editLoading, editLoadError, retryEditLoad,
    legacyAddress: editReady && hasStoredAddress(editListing?.form) ? editListing.form.existingAddress : '',
    currentStep, setCurrentStep: (step) => goToStep(step, { replace: true }), rentMode, setRentMode, isFlatmateMode,
    showSuccess, showResetConfirm, setShowResetConfirm, errors,
    showLeaveConfirm, setShowLeaveConfirm, confirmLeave,
    postedListing,
    postedRoom,
    authPromptOpen,
    setAuthPromptOpen,
    closeAuthPrompt,
    requestAuthPrompt,
    needsAuthForMedia: !signedIn,
    savedListingStatus,
    editApproved, editChanges, claimMode, showIdentityGuard, setShowIdentityGuard,
    showDupGuard, setShowDupGuard, dupExistingId, dupPending, passListingId,
    form, progressState,
    toggleInArray, toggleTenant, changePropertyType, changeCommercialType,
    isResidential, isLand, isCommercial, isHouse,
    money, setDepositMonths,
    nextStep, prevStep, openResetConfirm, confirmReset, submitProperty, submitFlatmate,
    postAnother,
    posting,
    activeListingCount: quota.used, listingLimit: quota.allowance, quotaFull: quota.full,
  };
}
