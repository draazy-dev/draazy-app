const VIEWABLE_DATA_URL = /^data:(image\/(?!svg\b)[a-z0-9.+-]+|application\/pdf);base64,/i;

const DEV_STORAGE_STUB = /^https?:\/\/mock\.storage\.local\b/i;

export const isViewableDoc = (url) => {
  const u = url || '';
  if (VIEWABLE_DATA_URL.test(u)) return true;
  const sameOriginPath = /^\/(?![/\\])/.test(u);
  return (sameOriginPath || /^https?:\/\//i.test(u)) && !DEV_STORAGE_STUB.test(u);
};

const isDataUrl = (url) => /^data:/i.test(url);

const toBlobUrl = (dataUrl) => {
  const [head, b64] = dataUrl.split(',');
  const type = head.slice(5, head.indexOf(';'));
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
};

export async function openDocFrom(fetchUrl) {
  const viewer = window.open('', '_blank');
  if (!viewer) return false;
  viewer.opener = null;
  try {
    const url = await fetchUrl();
    if (!isViewableDoc(url)) throw new Error('not viewable');
    viewer.location.replace(url);
    return true;
  } catch {
    viewer.close();
    return false;
  }
}

export function openDocUrl(url) {
  if (!isViewableDoc(url)) return false;
  const viewer = window.open('', '_blank');
  if (!viewer) return false;
  viewer.opener = null;
  viewer.location.replace(isDataUrl(url) ? toBlobUrl(url) : url);
  return true;
}
