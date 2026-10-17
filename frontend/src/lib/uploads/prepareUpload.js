import { MAX_UPLOAD_BYTES, uploadType } from './policy.js';

const PROCESSING_TIMEOUT_MS = 30_000;
const TOO_SLOW = 'This file took too long to process. Try a smaller original.';
const TOO_BIG = 'This file cannot fit under 1 MB at the supported quality. Please choose a smaller original.';

const fileFromBlob = (file, type, blob) => {
  const name = type === 'application/pdf' ? file.name : file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
};

/* Without OffscreenCanvas the image worker cannot draw, so the same pipeline runs on the main thread. */
async function processImageOnMainThread(file, type, document, signal) {
  const { processImage, imageErrorMessage } = await import('./imageProcess.js');
  signal?.throwIfAborted();
  let result;
  let timer;
  const timedOut = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(TOO_SLOW)), PROCESSING_TIMEOUT_MS); });
  try {
    result = await Promise.race([processImage(file, type, document), timedOut]);
  } catch (error) {
    throw new Error(error?.message === TOO_SLOW ? TOO_SLOW : imageErrorMessage(error));
  } finally {
    clearTimeout(timer);
  }
  signal?.throwIfAborted();
  if (!result.blob.size || result.blob.size >= MAX_UPLOAD_BYTES) throw new Error(TOO_BIG);
  return { file: fileFromBlob(file, type, result.blob), look: result.look };
}
function processInWorker(file, type, document, signal) {
  return new Promise((resolve, reject) => {
    const worker = type === 'application/pdf'
      ? new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' })
      : new Worker(new URL('./image.worker.js', import.meta.url), { type: 'module' });
    const finish = (error, result, look = null) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve({ file: result, look });
    };
    const abort = () => finish(new DOMException('Upload preparation cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error(TOO_SLOW)), PROCESSING_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('Could not process this file. Try another supported original.'));
    worker.onmessage = ({ data }) => {
      if (data.error) finish(new Error(data.error));
      else if (data.unchanged) finish(null, file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified }));
      else if (!(data.blob instanceof Blob) || !data.blob.size || data.blob.size >= MAX_UPLOAD_BYTES) {
        finish(new Error(TOO_BIG));
      } else {
        finish(null, fileFromBlob(file, type, data.blob), data.look);
      }
    };
    if (signal?.aborted) abort(); else worker.postMessage({ file, type, document });
  });
}

/** Issuer-original PDFs must never enter a rewriting/compression path. `withLook` also resolves a dark/blurry hint. */
export async function prepareUpload(file, { document = false, originalPdf = false, withLook = false, signal } = {}) {
  signal?.throwIfAborted();
  const type = await uploadType(file, document);
  signal?.throwIfAborted();
  if (originalPdf && type !== 'application/pdf') {
    throw new Error('Upload the original MSEDCL PDF, not a photo or scan.');
  }
  if (originalPdf && file.size >= MAX_UPLOAD_BYTES) {
    throw new Error('The original PDF must be under 1 MB. Keep it unchanged; use a current property-tax receipt instead if it is too large.');
  }
  const prepared = type !== 'application/pdf' && typeof OffscreenCanvas === 'undefined'
    ? await processImageOnMainThread(file, type, document, signal)
    : await processInWorker(file, type, document, signal);
  return withLook ? prepared : prepared.file;
}