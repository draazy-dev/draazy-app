import { shareRoute } from '../edge/share-pages.mjs';

export const onRequestGet = ({ request, env }) => shareRoute({ request, env, name: 'signup' });

export const onRequestHead = onRequestGet;
