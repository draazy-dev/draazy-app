import { useState } from 'react';
import Modal from '../../../../components/ui/Modal.jsx';
import DateField from '../../../../components/ui/DateField.jsx';
import FieldError from '../../../../components/ui/FieldError.jsx';
import IdInput from '../../../../components/IdInput.jsx';
import AmountInput from '../../flatmates/AmountInput.jsx';
import { isValidName } from '../../../../lib/auth.js';
import { istToday } from '../../../../lib/availability.js';

const fieldCls = 'field w-full rounded-xl px-3.5 py-2.5 text-sm';
const invalid = (err) => (err ? ' dz-invalid' : '');

export default function FinalizeDealModal({ listing, onFinalize, onClose }) {
  const isSale = listing.deal === 'buy' || listing.deal === 'sale';
  const who = isSale ? 'buyer' : 'tenant';
  const today = istToday();
  const [form, setForm] = useState({ buyerName: '', buyerMobile: '', finalPrice: String(listing.price || ''), date: today });
  const [errors, setErrors] = useState({});

  const checks = {
    buyerName: (v) => (isValidName(v.trim()) ? '' : `Enter the ${who}'s full name, letters only.`),
    buyerMobile: (v) => (/^[6-9]\d{9}$/.test(v) ? '' : `Enter the 10-digit mobile number of the ${who}.`),
    finalPrice: (v) => (Number(v) > 0 ? '' : `Enter the final ${isSale ? 'sale price' : 'rent'}.`),
    date: (v) => (!v ? 'Pick the date the deal closed.' : v > today ? "The deal date can't be in the future." : ''),
  };
  const check = (name, value = form[name]) => setErrors((e) => ({ ...e, [name]: checks[name](value) }));
  // An invalid field re-checks as it is corrected, so the message clears the moment it is fixed.
  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name] || name === 'date') check(name, value);
  };

  const submit = () => {
    const next = Object.fromEntries(Object.entries(checks).map(([name, fn]) => [name, fn(form[name])]));
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onFinalize({ ...form, buyerName: form.buyerName.trim(), finalPrice: Number(form.finalPrice) });
  };

  return (
    <Modal open={true} onClose={onClose} title={`Finalize ${isSale ? 'Sale' : 'Rental'}`}>
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">Congratulations! Record the deal details for <span className="text-white font-semibold">{listing.title}</span>.</p>
        <label className="block text-sm">
          <span className="text-gray-400 mb-1.5 block">{isSale ? 'Buyer' : 'Tenant'} name</span>
          <input value={form.buyerName} onChange={(e) => set('buyerName', e.target.value)} onBlur={() => check('buyerName')} maxLength={80} autoComplete="name" className={fieldCls + invalid(errors.buyerName)} placeholder="Full name" />
          <FieldError>{errors.buyerName}</FieldError>
        </label>
        <label className="block text-sm">
          <span className="text-gray-400 mb-1.5 block">Mobile number</span>
          <IdInput
            kind="mobile"
            value={form.buyerMobile}
            onChange={(v) => set('buyerMobile', v)}
            onBlur={() => check('buyerMobile')}
            className={fieldCls + invalid(errors.buyerMobile)}
            placeholder="10-digit mobile"
          />
          <FieldError>{errors.buyerMobile}</FieldError>
        </label>
        <label className="block text-sm">
          <span className="text-gray-400 mb-1.5 block">Final {isSale ? 'sale price' : 'rent'}</span>
          <AmountInput value={form.finalPrice} onChange={(v) => set('finalPrice', v)} onBlur={() => check('finalPrice')} maxDigits={10} className={invalid(errors.finalPrice)} placeholder={isSale ? 'e.g. 85,00,000' : 'e.g. 25,000'} />
          <FieldError>{errors.finalPrice}</FieldError>
        </label>
        <label className="block text-sm">
          <span className="text-gray-400 mb-1.5 block">Date</span>
          <DateField value={form.date} onChange={(v) => set('date', v)} max={today} invalid={!!errors.date} className={fieldCls} ariaLabel="Deal date" />
          <FieldError>{errors.date}</FieldError>
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={submit} className="btn-teal flex-1 py-2.5 rounded-xl text-sm font-semibold">Confirm & Finalize</button>
          <button onClick={onClose} className="btn-outline flex-1 py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
