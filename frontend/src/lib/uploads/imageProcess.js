import heicDecoderUrl from 'heic-to/csp?url';
import { MAX_UPLOAD_BYTES } from './policy.js';
import { checkImageDimensions, MAX_IMAGE_PIXELS } from './imageDimensions.js';
import { photoLook } from './photoLook.js';
import { UserError } from '../userError.js';

const MAX_EDGE = 2560;
const MIN_PHOTO_EDGE = 480;
const PHOTO = { minEdge: MIN_PHOTO_EDGE, qualities: [0.92, 0.8, 0.68, 0.56, 0.44, 0.35] };
const DOCUMENT = { minEdge: 1600, qualities: [0.92, 0.82, 0.72, 0.62] };

const release = (canvas) => { canvas.width = 1; canvas.height = 1; };

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
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function compressUnderCap(source, { minEdge, qualities }, maxBytes) {
  let frame = source;
  try {
    for (;;) {
      let smallest;
      for (const quality of qualities) {
        smallest = await encodeJpeg(frame, quality);
        if (smallest.size < maxBytes) return smallest;
      }
      const edge = Math.max(frame.width, frame.height);
      if (edge <= minEdge) return smallest;
      if (frame !== source) release(frame);
      const predicted = Math.round(edge * Math.min(0.8, Math.sqrt((maxBytes * 0.8) / smallest.size)));
      frame = scaleTo(source, Math.max(minEdge, predicted));
    }
  } finally {
    if (frame !== source) release(frame);
    release(source);
  }
}

export const imageErrorMessage = (error) => (error instanceof UserError
  ? error.message
  : 'Could not decode this photo. Export a single still image as JPEG or PNG and try again.');

export async function processImage(file, type, document, maxBytes = MAX_UPLOAD_BYTES) {
  let bitmap;
  try {
    await checkImageDimensions(file, type);
    if (type === 'image/heic') {
      const { heicTo } = await import(/* @vite-ignore */ heicDecoderUrl);
      bitmap = await heicTo({ blob: file, type: 'bitmap' });
    } else bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) throw new UserError('Choose an image no larger than 48 megapixels.');
    if (!document && Math.min(bitmap.width, bitmap.height) < MIN_PHOTO_EDGE) {
      throw new UserError('Use a photo at least 480 px on its shorter side.');
    }
    const source = scaleTo(bitmap, MAX_EDGE);
    bitmap.close(); bitmap = null;
    const look = document ? null : readLook(source);
    return { blob: await compressUnderCap(source, document ? DOCUMENT : PHOTO, maxBytes), look };
  } finally {
    bitmap?.close();
  }
}
