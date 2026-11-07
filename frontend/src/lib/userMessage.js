import { ApiError, NetworkError } from '../services/http.js';
import { UserError } from './userError.js';

export { UserError };

// Only a server refusal, a lost connection or a UserError was written for the reader; any other
// message is a code-level detail (a TypeError, a bare "HTTP 500") and gets the caller's fallback.
export function userMessage(err, fallback) {
  if (err instanceof ApiError) return err.serverMessage ? err.message : fallback;
  if (err instanceof NetworkError || err instanceof UserError) return err.message;
  return fallback;
}
