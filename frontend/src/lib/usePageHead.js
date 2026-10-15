import { useEffect } from 'react';

const SITE = 'https://draazy.com';

/* A prerendered page's tags hold that page's values, not the app's. `data-shell` (set by
   scripts/vite-plugin-blog.mjs) is the app-wide value to restore; empty means the shell had none. */
function previousValue(el, attr) {
  const shell = el.getAttribute('data-shell');
  el.removeAttribute('data-shell');
  return shell ?? el.getAttribute(attr);
}

function upsert(tag, match, attr, value) {
  const selector = `${tag}${Object.entries(match).map(([k, v]) => `[${k}="${v}"]`).join('')}`;
  let el = document.head.querySelector(selector);
  const created = !el;
  if (created) {
    el = document.createElement(tag);
    Object.entries(match).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  }
  const prev = created ? null : previousValue(el, attr);
  el.setAttribute(attr, value);
  return () => (created || !prev ? el.remove() : el.setAttribute(attr, prev));
}

export default function usePageHead({
  title,
  description,
  path,
  image,
  imageAlt,
  type = 'website',
  noindex = false,
  jsonLd,
}) {
  useEffect(() => {
    if (!title) return undefined;
    const titleEl = document.querySelector('title');
    const prevTitle = (titleEl && titleEl.getAttribute('data-shell')) ?? document.title;
    titleEl?.removeAttribute('data-shell');
    document.title = title;
    const restores = [
      description && upsert('meta', { name: 'description' }, 'content', description),
      path && upsert('link', { rel: 'canonical' }, 'href', `${SITE}${path}`),
      noindex && upsert('meta', { name: 'robots' }, 'content', 'noindex'),
      title && upsert('meta', { property: 'og:title' }, 'content', title),
      description && upsert('meta', { property: 'og:description' }, 'content', description),
      path && upsert('meta', { property: 'og:url' }, 'content', `${SITE}${path}`),
      type && upsert('meta', { property: 'og:type' }, 'content', type),
      image && upsert('meta', { property: 'og:image' }, 'content', image),
      imageAlt && upsert('meta', { property: 'og:image:alt' }, 'content', imageAlt),
      title && upsert('meta', { name: 'twitter:title' }, 'content', title),
      description && upsert('meta', { name: 'twitter:description' }, 'content', description),
      image && upsert('meta', { name: 'twitter:image' }, 'content', image),
    ].filter(Boolean);

    let jsonLdEl = null;
    if (jsonLd) {
      jsonLdEl = document.createElement('script');
      jsonLdEl.type = 'application/ld+json';
      jsonLdEl.setAttribute('data-page-head', '');
      jsonLdEl.textContent = typeof jsonLd === 'string' ? jsonLd : JSON.stringify(jsonLd);
      document.head.appendChild(jsonLdEl);
    }

    return () => {
      document.title = prevTitle;
      restores.forEach((restore) => restore());
      jsonLdEl?.remove();
    };
  }, [title, description, path, image, imageAlt, type, noindex, jsonLd]);
}
