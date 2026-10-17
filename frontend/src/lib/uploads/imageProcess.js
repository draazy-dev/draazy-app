import heicDecoderUrl from 'heic-to/csp?url';
import { MAX_UPLOAD_BYTES } from './policy.js';
import { checkImageDimensions, MAX_IMAGE_PIXELS } from './imageDimensions.js';
import { photoLook } from './photoLook.js';

const MAX_EDGE = 2560;
/* A scan degraded past reading is worse than one the owner is told to retake, so documents stop at a
   legibility floor and `prepareUpload` refuses them; the photo floor encodes orders under the cap. */
const MIN_PHOTO_EDGE = 480;
const PHOTO = { minEdge: MIN_PHOTO_EDGE, qualities: [0.92, 0.8, 0.68, 0.56, 0.44, 0.35] };
const DOCUMENT = { minEdge: 1600, qualities: [0.92, 0.82, 0.72, 0.62] };

const release = (canvas) => { canvas.width = 1; canvas.height = 1; };

/* Workers get OffscreenCanvas; a browser without it runs this module on the main thread with a DOM canvas. */
const createCanvas = (width, height) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
};
const encodeJpeg = (canvas, quality) => (canvas.convertToBlob
  ? canvas.convertToBlob({ type: 'image/jpeg', quality })
  : new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', quality)));

const LOOK_EDGE = 480;

function readLook(source) {
  const probe = scaleTo(source, LOOK_EDGE);
  try {
    return photoLook(probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data, probe.width);
  } finally {
    release(probe);
  }
}

function scaleTo(image, edge) {
  const scale = Math.min(1, edge / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const context = canvas.getContext('2d');
  // White preserves the appearance of transparent scans when converting them to JPEG.
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Takes ownership of `source`: the canvas is released on both the return and the throw path. */
async function compressUnderCap(source, { minEdge, qualities }) {
  let frame = source;
  try {
    for (;;) {
      let smallest;
      for (const quality of qualities) {
        smallest = await encodeJpeg(frame, quality);
        if (smallest.size < MAX_UPLOAD_BYTES) return smallest;
      }
      const edge = Math.max(frame.width, frame.height);
      if (edge <= minEdge) return smallest;
      if (frame !== source) release(frame);
      /* JPEG bytes track pixel count, so the round that just failed predicts the next edge; a fixed
         step would take a dozen rounds. Resampled from `source`, never from an already-shrunk frame. */
      const predicted = Math.round(edge * Math.min(0.8, Math.sqrt((MAX_UPLOAD_BYTES * 0.8) / smallest.size)));
      frame = scaleTo(source, Math.max(minEdge, predicted));
    }
  } finally {
    if (frame !== source) release(frame);
    release(source);
  }
}

export const imageErrorMessage = (error) => {
  const message = error?.message || '';
  return /48 megapixels|480 px/.test(message) ? message : 'Could not decode this photo. Export a single still image as JPEG or PNG and try again.';
};

export async function processImage(file, type, document) {
  let bitmap;
  try {
    await checkImageDimensions(file, type);
    if (type === 'image/heic') {
      // Keep the LGPL decoder independently replaceable; the CSP build does not require eval.
      const { heicTo } = await import(/* @vite-ignore */ heicDecoderUrl);
      bitmap = await heicTo({ blob: file, type: 'bitmap' });
    } else bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) throw new Error('Choose an image no larger than 48 megapixels.');
    if (!document && Math.min(bitmap.width, bitmap.height) < MIN_PHOTO_EDGE) {
      throw new Error('Use a photo at least 480 px on its shorter side.');
    }
    // Up to 48 MP of decoded pixels: release the bitmap before the first encode, not after the last.
    const source = scaleTo(bitmap, MAX_EDGE);
    bitmap.close(); bitmap = null;
    const look = document ? null : readLook(source);
    return { blob: await compressUnderCap(source, document ? DOCUMENT : PHOTO), look };
  } finally {
    bitmap?.close();
  }
}
