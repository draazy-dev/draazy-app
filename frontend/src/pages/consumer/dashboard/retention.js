export function profileCompletion(user, identityVerified) {
  const has = (v) => !!(v && String(v).trim());
  const steps = [
    { key: 'name', label: 'Add your name', done: has(user?.name) },
    { key: 'email', label: 'Add your email address', done: has(user?.email) },
    { key: 'city', label: 'Set your city', done: has(user?.city) },
    { key: 'identity', label: 'Verify your identity', done: !!identityVerified },
  ];
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);
  const next = steps.find((s) => !s.done) || null;
  return { percent, steps, done, total: steps.length, next };
}
