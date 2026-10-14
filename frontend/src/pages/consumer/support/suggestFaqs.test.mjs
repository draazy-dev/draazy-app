import assert from 'node:assert/strict';
import { suggestFaqs } from './suggestFaqs.js';

const faqs = [
  { id: 1, question: 'How do I get a refund for a failed payment?', answer: 'Refunds reach your bank in 5-7 days.' },
  { id: 2, question: 'How do I edit my listing?', answer: 'Open My listings and tap Edit.' },
  { id: 3, question: 'Is brokerage charged?', answer: 'No. Draazy connects you directly with owners; no payment to brokers.' },
];
const ids = (text) => suggestFaqs(text, faqs).map((f) => f.id);

assert.deepEqual(ids('Payments failed, need refund'), [1]);
assert.deepEqual(ids('cannot edit listing photos'), [2]);
assert.deepEqual(ids('please help with this issue'), []);
assert.deepEqual(ids(''), []);
assert.deepEqual(ids('brokers'), [3]);
assert.deepEqual(suggestFaqs('refund', undefined), []);
assert.equal(suggestFaqs('how listing edit refund payment brokerage', faqs, 2).length, 2);

console.log('suggestFaqs ok');
