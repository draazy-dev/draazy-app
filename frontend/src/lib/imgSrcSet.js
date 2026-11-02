const DEFAULT_WIDTHS = [320, 480, 640, 960];

export function srcSetFor(url, widths = DEFAULT_WIDTHS) {
  if (typeof url !== 'string' || !url) return undefined;
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return undefined;

  const base = url.slice(0, qIdx);
  let params;
  try {
    params = new URLSearchParams(url.slice(qIdx + 1));
  } catch {
    return undefined;
  }
  if (!params.has('w')) return undefined;

  return widths
    .map((w) => {
      const next = new URLSearchParams(params);
      next.set('w', String(w));
      return `${base}?${next.toString()} ${w}w`;
    })
    .join(', ');
}

export const CARD_SIZES = '(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 45vw, 320px';
export const GALLERY_SIZES = '(max-width: 639px) 100vw, 60vw';

const UPLOADED_PHOTO = /\/photos\/(?:[0-9a-f]{16}|[0-9a-f-]{36})\/[0-9a-f-]{36}(?:-[0-9a-f]{16})?$/;

const isUploaded = (url) => typeof url === 'string' && UPLOADED_PHOTO.test(url);

export function cardSrcSet(url) {
  return isUploaded(url) ? `${url}.w480.webp 480w, ${url}.w960.webp 960w` : srcSetFor(url);
}

// imageProcess.js caps the uploaded original's long edge at 2560.
export function gallerySrcSet(url) {
  return isUploaded(url) ? `${cardSrcSet(url)}, ${url} 2560w` : srcSetFor(url);
}
