import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const h = vi.hoisted(() => ({
  auth: { user: null, loading: false, refreshUser: vi.fn() },
  toast: vi.fn(),
  roomEdit: { status: 'idle', baseline: null, photoUrls: [], storedTitle: '', retry: vi.fn() },
  formDraft: { clear: vi.fn(), flush: vi.fn(), startFresh: vi.fn() },
  draft: {},
  media: { upload: vi.fn(), restore: vi.fn(), reset: vi.fn(), busy: false, processing: false, initialPhotos: [] },
  valid: { s1: {}, loc: {}, price: {}, s3: {}, room: {}, roomLoc: {}, roomPrice: {} },
  scrollToError: vi.fn(),
  ownerState: 'live',
  splittable: false,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => (typeof d === 'string' ? d : k) }) }));
vi.mock('../../../../../src/context/AuthContext.jsx', () => ({ useAuth: () => h.auth }));
vi.mock('../../../../../src/context/ToastContext.jsx', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('../../../../../src/lib/hooks.js', () => ({
  useFormDraft: (key, form, restore, opts) => {
    h.draft = { key, form, restore, opts };
    return h.formDraft;
  },
}));
vi.mock('../../../../../src/services/propertyService.js', () => ({
  myListing: vi.fn(),
  checkOwnDuplicate: vi.fn(),
  confirmOwnerListing: vi.fn(),
}));
vi.mock('../../../../../src/components/listing/ListingStatusCard.jsx', () => ({ getOwnerListingState: () => h.ownerState }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({ createRoom: vi.fn(), updateRoom: vi.fn() }));
vi.mock('../../../../../src/lib/data/flatSplit.js', () => ({ canSplitIntoRooms: () => h.splittable }));
vi.mock('../../../../../src/lib/data/listingQuota.js', () => ({ loadWizardQuota: vi.fn() }));
vi.mock('../../../../../src/lib/haptics.js', () => ({ haptic: vi.fn() }));
vi.mock('../../../../../src/pages/consumer/list-property/confetti.js', () => ({ triggerConfetti: vi.fn() }));
vi.mock('../../../../../src/lib/pmf.js', () => ({ track: vi.fn() }));
vi.mock('../../../../../src/pages/consumer/list-property/StepNav.jsx', () => ({ LISTING_STEPS: [1, 2, 3, 4] }));
vi.mock('../../../../../src/pages/consumer/list-property/submit.js', () => ({
  persistListing: vi.fn(),
  listingLabels: (f) => ({ title: `${f.bhk ? `${f.bhk} BHK ` : ''}Flat in ${f.locality || ''}`.trim() }),
  roomHeadline: () => 'Room headline',
}));
vi.mock('../../../../../src/pages/consumer/list-property/validation.js', () => ({
  scrollToError: (...a) => h.scrollToError(...a),
  validateStep1: () => ({ ...h.valid.s1 }),
  validateLocationStep: () => ({ ...h.valid.loc }),
  validatePricingStep: () => ({ ...h.valid.price }),
  validateStep3: () => ({ ...h.valid.s3 }),
  validateFlatmateRoom: () => ({ ...h.valid.room }),
  validateFlatmateLocation: () => ({ ...h.valid.roomLoc }),
  validateFlatmatePricing: () => ({ ...h.valid.roomPrice }),
}));
vi.mock('../../../../../src/pages/consumer/list-property/useListingMedia.js', async () => {
  const { useState } = await import('react');
  return {
    default: () => {
      const [photos, setPhotos] = useState(h.media.initialPhotos);
      return {
        photos,
        setPhotos,
        restorePhotos: h.media.restore,
        resetMedia: h.media.reset,
        handlePhotoUpload: h.media.upload,
        isMediaBusy: h.media.busy,
        isMediaProcessing: () => h.media.processing,
        maxPhotos: 10,
      };
    },
  };
});
vi.mock('../../../../../src/pages/consumer/list-property/useListingLocation.js', () => ({
  default: ({ setForm }) => ({ set: (field, value) => setForm((p) => ({ ...p, [field]: value })), geoMarker: true }),
}));
vi.mock('../../../../../src/pages/consumer/list-property/useRoomEdit.js', () => ({
  default: () => h.roomEdit,
  useHomePrefill: vi.fn(),
}));

import { myListing, checkOwnDuplicate, confirmOwnerListing } from '../../../../../src/services/propertyService.js';
import { createRoom, updateRoom } from '../../../../../src/services/flatmateService.js';
import { loadWizardQuota } from '../../../../../src/lib/data/listingQuota.js';
import { persistListing } from '../../../../../src/pages/consumer/list-property/submit.js';
import { triggerConfetti } from '../../../../../src/pages/consumer/list-property/confetti.js';
import { track } from '../../../../../src/lib/pmf.js';
import { SESSION_ENDED_EVENT, ApiError } from '../../../../../src/services/http.js';
import useListProperty from '../../../../../src/pages/consumer/list-property/useListProperty.js';

afterEach(cleanup);

const USER = { id: 'u1', mobile: '9000000001', name: 'Asha' };

function mount(url = '/list-property', { user = USER, loading = false } = {}) {
  h.auth = { user, loading, refreshUser: h.auth.refreshUser };
  const wrapper = ({ children }) => React.createElement(MemoryRouter, { initialEntries: [url] }, children);
  const view = renderHook(() => ({ lp: useListProperty(), loc: useLocation() }), { wrapper });
  return { view, lp: () => view.result.current.lp, loc: () => view.result.current.loc };
}

beforeEach(() => {
  localStorage.clear();
  h.auth = { user: USER, loading: false, refreshUser: vi.fn() };
  h.toast.mockReset();
  h.roomEdit = { status: 'idle', baseline: null, photoUrls: [], storedTitle: '', retry: vi.fn() };
  h.formDraft = { clear: vi.fn(), flush: vi.fn(), startFresh: vi.fn() };
  h.media = { upload: vi.fn(), restore: vi.fn(), reset: vi.fn(), busy: false, processing: false, initialPhotos: [] };
  h.valid = { s1: {}, loc: {}, price: {}, s3: {}, room: {}, roomLoc: {}, roomPrice: {} };
  h.scrollToError.mockReset();
  h.ownerState = 'live';
  h.splittable = false;
  myListing.mockReset();
  checkOwnDuplicate.mockReset();
  confirmOwnerListing.mockReset();
  createRoom.mockReset();
  updateRoom.mockReset();
  persistListing.mockReset();
  loadWizardQuota.mockReset().mockResolvedValue({ used: 1, allowance: 3, full: false });
  triggerConfetti.mockReset();
  track.mockReset();
  window.scrollTo = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
});
afterEach(() => vi.unstubAllGlobals());

const pinned = (t) => act(() => t.lp().set('pinPlaced', true));

describe('entry state', () => {
  it('starts a new listing with defaults and loads the quota', async () => {
    const t = mount();
    expect(t.lp()).toMatchObject({ editReady: true, editLoading: false, currentStep: 1, rentMode: 'whole', isFlatmateMode: false, showSuccess: false, needsAuthForMedia: false });
    await waitFor(() => expect(t.lp().activeListingCount).toBe(1));
    expect(t.lp().listingLimit).toBe(3);
    expect(h.draft.opts.enabled).toBe(true);
    expect(h.draft.key).toContain('u1');
  });

  it('presets the deal from the URL', () => {
    expect(mount('/list-property?deal=rent').lp().form.deal).toBe('rent');
    expect(mount('/list-property?deal=buy').lp().form.deal).toBe('buy');
  });

  it('enters flatmate mode', () => {
    const t = mount('/list-property?flatmate=1');
    expect(t.lp()).toMatchObject({ isFlatmateMode: true, rentMode: 'flatmate', flatmateMode: true });
    expect(t.lp().form).toMatchObject({ deal: 'rent', propertyType: 'flat', hostRole: 'tenant' });
    expect(loadWizardQuota).not.toHaveBeenCalled();
  });

  it('skips the quota for guests and clears it', async () => {
    const t = mount('/list-property', { user: null });
    expect(t.lp().needsAuthForMedia).toBe(true);
    expect(loadWizardQuota).not.toHaveBeenCalled();
    expect(t.lp().activeListingCount).toBe(0);
  });
});

describe('field helpers', () => {
  it('derives plot area from length and width', () => {
    const t = mount();
    act(() => t.lp().set('plotLength', '10'));
    act(() => t.lp().set('plotWidth', '20'));
    expect(t.lp().form).toMatchObject({ plotLength: '10', plotWidth: '20', carpetArea: '200' });
    act(() => t.lp().set('plotWidth', '30'));
    expect(t.lp().form.carpetArea).toBe('300');
    act(() => t.lp().set('carpetArea', '999'));
    act(() => t.lp().set('plotWidth', '40'));
    expect(t.lp().form.carpetArea).toBe('999');
  });

  it('keeps bathrooms in step with bhk unless the user chose them', () => {
    const t = mount();
    act(() => t.lp().set('bhk', '3'));
    expect(t.lp().form).toMatchObject({ bhk: '3', bathrooms: '2' });
    act(() => t.lp().set('bathrooms', '4'));
    act(() => t.lp().set('bhk', '2'));
    expect(t.lp().form.bathrooms).toBe('4');
    act(() => t.lp().set('bhk', '1'));
    expect(t.lp().form.bhk).toBe('1');
  });

  it('delegates other fields and clears the floor error', () => {
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    expect(t.lp().form.society).toBe('Sky');
  });

  it('toggles array values and tenants', () => {
    const t = mount();
    act(() => t.lp().toggleInArray('amenities', 'gym'));
    expect(t.lp().form.amenities).toContain('gym');
    act(() => t.lp().toggleInArray('amenities', 'gym'));
    expect(t.lp().form.amenities).not.toContain('gym');
    act(() => t.lp().toggleTenant('family'));
    act(() => t.lp().toggleTenant('bachelor-male'));
    expect(t.lp().form.preferredTenants).toEqual(['family', 'bachelor-male']);
    act(() => t.lp().toggleTenant('bachelors'));
    expect(t.lp().form.preferredTenants).toEqual(['family', 'bachelors']);
    act(() => t.lp().toggleTenant('bachelor-female'));
    expect(t.lp().form.preferredTenants).toEqual(['family', 'bachelor-female']);
    act(() => t.lp().toggleTenant('anyone'));
    expect(t.lp().form.preferredTenants).toEqual(['anyone']);
    act(() => t.lp().toggleTenant('family'));
    expect(t.lp().form.preferredTenants).toEqual(['family']);
    act(() => t.lp().toggleTenant('anyone'));
    act(() => t.lp().toggleTenant('anyone'));
    expect(t.lp().form.preferredTenants).toEqual([]);
  });

  it('resets type-specific fields when the property type changes', () => {
    const t = mount();
    act(() => t.lp().set('washrooms', '3'));
    act(() => t.lp().changePropertyType('openplot'));
    expect(t.lp().form).toMatchObject({ propertyType: 'openplot', washrooms: '', overlooking: '' });
    expect(t.lp().isLand()).toBe(true);
    expect(t.lp().isResidential()).toBe(false);
    act(() => t.lp().changePropertyType('commercial'));
    expect(t.lp().isCommercial()).toBe(true);
    act(() => t.lp().changePropertyType('villa'));
    expect(t.lp().isHouse()).toBe(true);
    expect(t.lp().rentMode).toBe('whole');
  });

  it('moves floor-plan photos to Other when the new type has no floor plan', () => {
    h.media.initialPhotos = [{ url: 'a', category: 'Floor Plan' }, { url: 'b', category: 'Kitchen' }];
    const t = mount();
    act(() => t.lp().changePropertyType('openplot'));
    expect(t.lp().photos.map((p) => p.category)).not.toContain('Floor Plan');
  });

  it('resets commercial specifics when the commercial type changes', () => {
    h.media.initialPhotos = [{ url: 'a', category: 'Reception' }, { url: 'b' }];
    const t = mount();
    act(() => t.lp().set('pantry', true));
    act(() => t.lp().changeCommercialType('shop'));
    expect(t.lp().form).toMatchObject({ commercialType: 'shop', pantry: false, fixtures: [], suitableFor: [], amenities: [] });
    expect(t.lp().photos[0].category).toBe('Other');
  });

  it('wires money inputs and deposit months', () => {
    const t = mount();
    const field = t.lp().money('monthlyRent');
    act(() => field.onChange({ target: { value: '25,000' } }));
    expect(t.lp().form.monthlyRent).toBe('25000');
    act(() => t.lp().money('monthlyRent').onBlur({ target: { value: '25000' } }));
    act(() => t.lp().setDepositMonths(3));
    expect(t.lp().form.deposit).toBe('75000');
    act(() => t.lp().set('monthlyRent', ''));
    act(() => t.lp().setDepositMonths(2));
    expect(t.lp().form.deposit).toBe('75000');
  });
});

describe('media gating', () => {
  it('asks guests to sign in instead of uploading', () => {
    const t = mount('/list-property', { user: null });
    const event = { target: { value: 'x' } };
    act(() => t.lp().handlePhotoUpload(event));
    expect(event.target.value).toBe('');
    expect(h.media.upload).not.toHaveBeenCalled();
    expect(t.lp().authPromptOpen).toBe(true);
    expect(h.formDraft.flush).toHaveBeenCalled();
    act(() => t.lp().closeAuthPrompt());
    expect(t.lp().authPromptOpen).toBe(false);
  });

  it('uploads for signed in owners', () => {
    const t = mount();
    const event = { target: { files: [] } };
    act(() => t.lp().handlePhotoUpload(event));
    expect(h.media.upload).toHaveBeenCalledWith(event);
  });
});

describe('stepping', () => {
  it('blocks next with validation errors', () => {
    h.valid.s1 = { bhk: 'required' };
    const t = mount();
    act(() => t.lp().nextStep());
    expect(t.lp().errors).toEqual({ bhk: 'required' });
    expect(h.scrollToError).toHaveBeenCalledWith({ bhk: 'required' });
    expect(t.lp().currentStep).toBe(1);
  });

  it('advances through valid steps and requires a pin for the location step', async () => {
    const t = mount();
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    expect(t.loc().search).toBe('?step=2');
    act(() => t.lp().nextStep());
    expect(t.lp().errors.location).toBe(true);
    pinned(t);
    checkOwnDuplicate.mockResolvedValue({ found: false });
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(3));
    expect(checkOwnDuplicate).toHaveBeenCalled();
    expect(t.lp().dupPending).toBe(false);
  });

  it('shows the duplicate guard when the owner already listed it', async () => {
    checkOwnDuplicate.mockResolvedValue({ found: true, existingId: 'L7' });
    const t = mount('/list-property?step=2');
    pinned(t);
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().showDupGuard).toBe(true));
    expect(t.lp().dupExistingId).toBe('L7');
    expect(t.lp().currentStep).toBe(2);
  });

  it('advances or prompts sign-in when the duplicate check fails', async () => {
    checkOwnDuplicate.mockRejectedValue(new ApiError({ code: 'x', message: 'm', status: 401 }));
    const t = mount('/list-property?step=2');
    pinned(t);
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().authPromptOpen).toBe(true));
    act(() => t.lp().closeAuthPrompt());
    checkOwnDuplicate.mockRejectedValue(new Error('boom'));
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(3));
  });

  it('goes straight to the last step and prompts a guest who finishes pricing', async () => {
    const t = mount('/list-property?step=2', { user: null });
    pinned(t);
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(3));
    act(() => t.lp().nextStep());
    expect(t.lp().currentStep).toBe(4);
    expect(t.lp().authPromptOpen).toBe(true);
  });

  it('clamps an unreachable entry step', async () => {
    h.valid.s1 = { bhk: 'x' };
    const t = mount('/list-property?step=4');
    await waitFor(() => expect(t.loc().search).toBe(''));
    expect(t.lp().currentStep).toBe(1);
  });

  it('accepts named steps from the URL', async () => {
    const t = mount('/list-property?step=pricing');
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
  });

  it('goes back one step', async () => {
    const t = mount('/list-property?step=2');
    pinned(t);
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    act(() => t.lp().prevStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(1));
    act(() => t.lp().prevStep());
    expect(t.lp().currentStep).toBe(1);
    act(() => t.lp().setCurrentStep(2));
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
  });

  it('uses the flatmate validators in room mode', async () => {
    h.valid.room = { roomType: 'required' };
    const t = mount('/list-property?flatmate=1');
    act(() => t.lp().nextStep());
    expect(t.lp().errors).toEqual({ roomType: 'required' });
    h.valid.room = {};
    act(() => t.lp().nextStep());
    await waitFor(() => expect(t.lp().currentStep).toBe(2));
    h.valid.roomLoc = { locality: 'x' };
    act(() => t.lp().nextStep());
    expect(t.lp().errors.locality).toBe('x');
  });
});

describe('submitProperty', () => {
  const ok = (extra = {}) => ({ ok: true, listing: { id: 'L1', deal: 'buy', type: 'Flat', status: 'pending', ...extra } });

  it('does nothing while uploads are in progress and prompts guests', () => {
    h.media.processing = true;
    const t = mount();
    act(() => t.lp().submitProperty());
    expect(persistListing).not.toHaveBeenCalled();
    cleanup();
    h.media.processing = false;
    const guest = mount('/list-property', { user: null });
    act(() => guest.lp().submitProperty());
    expect(guest.lp().authPromptOpen).toBe(true);
  });

  it('posts a new listing and shows success', async () => {
    persistListing.mockResolvedValue(ok());
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().showSuccess).toBe(true));
    expect(persistListing).toHaveBeenCalledWith(expect.objectContaining({ user: USER, editId: null, photos: [] }));
    expect(h.formDraft.clear).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('listing_submitted', { deal: 'buy', type: 'Flat' });
    expect(h.auth.refreshUser).toHaveBeenCalled();
    expect(triggerConfetti).toHaveBeenCalled();
    expect(t.lp().savedListingStatus).toBe('pending');
    expect(t.lp().posting).toBe(false);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('keeps the posted listing when it can be split into rooms', async () => {
    h.splittable = true;
    persistListing.mockResolvedValue(ok());
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().postedListing).toMatchObject({ id: 'L1' }));
  });

  it('records the pass listing when the quota is full', async () => {
    loadWizardQuota.mockResolvedValue({ used: 3, allowance: 3, full: true });
    persistListing.mockResolvedValue(ok({ uuid: 'uuid-9' }));
    const t = mount();
    await waitFor(() => expect(t.lp().quotaFull).toBe(true));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().passListingId).toBe('uuid-9'));
  });

  it('jumps to the failing step on client validation errors', async () => {
    h.valid.s3 = { photos: 'min' };
    const t = mount();
    act(() => t.lp().submitProperty());
    expect(t.lp().errors).toEqual({ photos: 'min' });
    expect(persistListing).not.toHaveBeenCalled();
  });

  it('shows the duplicate guard when the server blocks the post', async () => {
    persistListing.mockResolvedValue({ ok: false, blocked: true, existingId: 'L2' });
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().showDupGuard).toBe(true));
    expect(t.lp().dupExistingId).toBe('L2');
    expect(t.lp().showSuccess).toBe(false);
  });

  it('prompts sign-in for unauthenticated results and thrown 401s', async () => {
    persistListing.mockResolvedValue({ ok: false, unauthenticated: true });
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().authPromptOpen).toBe(true));
    act(() => t.lp().closeAuthPrompt());
    persistListing.mockRejectedValue(new ApiError({ code: 'x', message: 'm', status: 401 }));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().authPromptOpen).toBe(true));
    act(() => t.lp().closeAuthPrompt());
    persistListing.mockRejectedValue(new Error('boom'));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Could not post your listing. Please try again.', 'error'));
  });

  it('toasts a generic failure', async () => {
    persistListing.mockResolvedValue({ ok: false, error: 'Nope' });
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Nope', 'error'));
    persistListing.mockResolvedValue({ ok: false });
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Could not save your listing. Please try again.', 'error'));
  });

  it('applies server field errors and moves to their step', async () => {
    persistListing.mockResolvedValue({ ok: false, fieldErrors: { price: 'bad' }, fieldErrorStep: 3, unknownFields: ['zzz'], error: 'Fix it' });
    const t = mount();
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().errors.price).toBe('bad'));
    expect(h.scrollToError).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('Fix it', 'error');
    document.body.innerHTML = '<input data-err="price">';
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(h.scrollToError).toHaveBeenCalledWith({ price: 'bad' }));
    document.body.innerHTML = '';
  });
});

describe('edit mode', () => {
  const stored = (extra = {}) => ({
    id: 'L1',
    status: 'approved',
    form: { deal: 'buy', propertyType: 'flat', bhk: '4', locality: 'Baner', title: '4+ BHK Flat in Baner', propLat: 18.5, propLng: 73.8, naSanctioned: true },
    gallery: ['u1', '', 'u2'],
    floorPlan: 'u2',
    ...extra,
  });

  it('loads the listing and exposes edit state', async () => {
    myListing.mockResolvedValue(stored());
    const t = mount('/list-property?edit=L1');
    expect(t.lp().editLoading).toBe(true);
    await waitFor(() => expect(t.lp().editReady).toBe(true));
    expect(myListing).toHaveBeenCalledWith('L1', { id: 'u1', mobile: '9000000001' });
    expect(t.lp().form).toMatchObject({ title: '', pinPlaced: true, naStatus: 'sanctioned' });
    expect(t.lp().photos).toEqual([{ url: 'u1', category: 'Other' }, { url: 'u2', category: 'Floor Plan' }]);
    expect(t.lp().editApproved).toBe(true);
    expect(t.lp().editChanges).toBeTruthy();
    expect(t.lp().claimMode).toBe(false);
    expect(h.draft.opts.enabled).toBe(false);
    expect(loadWizardQuota).not.toHaveBeenCalled();
  });

  it('reports a load error and can retry', async () => {
    myListing.mockResolvedValueOnce(null);
    const t = mount('/list-property?edit=L1');
    await waitFor(() => expect(t.lp().editLoadError).toBe(true));
    myListing.mockResolvedValue(stored());
    act(() => t.lp().retryEditLoad());
    await waitFor(() => expect(t.lp().editReady).toBe(true));
  });

  it('reports an error when the user has no mobile', async () => {
    const t = mount('/list-property?edit=L1', { user: { id: 'u1' } });
    await waitFor(() => expect(t.lp().editLoadError).toBe(true));
    expect(myListing).not.toHaveBeenCalled();
  });

  it('shows the identity guard before saving identity changes', async () => {
    myListing.mockResolvedValue(stored());
    const t = mount('/list-property?edit=L1');
    await waitFor(() => expect(t.lp().editReady).toBe(true));
    act(() => t.lp().set('locality', 'Wakad'));
    act(() => t.lp().changePropertyType('villa'));
    act(() => t.lp().submitProperty());
    expect(t.lp().showIdentityGuard).toBe(true);
    expect(persistListing).not.toHaveBeenCalled();
    act(() => t.lp().setShowIdentityGuard(false));
  });

  it('saves an edit without confetti or quota changes', async () => {
    myListing.mockResolvedValue(stored());
    persistListing.mockResolvedValue({ ok: true, listing: { id: 'L1', status: 'approved' } });
    const t = mount('/list-property?edit=L1');
    await waitFor(() => expect(t.lp().editReady).toBe(true));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().showSuccess).toBe(true));
    expect(persistListing).toHaveBeenCalledWith(expect.objectContaining({ editId: 'L1' }));
    expect(h.formDraft.clear).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('confirms ownership in claim mode', async () => {
    h.ownerState = 'confirm';
    myListing.mockResolvedValue(stored());
    persistListing.mockResolvedValue({ ok: true, listing: { id: 'L1' } });
    confirmOwnerListing.mockResolvedValue({});
    const t = mount('/list-property?edit=L1');
    await waitFor(() => expect(t.lp().claimMode).toBe(true));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.loc().pathname).toBe('/dashboard'));
    expect(h.toast).toHaveBeenCalledWith('listProperty.claim.confirmed', 'success');
  });

  it('keeps the wizard open when claim confirmation fails', async () => {
    h.ownerState = 'confirm';
    myListing.mockResolvedValue(stored());
    persistListing.mockResolvedValue({ ok: true, listing: { id: 'L1' } });
    confirmOwnerListing.mockRejectedValue(new Error('x'));
    const t = mount('/list-property?edit=L1');
    await waitFor(() => expect(t.lp().claimMode).toBe(true));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('listProperty.claim.confirmFailed', 'error'));
    expect(t.loc().pathname).toBe('/list-property');
  });

  it('refuses to submit before the listing has loaded', () => {
    myListing.mockReturnValue(new Promise(() => {}));
    const t = mount('/list-property?edit=L1');
    act(() => t.lp().submitProperty());
    act(() => t.lp().nextStep());
    act(() => t.lp().openResetConfirm());
    expect(persistListing).not.toHaveBeenCalled();
    expect(t.lp().showResetConfirm).toBe(false);
  });
});

describe('reset and leave', () => {
  it('asks before resetting and starts fresh', () => {
    const t = mount();
    act(() => t.lp().openResetConfirm());
    expect(t.lp().showResetConfirm).toBe(true);
    act(() => t.lp().confirmReset());
    expect(h.formDraft.startFresh).toHaveBeenCalled();
    act(() => t.lp().postAnother());
    expect(h.formDraft.startFresh).toHaveBeenCalledTimes(2);
    act(() => t.lp().setShowResetConfirm(false));
  });

  it('guards navigation away from a dirty form', () => {
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    const evt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);

    const link = document.createElement('a');
    link.href = '/dashboard?x=1#top';
    document.body.append(link);
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
    expect(t.lp().showLeaveConfirm).toBe(true);
    act(() => t.lp().confirmLeave());
    expect(h.formDraft.flush).toHaveBeenCalled();
    expect(t.loc().pathname).toBe('/dashboard');
    expect(t.loc().search).toBe('?x=1');
    link.remove();
  });

  it('lets wizard links, modified clicks and external links through', () => {
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    const make = (href, attrs = {}) => {
      const a = document.createElement('a');
      a.href = href;
      Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
      document.body.append(a);
      return a;
    };
    const click = (a, init = {}) => {
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      a.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const wizard = make('/list-property?step=2');
    const external = make('https://example.org/x');
    const blank = make('/dashboard', { target: '_blank' });
    const download = make('/file.pdf', { download: '' });
    const plain = make('/dashboard');
    expect(click(wizard)).toBe(false);
    expect(click(external)).toBe(false);
    expect(click(blank)).toBe(false);
    expect(click(download)).toBe(false);
    expect(click(plain, { ctrlKey: true })).toBe(false);
    expect(click(plain, { button: 1 })).toBe(false);
    document.body.querySelectorAll('a').forEach((a) => a.remove());
    expect(t.lp().showLeaveConfirm).toBe(false);
  });

  it('is inactive after a successful post', async () => {
    persistListing.mockResolvedValue({ ok: true, listing: { id: 'L1' } });
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    await act(async () => { t.lp().submitProperty(); });
    await waitFor(() => expect(t.lp().showSuccess).toBe(true));
    const evt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('treats a busy upload as unsaved work', () => {
    h.media.busy = true;
    mount();
    const evt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe('submitFlatmate', () => {
  const room = () => mount('/list-property?flatmate=1');

  it('creates a room listing', async () => {
    createRoom.mockResolvedValue({ id: 'R1' });
    const t = room();
    act(() => t.lp().set('rentShare', '8000'));
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String), rentShare: '8000', hostRole: 'tenant', photos: [] }));
    expect(t.lp().postedRoom).toEqual({ id: 'R1' });
    expect(t.lp().showSuccess).toBe(true);
    expect(h.formDraft.clear).toHaveBeenCalled();
  });

  it('blocks on validation errors and the first failing step', async () => {
    h.valid.roomPrice = { rentShare: 'required' };
    const t = room();
    pinned(t);
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(t.lp().errors.rentShare).toBe('required');
    expect(t.lp().currentStep).toBe(3);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('flags photos without a URL', async () => {
    h.media.initialPhotos = [{ uploading: true }];
    const t = room();
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(t.lp().errors.photos).toBe('failed');
  });

  it('prompts guests and ignores calls while processing', async () => {
    h.media.processing = true;
    const t = room();
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(createRoom).not.toHaveBeenCalled();
    cleanup();
    h.media.processing = false;
    const guest = mount('/list-property?flatmate=1', { user: null });
    await act(async () => { await guest.lp().submitFlatmate(); });
    expect(guest.lp().authPromptOpen).toBe(true);
  });

  it('shows the server refusal message for 400s and a generic one otherwise', async () => {
    createRoom.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'Too many rooms', status: 400 }));
    const t = room();
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(h.toast).toHaveBeenLastCalledWith('Too many rooms', 'error');
    createRoom.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(h.toast).toHaveBeenLastCalledWith('Could not post your flatmate listing. Please try again.', 'error');
    expect(t.lp().posting).toBe(false);
  });

  it('updates an existing room and returns to the dashboard', async () => {
    h.roomEdit = { status: 'ready', baseline: { societyId: '' }, photoUrls: [], storedTitle: 'Stored', retry: vi.fn() };
    updateRoom.mockResolvedValue({});
    const t = mount('/list-property?flatmate=1&editRoom=r1');
    expect(t.lp()).toMatchObject({ editRoomId: 'r1', editReady: true });
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(updateRoom).toHaveBeenCalledWith('r1', expect.objectContaining({ title: expect.any(String) }));
    expect(updateRoom.mock.calls[0][1]).not.toHaveProperty('clearSociety');
    await waitFor(() => expect(t.loc().pathname).toBe('/dashboard'));
    expect(h.toast).toHaveBeenCalledWith('listProperty.edit.roomSaved', 'success');
  });

  it('clears or sets the society on a room edit and reports save failures', async () => {
    h.roomEdit = { status: 'ready', baseline: { societyId: 's1' }, photoUrls: [], storedTitle: '', retry: vi.fn() };
    updateRoom.mockRejectedValue(new Error('x'));
    const t = mount('/list-property?flatmate=1&editRoom=r1');
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(updateRoom.mock.calls[0][1]).toMatchObject({ clearSociety: true, title: undefined });
    expect(h.toast).toHaveBeenLastCalledWith('listProperty.edit.roomSaveFailed', 'error');
    act(() => t.lp().set('societyId', 's2'));
    await act(async () => { await t.lp().submitFlatmate(); });
    expect(updateRoom.mock.calls[1][1]).toMatchObject({ societyId: 's2' });
  });

  it('retries room loads through the room editor', () => {
    h.roomEdit = { status: 'error', baseline: null, photoUrls: [], storedTitle: '', retry: vi.fn() };
    const t = mount('/list-property?flatmate=1&editRoom=r1');
    expect(t.lp().editLoadError).toBe(true);
    act(() => t.lp().retryEditLoad());
    expect(h.roomEdit.retry).toHaveBeenCalled();
  });
});

describe('owner and draft handling', () => {
  it('toasts a failed edit load when finalizing early', async () => {
    myListing.mockReturnValue(new Promise(() => {}));
    const t = mount('/list-property?edit=L1');
    expect(t.lp().editReady).toBe(false);
  });

  it('restores saved drafts and strips transient fields', () => {
    const t = mount();
    const { opts, restore } = h.draft;
    expect(opts.omit).toContain('agreementDoc');
    const saved = {
      __currentStep: 3,
      __photos: [{ url: 'https://cdn/a.jpg', category: 'Kitchen' }, { url: 'blob:x' }, 'https://cdn/b.jpg', null],
      __owner: 'u1',
      __rentMode: 'flatmate',
      __documents: [1],
      locality: 'Baner',
      deal: 'buy',
    };
    const fields = opts.onRestore(saved);
    expect(h.media.restore).toHaveBeenCalledWith([{ url: 'https://cdn/a.jpg', category: 'Kitchen' }, { url: 'https://cdn/b.jpg', category: 'Other' }]);
    expect(fields).toEqual({ locality: '', localitySlug: '', deal: 'rent' });
    expect(opts.onRestore({ __owner: 'someone-else', deal: 'buy' })).toBeNull();
    act(() => restore({ facing: 'Park Facing', overlooking: '' }));
    expect(t.lp().form).toMatchObject({ facing: '', overlooking: 'Garden' });
    act(() => restore((prev) => ({ ...prev, facing: 'Road Facing', overlooking: '' })));
    expect(t.lp().form).toMatchObject({ overlooking: 'Main Road' });
  });

  it('keeps guest work after signing in', async () => {
    const t = mount('/list-property', { user: null });
    act(() => t.lp().set('society', 'Sky'));
    h.auth = { ...h.auth, user: USER };
    t.view.rerender();
    expect(t.lp().form.society).toBe('Sky');
    expect(h.draft.key).toContain('u1');
    const saved = { __owner: undefined, society: 'Other' };
    t.view.rerender();
    expect(h.draft.opts.onRestore(saved)).toBeNull();
  });

  it('resets the wizard when a different account signs in', async () => {
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    h.auth = { ...h.auth, user: { id: 'u2', mobile: '9000000002' } };
    t.view.rerender();
    await waitFor(() => expect(h.media.reset).toHaveBeenCalled());
    expect(h.formDraft.flush).toHaveBeenCalled();
    expect(t.lp().form.society).toBe('');
    expect(t.lp()).toMatchObject({ currentStep: 1, showSuccess: false, posting: false });
  });

  it('keeps the form when the session ends for the same account', () => {
    const t = mount();
    act(() => t.lp().set('society', 'Sky'));
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    h.auth = { ...h.auth, user: null };
    t.view.rerender();
    expect(t.lp().form.society).toBe('Sky');
    expect(h.media.reset).not.toHaveBeenCalled();
  });
});
