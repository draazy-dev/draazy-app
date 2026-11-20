import { createProvider } from './config.js';

const provider = createProvider('pageView');

export const recordPageViews = async (batch) => {
  try {
    await (await provider()).recordPageViews(batch);
  } catch {
  }
};
