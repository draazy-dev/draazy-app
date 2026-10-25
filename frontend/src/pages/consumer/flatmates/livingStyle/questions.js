// Mirrors the backend key set; each answer is 0..2, strictest first, so distance means difference.
export const STYLE_KEYS = ['tidy', 'food', 'sleep', 'wfh', 'guests', 'visitors', 'smoking', 'drinks', 'pets', 'bills', 'family', 'quiet'];

export const STYLE_ICONS = {
  tidy: 'sparkles', food: 'utensils', sleep: 'moon', wfh: 'briefcase', guests: 'users-round', visitors: 'door-open',
  smoking: 'flame', drinks: 'party-popper', pets: 'paw-print', bills: 'wallet', family: 'home', quiet: 'bell-off',
};

// Mirrors the server's MIN_COMMON: below it there is no match and no shared answers.
export const MIN_COMMON = 3;

export const answeredCount = (answers) => STYLE_KEYS.filter((k) => Number.isInteger(answers?.[k])).length;

export const matchTier = (pct) => (pct >= 75 ? 'great' : pct >= 50 ? 'good' : 'low');
