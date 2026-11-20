export const onActivateKey = (fn) => (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  if (e.repeat) return;
  fn?.(e);
};
