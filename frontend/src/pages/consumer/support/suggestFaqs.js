const STOP = new Set([
  'about', 'after', 'again', 'been', 'cannot', 'could', 'does', 'doesnt', 'dont', 'from', 'have', 'help', 'issue',
  'just', 'need', 'please', 'problem', 'still', 'that', 'their', 'there', 'they', 'this', 'what', 'when', 'where',
  'which', 'will', 'with', 'would', 'your',
]);

// A trailing "s" is dropped so "payments" finds "payment"; the shorter term is still a substring of the longer.
const termsOf = (text) => [...new Set((text.toLowerCase().match(/\p{L}{4,}/gu) || [])
  .filter((word) => !STOP.has(word))
  .map((word) => word.replace(/s$/, '')))];

/** FAQs worth reading before sending a ticket: a question hit counts three, an answer hit one. */
export function suggestFaqs(text, faqs, limit = 3) {
  const terms = termsOf((text || '').slice(0, 400));
  if (!terms.length) return [];
  return (faqs || [])
    .map((faq) => {
      const question = (faq.question || '').toLowerCase();
      const answer = (faq.answer || '').toLowerCase();
      const score = terms.reduce((sum, term) => sum + (question.includes(term) ? 3 : 0) + (answer.includes(term) ? 1 : 0), 0);
      return { faq, score };
    })
    .filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ faq }) => faq);
}
