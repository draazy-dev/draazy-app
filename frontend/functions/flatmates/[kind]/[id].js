import { SHARE_PAGES, shareRoute } from '../../../edge/share-pages.mjs';

export function onRequestGet({ request, env, params, next }) {
  const name = `flatmates-${params.kind}`;
  if (!Object.hasOwn(SHARE_PAGES, name)) return next();
  return shareRoute({ request, env, name });
}

export const onRequestHead = onRequestGet;
