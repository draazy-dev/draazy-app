import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../../../../src/services/photoService.js', () => ({ uploadPhoto: vi.fn() }));
vi.mock('../../../../../src/lib/uploads/usePhotoLimit.js', () => ({ default: () => 3 }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({
  getFlatmateDetail: vi.fn(),
  getOwnerHomePrefill: vi.fn(),
}));
vi.mock('../../../../../src/services/managedService.js', () => ({ getManaged: vi.fn() }));

import { uploadPhoto } from '../../../../../src/services/photoService.js';
import { getFlatmateDetail, getOwnerHomePrefill } from '../../../../../src/services/flatmateService.js';
import { getManaged } from '../../../../../src/services/managedService.js';
import useListingMedia from '../../../../../src/pages/consumer/list-property/useListingMedia.js';
import useRoomEdit, {
  roomToForm,
  managedToForm,
  useHomePrefill,
} from '../../../../../src/pages/consumer/list-property/useRoomEdit.js';
import { initialForm } from '../../../../../src/pages/consumer/list-property/initialForm.js';

afterEach(cleanup);

const file = (name) => new File(['x'], name, { type: 'image/jpeg' });
const pick = (...files) => ({ target: { files, value: 'x' } });

describe('useListingMedia', () => {
  let setErrors;
  let created;
  let revoked;

  beforeEach(() => {
    setErrors = vi.fn();
    created = [];
    revoked = [];
    uploadPhoto.mockReset();
    let n = 0;
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:p${n++}`;
      created.push(u);
      return u;
    });
    URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
  });

  const setup = () => renderHook(() => useListingMedia({ setErrors }));

  it('uploads picked files and replaces previews with remote URLs', async () => {
    uploadPhoto.mockImplementation(async (f) => ({ url: `https://cdn/${f.name}`, look: { ok: true } }));
    const { result } = setup();
    const input = pick(file('a.jpg'), file('b.jpg'));
    await act(() => result.current.handlePhotoUpload(input));
    expect(input.target.value).toBe('');
    expect(result.current.photos).toEqual([
      { id: expect.any(String), url: 'https://cdn/a.jpg', category: 'Other', look: { ok: true } },
      { id: expect.any(String), url: 'https://cdn/b.jpg', category: 'Other', look: { ok: true } },
    ]);
    expect(revoked).toEqual(expect.arrayContaining(created));
    expect(result.current.mediaStatus).toBe('');
    expect(result.current.isMediaBusy).toBe(false);
    expect(result.current.isMediaProcessing()).toBe(false);
    expect(result.current.maxPhotos).toBe(3);
  });

  it('ignores an empty selection', async () => {
    const { result } = setup();
    await act(() => result.current.handlePhotoUpload({ target: { files: [], value: '' } }));
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(result.current.photos).toEqual([]);
  });

  it('caps the batch to the photo limit and reports the skipped count', async () => {
    uploadPhoto.mockResolvedValue({ url: 'https://cdn/x.jpg', look: null });
    const { result } = setup();
    await act(() => result.current.handlePhotoUpload(pick(file('1'), file('2'), file('3'), file('4'), file('5'))));
    expect(result.current.photos).toHaveLength(3);
    const updater = setErrors.mock.calls.map(([fn]) => fn({})).find((e) => e.photos);
    expect(updater).toEqual({ photos: 'capped:2' });
  });

  it('marks a failed upload with an error and lets it retry', async () => {
    uploadPhoto.mockRejectedValueOnce(Object.assign(new Error('boom'), { retryable: false }));
    const { result } = setup();
    await act(() => result.current.handlePhotoUpload(pick(file('a.jpg'))));
    expect(result.current.photos[0]).toMatchObject({ uploading: false, error: 'Upload failed. Please try again.', retryable: false });
    uploadPhoto.mockResolvedValueOnce({ url: 'https://cdn/a.jpg', look: null });
    await act(() => result.current.retryPhoto(0));
    expect(result.current.photos[0]).toMatchObject({ url: 'https://cdn/a.jpg', category: 'Other' });
    await act(() => result.current.retryPhoto(5));
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
  });

  it('refuses a second operation while one is running', async () => {
    let release;
    uploadPhoto.mockImplementation(() => new Promise((res) => { release = res; }));
    const { result } = setup();
    let first;
    act(() => { first = result.current.handlePhotoUpload(pick(file('a.jpg'))); });
    expect(result.current.isMediaProcessing()).toBe(true);
    await act(() => result.current.handlePhotoUpload(pick(file('b.jpg'))));
    expect(result.current.photos).toHaveLength(1);
    expect(result.current.mediaStatus).toMatch(/^Uploading photo 1 of 1/);
    await act(async () => { release({ url: 'https://cdn/a.jpg', look: null }); await first; });
    expect(result.current.photos[0].url).toBe('https://cdn/a.jpg');
  });

  it('removes, recategorises, moves and covers photos', async () => {
    const { result } = setup();
    act(() => result.current.setPhotos([
      { id: '1', url: 'u1', previewUrl: 'blob:keep' },
      { id: '2', url: 'u2' },
      { id: '3', url: 'u3' },
    ]));
    act(() => result.current.setPhotoCategory(1, 'Bedroom'));
    expect(result.current.photos[1].category).toBe('Bedroom');
    act(() => result.current.setPhotoCategory('__cover', 2));
    expect(result.current.photos.map((p) => p.url)).toEqual(['u3', 'u1', 'u2']);
    act(() => result.current.setPhotoCategory('__move', { from: 0, to: 99 }));
    expect(result.current.photos.map((p) => p.url)).toEqual(['u1', 'u2', 'u3']);
    act(() => result.current.removePhoto(0));
    expect(revoked).toContain('blob:keep');
    expect(result.current.photos.map((p) => p.url)).toEqual(['u2', 'u3']);
  });

  it('retries a photo through the __retry pseudo-category', async () => {
    uploadPhoto.mockRejectedValueOnce(new Error('x'));
    const { result } = setup();
    await act(() => result.current.handlePhotoUpload(pick(file('a.jpg'))));
    uploadPhoto.mockResolvedValueOnce({ url: 'https://cdn/ok.jpg', look: null });
    await act(async () => { result.current.setPhotoCategory('__retry', 0); });
    await waitFor(() => expect(result.current.photos[0].url).toBe('https://cdn/ok.jpg'));
  });

  it('resets media and aborts the running operation', async () => {
    uploadPhoto.mockImplementation((f, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const { result } = setup();
    let pending;
    act(() => { pending = result.current.handlePhotoUpload(pick(file('a.jpg'))); });
    act(() => {
      result.current.setVideo({ id: 'v' });
      result.current.setVideoName('clip');
    });
    act(() => result.current.resetMedia());
    await act(async () => { await pending; });
    expect(result.current).toMatchObject({ photos: [], video: null, videoName: '', mediaStatus: '' });
    expect(result.current.isMediaProcessing()).toBe(false);
  });

  it('aborts and revokes previews on unmount', async () => {
    uploadPhoto.mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = setup();
    act(() => { void result.current.handlePhotoUpload(pick(file('a.jpg'))); });
    unmount();
    expect(revoked).toEqual(created);
  });

  describe('restorePhotos', () => {
    let images;
    let outcomes;

    beforeEach(() => {
      images = [];
      outcomes = {};
      vi.stubGlobal('Image', class {
        constructor() { images.push(this); }
        set src(url) {
          queueMicrotask(() => (outcomes[url] ? this.onload() : this.onerror()));
        }
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('keeps photos whose URLs load', async () => {
      outcomes = { a: true, b: true };
      const { result } = setup();
      act(() => result.current.restorePhotos([{ url: 'a' }, { url: 'b' }]));
      await waitFor(() => expect(images).toHaveLength(2));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.photos).toHaveLength(2);
      expect(setErrors).not.toHaveBeenCalled();
    });

    it('drops photos that stay missing after a retry while online', async () => {
      vi.useFakeTimers();
      outcomes = { a: true, b: false };
      const { result } = setup();
      act(() => result.current.restorePhotos([{ url: 'a' }, { url: 'b' }]));
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(result.current.photos).toEqual([{ url: 'a' }]);
      const updated = setErrors.mock.calls.map(([fn]) => fn({})).find((e) => e.photos);
      expect(updated).toEqual({ photos: 'expired:1' });
      vi.useRealTimers();
    });

    it('does nothing when offline or superseded', async () => {
      vi.useFakeTimers();
      outcomes = { b: false };
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const { result } = setup();
      act(() => result.current.restorePhotos([{ url: 'b' }]));
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(result.current.photos).toEqual([{ url: 'b' }]);
      online.mockReturnValue(true);
      act(() => result.current.restorePhotos([{ url: 'b' }]));
      act(() => result.current.resetMedia());
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(result.current.photos).toEqual([]);
      expect(setErrors).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});

describe('roomToForm', () => {
  it('maps a minimal room onto the form defaults', () => {
    const form = roomToForm({});
    expect(form).toMatchObject({ deal: 'rent', roomType: '', lookingFor: 'any', foodPref: 'any', hostRole: 'owner', pinPlaced: false, title: '', ownerConsent: false });
    expect(form.balconies).toBe(initialForm.balconies);
    expect(form.propLat).toBe(initialForm.propLat);
  });

  it('maps a fully populated room', () => {
    const form = roomToForm({
      homeTypeLabel: 'Villa',
      bhk: 3,
      roomType: 'Private room',
      lat: 18.5,
      lng: 73.8,
      budget: 9000,
      deposit: 0,
      gender: 'female',
      food: 'veg',
      hostRole: 'tenant',
      agreementDeclared: true,
      title: 'Custom title',
      occupants: 2,
      society: 'Sky',
      host: { details: { bathrooms: 2, balconies: 0, floor: '3', totalFloors: 9, furniture: ['bed'], tower: 'B', pincode: '411045' }, agreementDoc: { name: 'x' }, ownerConsentMobile: '9', attachedPropertyId: 'P1' },
    });
    expect(form).toMatchObject({
      propertyType: expect.any(String),
      bhk: '3',
      bathrooms: '2',
      balconies: '0',
      floor: '3',
      totalFloors: '9',
      pinPlaced: true,
      propLat: 18.5,
      rentShare: '9000',
      deposit: '0',
      lookingFor: 'female',
      foodPref: 'veg',
      ownerConsent: true,
      agreementDeclared: true,
      ownerConsentMobile: '9',
      attachedPropertyId: 'P1',
      title: 'Custom title',
      occupants: '2',
      tower: 'B',
    });
    expect(form.agreementDoc).toEqual({ name: 'x' });
  });
});

describe('managedToForm', () => {
  it('builds a rent form with a valid lease end', () => {
    const farFuture = '2099-01-01';
    const form = managedToForm({ deal: 'rent', type: 'Villa', bhkNum: 7, price: 30000, deposit: 90000, area: 1200, leaseEnd: farFuture, furnishing: 'Semi-furnished', locality: 'Baner', society: 'S' });
    expect(form).toMatchObject({ deal: 'rent', propertyType: 'villa', bhk: '5', monthlyRent: '30000', deposit: '90000', carpetArea: '1200', furnishing: 'semi', locality: 'Baner' });
    expect(form.availableFrom).toBe('');
  });

  it('sets availability right after a lease ending soon', () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const iso = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    expect(managedToForm({ deal: 'rent', leaseEnd: iso }).availableFrom).toBe(iso);
    expect(managedToForm({ deal: 'rent', leaseEnd: '2000-01-01' }).availableFrom).toBe('');
  });

  it('builds a buy form and maps property type and furnishing', () => {
    const form = managedToForm({ deal: 'sell', type: 'Open Plot', price: 5000000, furnishing: 'Furnished' });
    expect(form).toMatchObject({ deal: 'buy', propertyType: 'openplot', price: '5000000', furnishing: 'furnished', bhk: '' });
    expect(managedToForm({ type: 'Shop' }).propertyType).toBe('commercial');
    expect(managedToForm({ type: 'Farm House' }).propertyType).toBe('farmland');
    expect(managedToForm({ type: 'Row house' }).propertyType).toBe('independent');
    expect(managedToForm({ furnishing: 'fully' }).furnishing).toBe('furnished');
    expect(managedToForm({ furnishing: 'none' }).furnishing).toBe(initialForm.furnishing);
  });
});

describe('useHomePrefill', () => {
  beforeEach(() => {
    getManaged.mockReset();
    getOwnerHomePrefill.mockReset();
  });

  it('does nothing without a home or permission', () => {
    const setForm = vi.fn();
    renderHook(() => useHomePrefill({ homeId: '', canLoad: true, setForm }));
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: false, setForm }));
    expect(getManaged).not.toHaveBeenCalled();
  });

  it('prefills from the managed home', async () => {
    getManaged.mockResolvedValue({ deal: 'rent', price: 20000, type: 'Flat' });
    const setForm = vi.fn();
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: true, setForm }));
    await waitFor(() => expect(setForm).toHaveBeenCalledWith(expect.objectContaining({ monthlyRent: '20000' })));
  });

  it('merges the source room fields and tolerates its failure', async () => {
    getManaged.mockResolvedValue({ deal: 'rent', price: 1, sourceRoomId: 'r1' });
    getOwnerHomePrefill.mockResolvedValue({ bhk: 2, facing: 'East', overlooking: 'Park', society: 'Merged' });
    const setForm = vi.fn();
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: true, setForm }));
    await waitFor(() => expect(setForm).toHaveBeenCalled());
    expect(setForm.mock.calls[0][0]).toMatchObject({ society: 'Merged', facing: 'East', overlooking: 'Park' });
    cleanup();
    getOwnerHomePrefill.mockRejectedValue(new Error('x'));
    const setForm2 = vi.fn();
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: true, setForm: setForm2 }));
    await waitFor(() => expect(setForm2).toHaveBeenCalled());
  });

  it('skips when the record is missing or the lookup throws', async () => {
    getManaged.mockResolvedValueOnce(null);
    const setForm = vi.fn();
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: true, setForm }));
    await waitFor(() => expect(getManaged).toHaveBeenCalled());
    cleanup();
    getManaged.mockRejectedValueOnce(new Error('x'));
    renderHook(() => useHomePrefill({ homeId: 'h', canLoad: true, setForm }));
    await waitFor(() => expect(getManaged).toHaveBeenCalledTimes(2));
    expect(setForm).not.toHaveBeenCalled();
  });
});

describe('useRoomEdit', () => {
  const setForm = vi.fn();
  const setPhotos = vi.fn();
  const args = (extra = {}) => ({ roomId: 'r1', canLoad: true, setForm, setPhotos, ...extra });

  beforeEach(() => {
    setForm.mockReset();
    setPhotos.mockReset();
    getFlatmateDetail.mockReset();
  });

  it('stays idle without a room id', () => {
    const { result } = renderHook(() => useRoomEdit(args({ roomId: '' })));
    expect(result.current.status).toBe('idle');
    expect(getFlatmateDetail).not.toHaveBeenCalled();
  });

  it('loads an owned room into the form and photos', async () => {
    getFlatmateDetail.mockResolvedValue({ owned: true, item: { title: 'Mine', roomType: 'Private room', photos: ['a', '', 'b'] } });
    const { result } = renderHook(() => useRoomEdit(args()));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getFlatmateDetail).toHaveBeenCalledWith('room', 'r1');
    expect(setForm).toHaveBeenCalledWith(expect.objectContaining({ roomType: 'Private room' }));
    expect(setPhotos).toHaveBeenCalledWith([{ url: 'a', category: 'Other' }, { url: 'b', category: 'Other' }]);
    expect(result.current).toMatchObject({ photoUrls: ['a', 'b'], storedTitle: 'Mine' });
  });

  it('errors for rooms that are not editable and allows retry', async () => {
    getFlatmateDetail.mockResolvedValue({ owned: false, item: {} });
    const { result } = renderHook(() => useRoomEdit(args()));
    await waitFor(() => expect(result.current.status).toBe('error'));
    getFlatmateDetail.mockResolvedValue({ owned: true, item: { photos: [] } });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    getFlatmateDetail.mockResolvedValue({ owned: true, item: { propertyId: 'P' } });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('errors when loading fails', async () => {
    getFlatmateDetail.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useRoomEdit(args()));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
