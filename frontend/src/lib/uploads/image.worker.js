import { processImage, imageErrorMessage } from './imageProcess.js';

self.onmessage = async ({ data: { file, type, document, maxBytes } }) => {
  try {
    self.postMessage(await processImage(file, type, document, maxBytes));
  } catch (error) {
    self.postMessage({ error: imageErrorMessage(error) });
  }
};
