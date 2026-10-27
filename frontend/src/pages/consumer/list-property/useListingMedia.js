import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadPhoto } from '../../../services/photoService.js';
import usePhotoLimit from '../../../lib/uploads/usePhotoLimit.js';

const MAX_PARALLEL_PHOTO_UPLOADS = 3;
const moveItem = (items, from, to) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
};

export default function useListingMedia({ setErrors }) {
  const maxPhotos = usePhotoLimit();
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [mediaStatus, setMediaStatus] = useState('');
  const operation = useRef(null);
  const uploadSeq = useRef(0);
  const restoreSeq = useRef(0);
  const previewUrls = useRef(new Set());
  useEffect(() => () => {
    operation.current?.abort();
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  const setError = (key, msg) => setErrors((prev) => ({ ...prev, [key]: msg }));
  const clearError = (key) => setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  const start = () => {
    if (operation.current) return null;
    const controller = new AbortController();
    operation.current = controller;
    return controller;
  };
  const finish = (controller) => {
    if (!controller.signal.aborted) { operation.current = null; setMediaStatus(''); }
  };

  const uploadPhotoSlot = async (slot, controller) => {
    setPhotos((prev) => prev.map((photo) => (photo.id === slot.id ? { ...photo, uploading: true, error: '' } : photo)));
    try {
      const { url, look } = await uploadPhoto(slot.file, { signal: controller.signal });
      controller.signal.throwIfAborted();
      setPhotos((prev) => prev.map((photo) => {
        if (photo.id !== slot.id) return photo;
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl);
          previewUrls.current.delete(photo.previewUrl);
        }
        return { id: photo.id, url, category: photo.category || 'Other', look };
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhotos((prev) => prev.map((photo) => (photo.id === slot.id
        ? { ...photo, uploading: false, error: error.message || 'Upload failed. Please try again.', retryable: error.retryable !== false }
        : photo)));
    }
  };

  const handlePhotoUpload = async (e) => {
    const input = e.target;
    const picked = Array.from(input.files || []);
    input.value = '';
    if (!picked.length) return;
    const controller = start();
    if (!controller) return;
    const available = Math.max(0, maxPhotos - photos.length);
    const batch = picked.slice(0, available);
    const skipped = picked.length - batch.length;
    clearError('photos');
    const slots = batch.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        id: `photo-${Date.now()}-${uploadSeq.current++}`,
        file,
        previewUrl,
        category: 'Other',
        uploading: true,
        error: '',
      };
    });
    setPhotos((prev) => [...prev, ...slots]);
    try {
      let done = 0;
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_PHOTO_UPLOADS, slots.length) }, async () => {
        for (;;) {
          const slot = slots[cursor];
          cursor += 1;
          if (!slot) return;
          setMediaStatus(`Uploading photo ${done + 1} of ${slots.length}…`);
          await uploadPhotoSlot(slot, controller);
          done += 1;
        }
      }));
      if (skipped) setError('photos', `capped:${skipped}`);
    } finally { finish(controller); }
  };
  const retryPhoto = async (i) => {
    const slot = photos[i];
    if (!slot?.file) return;
    const controller = start();
    if (!controller) return;
    clearError('photos');
    setMediaStatus(`Retrying ${slot.file.name}…`);
    try { await uploadPhotoSlot(slot, controller); } finally { finish(controller); }
  };
  const removePhoto = (i) => setPhotos((prev) => {
    if (prev[i]?.previewUrl) {
      URL.revokeObjectURL(prev[i].previewUrl);
      previewUrls.current.delete(prev[i].previewUrl);
    }
    return prev.filter((_, idx) => idx !== i);
  });
  const setPhotoCategory = (i, cat) => {
    if (i === '__retry') { void retryPhoto(cat); return; }
    setPhotos((prev) => {
      if (i === '__move') return moveItem(prev, cat.from, cat.to);
      if (i === '__cover') return moveItem(prev, cat, 0);
      return prev.map((p, idx) => idx === i ? { ...p, category: cat } : p);
    });
  };
  const resetMedia = () => {
    restoreSeq.current += 1;
    operation.current?.abort();
    operation.current = null;
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setPhotos([]);
    setVideo(null);
    setVideoName('');
    setMediaStatus('');
  };
  // Swept after a week, a draft can outlive its photos. An <img> probe (CSP keeps the bucket out of connect-src)
  // can't tell a 404 from a blip, so only what fails twice while online is dropped.
  const restorePhotos = useCallback((saved) => {
    const seq = ++restoreSeq.current;
    setPhotos(saved);
    const loads = (url) => new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = url;
    });
    const missing = async (urls) => (await Promise.all(urls.map(loads))).flatMap((ok, i) => (ok ? [] : [urls[i]]));
    (async () => {
      let gone = await missing(saved.map(({ url }) => url));
      if (gone.length) {
        await new Promise((resolve) => { setTimeout(resolve, 2000); });
        gone = await missing(gone);
      }
      if (!gone.length || !navigator.onLine || seq !== restoreSeq.current) return;
      const dead = new Set(gone);
      setPhotos((prev) => prev.filter((photo) => !dead.has(photo.url)));
      setErrors((prev) => ({ ...prev, photos: `expired:${dead.size}` }));
    })();
  }, [setErrors]);

  return {
    photos, setPhotos,
    video, setVideo,
    videoName, setVideoName,
    mediaStatus, isMediaBusy: !!mediaStatus, isMediaProcessing: () => !!operation.current, maxPhotos,
    handlePhotoUpload, removePhoto, setPhotoCategory, retryPhoto, resetMedia, restorePhotos,
  };
}
