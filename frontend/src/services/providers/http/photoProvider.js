import { postMultipart } from '../../http.js';
import { UserError } from '../../../lib/userMessage.js';

export async function uploadPhoto(file, options) {
  const form = new FormData();
  form.append('file', file);
  const res = await postMultipart('/me/photos', form, options);
  if (!res?.url) throw new UserError('The photo upload did not return a usable URL. Please try again.');
  return { url: res.url };
}
