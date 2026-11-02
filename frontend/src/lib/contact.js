const USER_KEY = 'draazyUser';

export const digits = (num) => String(num || '').replace(/\D/g, '');

export const NO_CONTACT_GATE = Object.freeze({
  status: 'none',
  verifiedContactOnly: false,
  verificationRequired: false,
  ownerHidesNumber: false,
});

export const isFullMobile = (num) => digits(num).length === 10;

export function maskPhone(num) {
  const d = digits(num);
  if (d.length < 4) return '+91 ••••• •••••';
  return '+91 ' + d.slice(0, 2) + '••• •••' + d.slice(-2);
}

export function fmtPhone(num) {
  const d = digits(num);
  return d.length === 10 ? '+91 ' + d.slice(0, 5) + ' ' + d.slice(5) : '+91 ' + d;
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export const myMobile = () => {
  const u = readUser();
  return u ? digits(u.mobile) : '';
};

export const isOwnerViewer = (ownerMobile) => {
  const m = myMobile();
  return isFullMobile(m) && isFullMobile(ownerMobile) && m === digits(ownerMobile);
};
