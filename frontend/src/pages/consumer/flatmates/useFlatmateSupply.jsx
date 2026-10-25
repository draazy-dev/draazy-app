import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useFormDraft, useFieldErrors } from '../../../lib/hooks.js';
import { useVerification } from '../../../context/VerificationContext.jsx';
import { digits } from '../../../lib/contact.js';
import { useLatest, useSignInGate } from '../../../lib/useSignInGate.js';
import { evaluateHostEligibility, recordAskLocally, rememberAsk } from '../../../lib/data/flatmates.js';
import * as flatmateService from '../../../services/flatmateService.js';
import { getLocality } from '../../../services/localityService.js';
import { hasAgreementEvidence, inr, perHead, numeric, terms, FLATMATE_GROUP_IMG, replacementTitle, detailPath, seekerHeadline, moveInByForm, moveInByWire } from './helpers.js';
import { GROUP_OPENER } from './openers.js';
import { MIN_AGE, MAX_AGE, MAX_LOCALITIES } from './constants.js';
import { hasContactDetails } from '../list-property/contactDetails.js';
import { headlineOf } from '../../../lib/headline.js';

const leaksContact = (...texts) => texts.some(hasContactDetails);

const liveLocality = async (slug) => {
  if (!slug) return null;
  try {
    const row = await getLocality(slug);
    return row.archived ? null : row;
  } catch {
    return null;
  }
};

const BLANK_POST = { gender: 'any', age: '', occupation: '', budget: '', budgetMax: '', moveIn: 'now', flatPref: 'any', roomPref: 'any', furnishing: '', gatedOnly: false, attachedBath: false, parking: '', localities: [], note: '', title: '', verifiedContactOnly: false };
const BLANK_GROUP = { hunting: true, localities: [], bhk: [], rentMin: '', rentMax: '', depositMin: '', depositMax: '', gatedOnly: false, bachelors: false, furnishing: '', parking: '', moveInBy: '', moveInByStored: '', title: '', locality: '', localitySlug: '', policy: 'women', rent: '', deposit: '', noticePeriodDays: '', lockInMonths: '', maintenanceBilling: '', electricityBilling: '', seats: '2', note: '', role: 'tenant', propertyId: '', agreement: false, agreementDoc: null, consentMobile: '', consentVerified: false };

const formMoney = (v) => (v == null ? '' : String(v));
const preferencesForm = (p) => ({
  hunting: true,
  localities: p.localities,
  bhk: p.bhk,
  rentMin: formMoney(p.rentMin),
  rentMax: formMoney(p.rentMax),
  depositMin: formMoney(p.depositMin),
  depositMax: formMoney(p.depositMax),
  gatedOnly: p.gatedOnly,
  bachelors: p.bachelors,
  furnishing: p.furnishing || '',
  parking: p.parking || '',
  moveInBy: moveInByForm(p.moveInBy),
  moveInByStored: p.moveInBy || '',
});

// Marks "this mount already sent the visitor to sign in" in the same ref that latches a handled
// `?post=`. A Symbol rather than a string so it can never collide with a value the URL carries.
const SIGNIN_LATCH = Symbol('sent-to-signin');

export function useFlatmateSupply({ refresh, user, authLoading, toast, t, nav: navigate, setInterests, ownsGroup, myPost, myPostsStatus, askGender, onGroupEdited = (id) => navigate(detailPath('group', id)) }) {
  const [params, setParams] = useSearchParams();
  const sendToSignIn = useSignInGate();
  const [postOpen, setPostOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [post, setPost] = useState(BLANK_POST);
  const [grp, setGrp] = useState(BLANK_GROUP);
  const postDraft = useFormDraft('dzDraft:flatmate-post', post, setPost, { ignore: ['gender', 'moveIn', 'flatPref', 'roomPref', 'verifiedContactOnly'] });
  const grpDraft = useFormDraft('dzDraft:share-group:v3', grp, setGrp, { ignore: ['policy', 'seats', 'locality', 'hunting'], omit: ['role', 'propertyId', 'agreement', 'agreementDoc', 'consentMobile', 'consentVerified'] });
  const postFormRef = useRef(null);
  const grpFormRef = useRef(null);
  const postErr = useFieldErrors(postFormRef);
  const grpErr = useFieldErrors(grpFormRef);

  // The opt-in identity badge, held once in VerificationContext (see below for why it also
  // gates the Flatmates Verified filter and verified-only contact).
  const { verified: identityVerified } = useVerification();
  const isVerified = user ? identityVerified : false;
  const hasProfileName = !!user?.name?.trim();

  // Posting needs only an L1 sign-in, never identity verification. Signed out, the tap resumes through
  // the `?post=` intent below, which waits for `myPost` (the one-live-request check needs it).
  const requireSignedIn = (action, intent) => {
    if (!user) {
      const next = new URLSearchParams(params);
      next.set('post', intent);
      sendToSignIn('listproperty', `/flatmates?${next}`);
      return;
    }
    action();
  };
  /* No `listRoom` twin of these: the app-wide sheet navigates to `/list-property?flatmate=1` from wherever it was
     opened, so a board-only copy would be a second door to the same room. */
  // An edited legacy group can leave `hunting: false` behind, and a new group never posts a flat.
  const createGroup = () => requireSignedIn(() => { setGrp((g) => ({ ...g, hunting: true })); setGroupOpen(true); }, 'group');
  const openPostModal = (id = null) => {
    requireSignedIn(() => {
      // One live request per person: a fresh post while one already exists edits the existing
      // request rather than silently creating a duplicate; the modal says so and offers take-down.
      if (!id && myPost) id = myPost.id;
      setEditingId(id);
      if (id && myPost && myPost.id === id) {
        setPost({
          gender: myPost.gender || 'female',
          age: myPost.age || '',
          occupation: myPost.occupation || '',
          budget: myPost.budget || '',
          budgetMax: myPost.budgetMax || '',
          moveIn: myPost.moveIn || '',
          flatPref: myPost.flatPref || 'any',
          roomPref: myPost.roomPref || 'any',
          furnishing: myPost.furnishing || '',
          gatedOnly: myPost.gatedOnly,
          attachedBath: myPost.attachedBath,
          parking: myPost.parking || '',
          localities: myPost.localities || [],
          note: myPost.note || '',
          title: myPost.title && myPost.title !== seekerHeadline(myPost) ? myPost.title : '',
          verifiedContactOnly: myPost.verifiedContactOnly || false,
        });
      } else if (!id) {
        setPost({ ...BLANK_POST, gender: user.gender || 'any' });
      }
      setPostOpen(true);
    }, 'solo');
  };
  const postIntent = params.get('post');
  /* A Symbol marks the signed-out redirect — it can never equal a `?post=` value. */
  const handledIntent = useRef(null);
  useEffect(() => {
    if (!postIntent) { handledIntent.current = null; return; }
    if (authLoading) return;
    if (!user) {
      if (handledIntent.current !== SIGNIN_LATCH) {
        handledIntent.current = SIGNIN_LATCH;
        sendToSignIn('listproperty', `/flatmates?${params}`);
      }
      return;
    }
    if (myPostsStatus === 'loading') return;
    if (handledIntent.current === postIntent) return;
    handledIntent.current = postIntent;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('post');
      return next;
    }, { replace: true });
    if (postIntent === 'group') createGroup(); else openPostModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `post` is a.
  }, [postIntent, authLoading, Boolean(user), myPostsStatus]);

  const editGroup = (id) => flatmateService.getFlatmateDetail('group', id)
    .then(({ owned, item: g }) => {
      if (!owned) return;
      setGrp({
        ...BLANK_GROUP,
        ...(g.preferences ? preferencesForm(g.preferences) : { hunting: false }),
        title: g.title,
        locality: g.locality || '',
        localitySlug: g.localitySlug || '',
        policy: g.policy,
        rent: g.rent ? String(g.rent) : '',
        deposit: formMoney(g.deposit),
        noticePeriodDays: g.noticePeriodDays == null ? '' : String(g.noticePeriodDays),
        lockInMonths: g.lockInMonths == null ? '' : String(g.lockInMonths),
        maintenanceBilling: g.maintenanceBilling || '',
        electricityBilling: g.electricityBilling || '',
        seats: String(g.seatsTotal || 2),
        note: g.note,
        role: g.hostRole === 'owner' ? 'owner' : 'tenant',
        propertyId: g.propertyId || '',
        agreement: g.agreementDeclared,
        consentMobile: g.ownerConsentMobile,
        consentVerified: g.ownerConsent,
        seatsOpen: g.seatsOpen,
        seatsWas: g.seatsTotal,
      });
      setEditingGroupId(g.id);
      setGroupOpen(true);
    })
    .catch((err) => toast(err?.message || t('common.somethingWentWrong'), 'error'));
  const editGroupIntent = params.get('editGroup');
  const handledEditGroup = useRef(null);
  useEffect(() => {
    if (!editGroupIntent) { handledEditGroup.current = null; return; }
    if (authLoading || !user || handledEditGroup.current === editGroupIntent) return;
    handledEditGroup.current = editGroupIntent;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('editGroup');
      return next;
    }, { replace: true });
    editGroup(editGroupIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `editGroup` is.
  }, [editGroupIntent, authLoading, Boolean(user)]);
  useEffect(() => {
    if (groupOpen || !editingGroupId) return;
    setEditingGroupId(null);
    setGrp(BLANK_GROUP);
    grpDraft.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closing the.
  }, [groupOpen]);
  const submitPost = async (e) => {
    e.preventDefault();
    const ok = postErr.check([
      { name: 'name', ok: hasProfileName, msg: t('flatmates.valAddName') },
      { name: 'age', ok: !post.age || (Number.isInteger(+post.age) && +post.age >= MIN_AGE && +post.age <= MAX_AGE), msg: t('flatmates.valAge', { min: MIN_AGE, max: MAX_AGE }) },
      { name: 'budget', ok: !!post.budget,       msg: t('flatmates.valAddBudget') },
      { name: 'localities', ok: post.localities.length > 0, msg: t('flatmates.valPickLocality') },
      { name: 'localities', ok: post.localities.length <= MAX_LOCALITIES, msg: t('flatmates.valTooManyLocalities', { count: MAX_LOCALITIES }) },
      { name: 'budgetMax', ok: !post.budgetMax || +post.budgetMax >= +post.budget, msg: t('flatmates.valBudgetRange') },
      { name: 'note', ok: !leaksContact(post.occupation, post.note), msg: t('flatmates.valNoContact') },
      { name: 'title', ok: !leaksContact(post.title), msg: t('common.headline.contact') },
    ], toast);
    if (!ok) return;
    const data = {
      title: editingId && !myPost?.title && !post.title?.trim() ? undefined : headlineOf(post.title, seekerHeadline(post)),
      gender: post.gender,
      age: +post.age || undefined,
      occupation: post.occupation,
      budget: +post.budget,
      ...numeric('budgetMax', post.budgetMax),
      localities: post.localities,
      moveIn: post.moveIn,
      flatPref: post.flatPref,
      roomPref: post.roomPref,
      furnishing: post.furnishing,
      gatedOnly: post.gatedOnly,
      attachedBath: post.attachedBath,
      parking: post.parking,
      note: post.note,
      verifiedContactOnly: post.verifiedContactOnly,
      mobile: user ? (user.mobile || '') : '',
      verified: isVerified,
      time: 'Just now',
    };
    // The id and timestamp are the server's to assign — a client-minted `'s' + Date.now()` collides
    // with a real id. On failure the modal stays open with what the user typed still in it.
    try {
      if (editingId && myPost && myPost.id === editingId) {
        await flatmateService.updatePost(editingId, data);
      } else {
        await flatmateService.createPost(data);
      }
    } catch (err) {
      toast(err?.message || t('common.somethingWentWrong'), 'error');
      return;
    }
    await refresh();
    postDraft.clear();
    setPostOpen(false);
    setEditingId(null);
    setPost(BLANK_POST);
    toast(editingId ? t('flatmates.requestUpdated') : t('flatmates.requestLive'));
  };
  // Archiving frees the one-live-request slot, so the same sheet turns into a blank new request.
  const takeDownPost = async () => {
    if (!editingId || !window.confirm(t('flatmates.takeDownConfirm'))) return;
    try {
      await flatmateService.deletePost(editingId);
    } catch (err) {
      toast(err?.message || t('common.somethingWentWrong'), 'error');
      return;
    }
    await refresh();
    postDraft.clear();
    setEditingId(null);
    setPost({ ...BLANK_POST, gender: user?.gender || 'any' });
    toast(t('flatmates.requestTakenDown'));
  };
  const prefillGroupFromListing = async (listing) => {
    if (!listing) return;
    const live = await liveLocality(listing.localitySlug);
    const loc = live?.name || '';
    const rent = listing.deal === 'rent' && listing.price ? String(listing.price) : '';
    setGrp((g) => {
      const title = g.title || replacementTitle({ bhk: listing.bhk, locality: loc || listing.locality });
      const locality = loc || g.locality;
      const moved = title !== g.title || locality !== g.locality;
      return {
        ...g,
        hunting: false,
        propertyId: listing.uuid || listing.id,
        title,
        locality,
        ...(live && locality !== g.locality ? { localitySlug: live.slug } : {}),
        ...(rent && !g.rent ? { rent } : {}),
        ...(moved ? { consentVerified: false } : {}),
      };
    });
    grpErr.clear('title'); if (rent) grpErr.clear('rent');
  };
  // Seeds the owner-consent number too, making the consent-OTP step one tap. The number is only
  // pre-filled, never marked verified — the owner's OTP is still required.
  const prefillGroupFromTenancy = async (t) => {
    if (!t) return;
    const live = await liveLocality(t.localitySlug);
    const loc = live?.name || '';
    setGrp((g) => ({
      ...g,
      hunting: false,
      role: 'tenant',
      propertyId: t.propertyId || t.propId || g.propertyId,
      title: g.title || replacementTitle({ locality: loc }),
      ...(live ? { locality: loc, localitySlug: live.slug } : {}),
      ...(t.rent && !g.rent ? { rent: String(t.rent) } : {}),
      consentMobile: g.consentMobile || digits(t.ownerMobile).slice(-10),
      consentVerified: false,
    }));
    grpErr.clear('title'); if (t.rent) grpErr.clear('rent');
  };
  const seatsOpenAfterEdit = (seats) => (editingGroupId && grp.seatsOpen != null
    ? { seatsOpen: Math.max(0, grp.seatsOpen + seats - (grp.seatsWas || seats)) } : {});
  const huntingGroup = () => {
    const ok = grpErr.check([
      { name: 'title', ok: !!grp.title.trim(), msg: t('flatmates.valAddGroupTitle') },
      { name: 'localities', ok: grp.localities.length > 0, msg: t('flatmates.valPickLocality') },
      { name: 'rentMax', ok: +grp.rentMax > 0, msg: t('flatmates.valAddBudgetMax') },
      { name: 'rentMin', ok: !grp.rentMin || +grp.rentMin <= +grp.rentMax, msg: t('flatmates.valBudgetRange') },
      { name: 'depositMax', ok: grp.depositMax !== '' && (!grp.depositMin || +grp.depositMin <= +grp.depositMax), msg: t(grp.depositMax === '' ? 'flatmates.valAddDepositMax' : 'flatmates.valDepositRange') },
      { name: 'name', ok: !!editingGroupId || hasProfileName, msg: t('flatmates.valAddName') },
      { name: 'note', ok: !leaksContact(grp.title, grp.note), msg: t('flatmates.valNoContact') },
    ], toast);
    if (!ok) return null;
    const guard = evaluateHostEligibility({ mobile: user ? user.mobile : '', tier: 'identity' });
    if (guard.overCap) { toast(guard.reason, 'error'); return null; }
    const seats = parseInt(grp.seats, 10) || 2;
    return {
      title: grp.title.trim(), policy: grp.policy, seatsTotal: seats, ...seatsOpenAfterEdit(seats),
      note: grp.note, time: 'Just now',
      ownerMobile: user ? (user.mobile || '') : '', hostRole: 'tenant', verificationTier: 'identity',
      preferences: {
        localities: grp.localities, bhk: grp.bhk,
        rentMin: grp.rentMin, rentMax: grp.rentMax, depositMin: grp.depositMin, depositMax: grp.depositMax,
        gatedOnly: grp.gatedOnly, bachelors: grp.bachelors, furnishing: grp.furnishing, parking: grp.parking, moveInBy: moveInByWire(grp.moveInBy, grp.moveInByStored),
      },
    };
  };
  const submitGroup = async (e) => {
    e.preventDefault();
    if (grp.hunting) {
      const group = huntingGroup();
      if (group) await saveGroup(group);
      return;
    }
    if (grp.agreementDoc?.uploading) { toast(t('common.waitForUpload'), 'error'); return; }
    const ok = grpErr.check([
      { name: 'title', ok: !!grp.title.trim(), msg: t('flatmates.valAddGroupTitle') },
      { name: 'rent', ok: !!grp.rent, msg: t('flatmates.valAddRent') },
      { name: 'deposit', ok: grp.deposit !== '' && grp.deposit != null, msg: t('flatmates.valAddDeposit') },
      { name: 'name', ok: !!editingGroupId || hasProfileName, msg: t('flatmates.valAddName') },
      { name: 'note', ok: !leaksContact(grp.title, grp.note), msg: t('flatmates.valNoContact') },
    ], toast);
    if (!ok) return;
    const seats = parseInt(grp.seats, 10) || 2;
    // Derive the host eligibility tier from the declared role + proof signal.
    // Sign-in (L1) is the floor; the Verified badge is an optional trust signal.
    const role = grp.role === 'owner' ? 'owner' : 'tenant';
    const propertyId = grp.propertyId || '';
    // A tenant claims the Tenant tier only by declaring AND attaching the agreement — the artifact
    // Ops verifies. Declared-without-upload stays identity tier: still posts, no host badge.
    const agreementDoc = role === 'tenant' && grp.agreement ? (grp.agreementDoc || null) : null;
    const agreementDeclared = role === 'tenant' ? (!!grp.agreement && hasAgreementEvidence(agreementDoc)) : false;
    const verificationTier = role === 'owner'
      ? (propertyId ? 'owner' : 'identity')
      : (agreementDeclared ? 'tenant' : 'identity');
    const guard = evaluateHostEligibility({
      mobile: user ? user.mobile : '',
      tier: verificationTier,
      address: { propertyId, locality: grp.locality, title: grp.title.trim() },
    });
    if (guard.blocked) { toast(guard.reason, 'error'); return; }
    const ownerConsent = role === 'tenant' ? !!grp.consentVerified : false;
    await saveGroup({ title: grp.title.trim(), locality: grp.locality, localitySlug: grp.localitySlug || '', policy: grp.policy, rent: +grp.rent, ...numeric('deposit', grp.deposit), ...terms(grp), seatsTotal: seats, ...seatsOpenAfterEdit(seats), note: grp.note, time: 'Just now', ownerMobile: user ? (user.mobile || '') : '', hostRole: role, verificationTier, propertyId, agreementDeclared, agreementDoc, ownerConsentMobile: role === 'tenant' ? (grp.consentMobile || '') : '', ownerConsent, addressFingerprint: guard.fingerprint, flagForReview: guard.flagForReview });
  };
  const savingGroup = useRef(false);
  const saveGroup = async (group) => {
    if (savingGroup.current) return;
    savingGroup.current = true;
    try { await persistGroup(group); } finally { savingGroup.current = false; }
  };
  const persistGroup = async (group) => {
    const editedId = editingGroupId;
    let created;
    // The saved record carries the server-assigned id, which the review queue below keys on — the
    // locally minted `'mg' + Date.now()` would enqueue a review against a group that does not exist.
    try {
      if (editedId) await flatmateService.updateGroup(editedId, group);
      else created = await flatmateService.createGroup(group);
    } catch (err) {
      toast(err?.message || t('common.somethingWentWrong'), 'error');
      return;
    }
    await refresh();
    grpDraft.clear();
    setGroupOpen(false); setGrp(BLANK_GROUP); setEditingGroupId(null);
    if (editedId) {
      toast(t('flatmates.groupUpdated'));
      onGroupEdited(editedId);
      return;
    }
    toast(t(created?.publiclyVisible ? 'flatmates.groupLive' : 'flatmates.groupInReview'));
  };
  // Requires a valid 10-digit number, plus the title and locality the consent row is scoped by:
  // the server names the flat from those two, so without them the owner's SMS vouches for nothing.
  const openConsent = () => {
    const m = digits(grp.consentMobile);
    if (m.length !== 10) { toast(t('flatmates.enterOwnerMobile'), 'error'); return; }
    if (!grp.title.trim() || !grp.locality.trim()) {
      toast(t('flatmates.consentNeedsTitle'), 'error');
      return;
    }
    setConsentOpen(true);
  };
  const onJoin = async (g) => {
    if (!user) { sendToSignIn('community', undefined, () => latestJoin.current(g)); return; }
    if (ownsGroup(g)) { toast(t('flatmates.alreadyMember')); return; }
    const key = 'group-' + g.id;
    const opener = GROUP_OPENER;
    const gate = await askGender(g, 'group');
    if (!gate) return;
    /* One record for both answers: the device receiving the duplicate `409` is often not the
     * one that made the request, and must still hold the same Messages thread. */
    const ask = {
      request: { propertyId: key, property: { title: g.title, price: inr(perHead(g)) + '/mo', loc: (g.locality || 'Pune') + ', Pune', img: FLATMATE_GROUP_IMG }, party: { name: g.title, avatar: (g.title || 'GR').slice(0, 2).toUpperCase() }, firstMessage: opener },
    };
    // Optimistic, and it doubles as the re-entrancy guard: the card re-renders into its requested
    // state before the request settles, so a second tap has no button to land on.
    setInterests((m) => ({ ...m, [key]: true }));
    try {
      await flatmateService.joinGroup(g.id, { share: 'solo', message: opener, gender: gate.gender });
    } catch (err) {
      if (err?.code === flatmateService.CONFLICT_ALREADY_INTERESTED) {
        rememberAsk(user.mobile, key);
        recordAskLocally(ask);
        toast(t('flatmates.joinRequestAlreadyRecorded', { title: g.title }));
        return;
      }
      setInterests((m) => { const n = { ...m }; delete n[key]; return n; });
      if (err?.code === flatmateService.CONFLICT_GROUP_FULL) {
        // The only authoritative word that the snapshot is stale. Rolling back alone re-renders a
        // live Join button, leaving the user to tap and be refused forever — so refresh first.
        await refresh();
        toast(t('flatmates.groupAlreadyFull', { title: g.title }), 'error');
        return;
      }
      // The clamp is a rule, not a fault: "this flat is full" is the useful message, and the
      // server's own text says which cap was hit.
      toast(err?.message || t('common.somethingWentWrong'), 'error');
      return;
    }
    rememberAsk(user.mobile, key);
    await refresh();

    recordAskLocally(ask);

    toast(t('flatmates.requestJoinToast', { title: g.title }));
  };
  const latestJoin = useLatest(onJoin);

  const openVerify = () => {
    if (!user) { sendToSignIn('verify', undefined, () => setVerifyOpen(true)); return; }
    setVerifyOpen(true);
  };

  return {
    post, setPost, postOpen, setPostOpen, postFormRef, postDraft, postErr, editingId,
    openPostModal, submitPost, takeDownPost,
    grp, setGrp, groupOpen, setGroupOpen, grpFormRef, grpDraft, grpErr, submitGroup, editingGroupId, editGroup,
    prefillGroupFromListing, prefillGroupFromTenancy,
    openConsent, consentOpen, setConsentOpen,
    onJoin, createGroup,
    verifyOpen, setVerifyOpen, openVerify, isVerified,
  };
}
