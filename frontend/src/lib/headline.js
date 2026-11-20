export const HEADLINE_MAX = 120;

export const headlineOf = (typed, suggestion) => (String(typed ?? '').trim() || suggestion || '').slice(0, HEADLINE_MAX);
