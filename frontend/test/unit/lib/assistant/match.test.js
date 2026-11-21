import { describe, expect, it } from 'vitest';
import { LOW_CONFIDENCE, rankAnswers, tokenize } from '../../../../src/lib/assistant/match.js';

describe('tokenize', () => {
  it('lowercases, splits on punctuation and drops stop words and single characters', () => {
    expect(tokenize('How do I list my 2BHK flat?')).toEqual(['list', '2bhk', 'flat']);
    expect(tokenize('a I x')).toEqual([]);
  });

  it('tolerates empty and non-string input', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('?!')).toEqual([]);
    expect(tokenize(12345)).toEqual(['12345']);
  });
});

describe('rankAnswers', () => {
  it('returns nothing for an empty or stop-word-only query', () => {
    expect(rankAnswers('')).toEqual([]);
    expect(rankAnswers('how do I')).toEqual([]);
  });

  it('ranks the curated how-it-works answer first for a matching question', () => {
    const [top] = rankAnswers('How does Draazy work?');
    expect(top.entry.id).toBe('how-it-works');
    expect(top.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
    expect(top.score).toBe(top.confidence * 2 * 2);
  });

  it('respects the limit and sorts by descending score', () => {
    const results = rankAnswers('search find buy rent listings', { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(rankAnswers('search find buy rent listings', { limit: 1 })).toHaveLength(1);
  });

  it('returns no matches for unknown words', () => {
    expect(rankAnswers('zzzqq yyyrr')).toEqual([]);
  });

  it('falls back to FAQs and attaches a support action', () => {
    const faqs = [{ id: 7, question: 'What is zzzqq?', answer: 'It is zzzqq.' }];
    const [top] = rankAnswers('zzzqq', { faqs });
    expect(top.entry).toMatchObject({ id: 'faq-7', isFaq: true, q: 'What is zzzqq?', actions: [{ label: 'More help', to: '/support', icon: 'life-buoy' }] });
    expect(top.confidence).toBe(1);
  });

  it('prefers a confident curated answer over a higher-scoring FAQ', () => {
    const faqs = [{ id: 1, question: 'search flats zzzqq', answer: 'search flats zzzqq' }];
    const results = rankAnswers('search flats zzzqq', { faqs, limit: 10 });
    const faq = results.find((r) => r.entry.isFaq);
    const curated = results.find((r) => !r.entry.isFaq);
    expect(curated.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
    expect(faq.score).toBeGreaterThan(curated.score);
    expect(results.indexOf(curated)).toBeLessThan(results.indexOf(faq));
  });

  it('lets a much better FAQ outrank a weak curated match', () => {
    const faqs = [{ id: 2, question: 'draazy zzzqq yyyrr xxxss', answer: 'draazy zzzqq yyyrr xxxss' }];
    const results = rankAnswers('draazy zzzqq yyyrr xxxss', { faqs });
    expect(results[0].entry.id).toBe('faq-2');
    expect(results.some((r) => !r.entry.isFaq && r.confidence < LOW_CONFIDENCE)).toBe(true);
  });

  it('scores a question-only match lower than a keyword match', () => {
    const faqs = [{ id: 3, question: 'qqqwww', answer: 'unrelated' }, { id: 4, question: 'other', answer: 'qqqwww' }];
    const results = rankAnswers('qqqwww', { faqs, limit: 5 });
    expect(results.map((r) => r.entry.id).sort()).toEqual(['faq-3', 'faq-4']);
    expect(results.every((r) => r.score === 2)).toBe(true);
  });

  it('adds a small bonus to curated entries only', () => {
    const faqs = [{ id: 5, question: 'draazy', answer: 'draazy' }];
    const results = rankAnswers('draazy', { faqs, limit: 20 });
    const curated = results.find((r) => !r.entry.isFaq);
    const faq = results.find((r) => r.entry.isFaq);
    expect(curated.score).toBe(2.25);
    expect(faq.score).toBe(2);
  });
});
