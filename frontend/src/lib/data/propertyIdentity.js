import { digits, norm, pin, hashToken } from './identityNorm.js';

export { digits };

const unitToken = ({ flatNumber, tower } = {}) => norm(flatNumber) || norm(tower);

export const fingerprintKeys = (fields = {}) => {
  const keys = [];
  const ec = digits(fields.electricityConsumerNo);
  if (ec.length >= 6) keys.push('ec:' + hashToken(ec));
  const soc = norm(fields.society);
  const unit = unitToken(fields);
  if (soc && unit) {
    const loc = norm(fields.locality);
    keys.push('addr:' + [soc, unit, pin(fields.pincode), loc].join('|'));
  }
  return keys;
};

export const propertyFingerprint = (fields = {}) => fingerprintKeys(fields)[0] || '';

export const evaluateListingDedup = ({ fields } = {}) => {
  const keys = fingerprintKeys(fields || {});
  return { fingerprint: keys[0] || '', fingerprintKeys: keys };
};
