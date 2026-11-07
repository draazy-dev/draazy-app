import { get, prime } from './http.js';

const SECTIONS = [
  ['me', '/auth/me'],
  ['subscription', '/me/subscription'],
  ['saved', '/me/saved/keys'],
  ['notificationsUnread', '/notifications/unread-count'],
  ['messagesUnread', '/messages/unread-count'],
  ['requestsPending', '/me/requests/pending-count'],
  ['supportUnread', '/support/chat/unread-count'],
];

export function primeMeBootstrap() {
  const doc = get('/me/bootstrap');
  for (const [name, path, query] of SECTIONS) prime(path, query, doc.then((d) => d?.[name]));
}
