import { KB } from '../../data/assistant.js';

const STOP = new Set([
  'the', 'a', 'an', 'how', 'do', 'does', 'did', 'i', 'to', 'is', 'are', 'of', 'my',
  'me', 'can', 'could', 'you', 'and', 'for', 'on', 'in', 'with', 'what', 'it', 'get',
  'be', 'this', 'that', 'we', 'us', 'at', 'or', 'if', 'so', 'as', 'about', 'from',
  'your', 'want', 'need', 'please', 'help', 'there', 'any',
]);

export function tokenize(str) {
  const m = String(str || '').toLowerCase().match(/[a-z0-9]+/g);
  if (!m) return [];
  return m.filter((t) => t.length > 1 && !STOP.has(t));
}

function faqEntries(faqs) {
  return (faqs || []).map((f) => ({
    id: 'faq-' + f.id,
    keywords: tokenize(f.question + ' ' + f.answer),
    q: f.question,
    a: f.answer,
    actions: [{ label: 'More help', to: '/support', icon: 'ticket-plus' }],
    isFaq: true,
  }));
}

function scoreEntry(qTokens, entry) {
  const kw = new Set(entry.keywords);
  const qWords = new Set(tokenize(entry.q));
  let score = 0;
  for (const t of qTokens) {
    if (kw.has(t)) score += 2;
    else if (qWords.has(t)) score += 1;
  }
  if (!entry.isFaq && score > 0) score += 0.25;
  return score;
}

export function rankAnswers(query, { faqs = [], limit = 3 } = {}) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const max = qTokens.length * 2;
  const rank = (pool) =>
    pool
      .map((entry) => {
        const score = scoreEntry(qTokens, entry);
        return { entry, score, confidence: max ? score / max : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

  const curated = rank(KB);
  const faq = rank(faqEntries(faqs));

  const ordered =
    curated.length && curated[0].confidence >= LOW_CONFIDENCE
      ? [...curated, ...faq]
      : [...curated, ...faq].sort((a, b) => b.score - a.score);

  return ordered.slice(0, limit);
}

export const LOW_CONFIDENCE = 0.5;

