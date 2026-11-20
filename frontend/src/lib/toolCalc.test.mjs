import assert from 'node:assert/strict';
import { computeStampDuty, leaveLicenceStamp, monthLabel, monthOptions, monthsBetween, rentalYield, rentForTerm } from './toolCalc.js';

const opts = monthOptions(new Date(2025, 5, 15));
assert.equal(opts.length, 49);
assert.equal(opts[0], '2022-06');
assert.equal(opts[36], '2025-06');
assert.equal(opts[48], '2026-06');
assert.equal(monthLabel('2025-01'), 'January 2025');

assert.deepEqual(computeStampDuty(7500000, 7), { stamp: 525000, reg: 30000, total: 555000, rate: 7 });
assert.equal(computeStampDuty(1000000, 7).reg, 10000);
assert.equal(computeStampDuty(-5, 7).total, 0);

assert.deepEqual(leaveLicenceStamp(275000, 0, 100000, 1), { exactPaise: 71250, stamp: 713 });
assert.deepEqual(leaveLicenceStamp(352000, 0, 150000, 1), { exactPaise: 91750, stamp: 918 });
assert.equal(leaveLicenceStamp(33000, 0, 70040, 1).stamp, 100);
assert.equal(leaveLicenceStamp(33000, 0, 72000, 1).stamp, 101);
assert.deepEqual(leaveLicenceStamp(0, 0, 0, 1), { exactPaise: 0, stamp: 100 });
assert.equal(rentForTerm(11130, 24, 5, 12), 11130 * 12 + 11686 * 12);
assert.equal(rentForTerm(10000, 36, 10, 12), 10000 * 12 + 11000 * 12 + 12100 * 12);

assert.deepEqual(monthsBetween('2026-03', '2026-05'), ['2026-03', '2026-04', '2026-05']);
assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
assert.equal(monthsBetween('2026-04', '2027-03').length, 12);
assert.deepEqual(monthsBetween('2026-04', '2027-04'), []);
assert.deepEqual(monthsBetween('2026-05', '2026-04'), []);
assert.deepEqual(monthsBetween('', '2026-04'), []);

const y = rentalYield({ price: 6000000, rent: 25000, maintenance: 2000, propertyTax: 12000, vacancyMonths: 1 });
assert.equal(y.grossRent, 300000);
assert.equal(y.netIncome, 25000 * 11 - 24000 - 12000);
assert.equal(y.gross, 5);
assert.ok(Math.abs(y.net - (239000 / 6000000) * 100) < 1e-9);
assert.equal(rentalYield({ price: 0, rent: 1, maintenance: 0, propertyTax: 0, vacancyMonths: 0 }).net, null);
assert.equal(rentalYield({ price: 100, rent: 1, maintenance: 5, propertyTax: 0, vacancyMonths: 0 }).payback, null);

console.log('toolCalc: ok');
