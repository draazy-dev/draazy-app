import { processImage, imageErrorMessage } from './imageProcess.js';

self.onmessage = async ({ data: { file, type, document } }) => {
  try {
    self.postMessage(await processImage(file, type, document));
  } catch (error) {
    self.postMessage({ error: imageErrorMessage(error) });
  }
};
