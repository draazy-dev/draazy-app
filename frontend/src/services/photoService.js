import { createProvider } from './config.js';
import { prepareUpload } from '../lib/uploads/prepareUpload.js';

const provider = createProvider('photo');

/** Every caller prepares bytes before the server's strict size/type gate. */
export const uploadPhoto = async (file, options) => {
  const { file: prepared, look } = await prepareUpload(file, { ...options, withLook: true }).catch((error) => {
    if (error?.name !== 'AbortError') error.retryable = false;
    throw error;
  });
  const uploader = await provider();
  options?.signal?.throwIfAborted();
  return { ...(await uploader.uploadPhoto(prepared, options)), look };
};
