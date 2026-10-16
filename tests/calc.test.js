const assert = require('assert');
const C = require('../calc.js');
const today = '2026-10-16';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

const base = { purchasePrice: 15375, sellerType: 'dealer_vat', firstReg: '2019-06-01', km: 120000, co2: 0,
  transport: 775, coc: 0, itv: 130, dgt: 99.77, plates: 40, gestoria: 250, salePrice: 21900 };

t('IEDMT rates by CO2', () => {
  assert.strictEqual(C.iedmtRate(0), 0); assert.strictEqual(C.iedmtRate(120), 0);
  assert.strictEqual(C.iedmtRate(121), 0.0475); assert.strictEqual(C.iedmtRate(160), 0.0975);
  assert.strictEqual(C.iedmtRate(200), 0.1475);
});
t('age coefficient', () => { assert.strictEqual(C.iedmtCoef(0), 1); assert.strictEqual(C.iedmtCoef(3), 0.56); assert.strictEqual(C.iedmtCoef(20), 0.10); });
t('EV general regime: VAT on full sale price', () => {
  const r = C.compute(base, today);
  assert.strictEqual(r.iedmt, 0); assert.strictEqual(r.regime, 'general');
  assert.strictEqual(r.outputVat, Math.round((21900 - 21900 / 1.21) * 100) / 100);
  assert.strictEqual(r.landedCost, 15375 + 775 + 130 + 99.77 + 40 + 250);
  assert.ok(Math.abs(r.profit - (21900 / 1.21 - r.landedCost)) < 0.02);
});
t('REBU: VAT only on margin', () => {
  const r = C.compute({ ...base, sellerType: 'dealer_margin' }, today);
  assert.strictEqual(r.regime, 'rebu');
  const m = 21900 - 15375; assert.ok(Math.abs(r.outputVat - (m - m / 1.21)) < 0.02);
});
t('IEDMT from Hacienda table x coef', () => {
  const r = C.compute({ ...base, co2: 150, iedmtBaseNew: 40000 }, today); // 7 years -> 0.28
  assert.strictEqual(r.years, 7); assert.strictEqual(r.iedmt, Math.round(40000 * 0.28 * 0.0475 * 100) / 100);
});
t('new means of transport forces general regime', () => {
  const r = C.compute({ ...base, sellerType: 'dealer_margin', firstReg: '2026-07-01', km: 3000 }, today);
  assert.ok(r.newMeansOfTransport); assert.strictEqual(r.regime, 'general');
});
t('max bid hits target profit', () => {
  const bid = C.maxBid(base, 1500, today);
  const r = C.compute({ ...base, purchasePrice: bid }, today);
  assert.ok(r.profit >= 1500 && r.profit < 1500 + 15, `profit ${r.profit} at bid ${bid}`);
});
t('client quote total = landed + fee + VAT', () => {
  const q = C.clientQuote(base, 600, today); const r = C.compute(base, today);
  assert.strictEqual(q.total, Math.round((r.landedCost + 600 + 126) * 100) / 100);
});
console.log(`\n${n} tests passed`);
