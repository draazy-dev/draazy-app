import { digits, isFullMobile } from '../../../lib/contact.js';

export const dialableMobile = (mobile) => (isFullMobile(mobile) ? digits(mobile) : '');

export const telHref = (mobile) => {
  const d = dialableMobile(mobile);
  return d ? `tel:+91${d}` : '';
};
