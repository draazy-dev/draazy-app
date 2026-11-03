export const STYLE_KEYS = ['tidy', 'food', 'sleep', 'wfh', 'guests', 'visitors', 'smoking', 'drinks', 'pets', 'bills', 'family', 'quiet'];

export const STYLE_ICONS = {
  tidy: 'sparkles', food: 'utensils', sleep: 'moon', wfh: 'briefcase', guests: 'users-round', visitors: 'door-open',
  smoking: 'flame', drinks: 'party-popper', pets: 'paw-print', bills: 'wallet', family: 'home', quiet: 'bell-off',
};

export const MIN_COMMON = 3;

export const VIBE_TRACK = 'grid grid-cols-3 gap-[3px] p-[3px] rounded-[14px] border border-white/10 bg-white/5';

export const vibeCellCx = (on) => 'flex items-center justify-center min-h-11 px-1.5 py-1 rounded-[11px] text-center text-[13px] leading-tight transition-colors disabled:opacity-40 '
  + (on ? 'bg-teal-500/15 font-semibold text-teal-300 ring-1 ring-inset ring-teal-500/40' : 'font-medium text-gray-300');

const TRAILING_EMOJI = /^(.*?)\s*(\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D]*)$/u;

export function splitEmoji(label) {
  const m = TRAILING_EMOJI.exec(label);
  return m ? { emoji: m[2], text: m[1] } : { emoji: '', text: label };
}

export const answeredCount = (answers) => STYLE_KEYS.filter((k) => Number.isInteger(answers?.[k])).length;

export const matchTier = (pct) => (pct >= 75 ? 'great' : pct >= 50 ? 'good' : 'low');
