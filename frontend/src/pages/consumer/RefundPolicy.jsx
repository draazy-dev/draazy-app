import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import LegalPage from '../../components/LegalPage.jsx';
import { usePricing } from '../../context/PricingContext.jsx';
import { GRIEVANCE_OFFICER_DEFAULT, getGrievanceOfficer } from '../../services/settingsService.js';

export default function RefundPolicy() {
  const { fee, refunds, loaded } = usePricing();
  const { packRefundDays, passGuaranteeDays, passGuaranteeMaxEnquiries, passGuaranteeEveryMonths, contactReplyDays } = refunds;
  const [officer, setOfficer] = useState(GRIEVANCE_OFFICER_DEFAULT);

  useEffect(() => {
    let alive = true;
    getGrievanceOfficer().then((o) => { if (alive) setOfficer(o); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const enquiryLimit = passGuaranteeMaxEnquiries > 0
    ? `${passGuaranteeMaxEnquiries} or fewer enquiries`
    : 'no enquiries';

  return (
    <LegalPage title="Refund Policy" lastUpdated="12 October 2026" current="refund-policy">
      <p>
        This Refund Policy applies to all paid services purchased through draazy.com
        ("<strong>Platform</strong>") operated by Draazy Technologies ("<strong>Draazy</strong>"). Every purchase is
        one-off: there are no subscriptions and nothing renews automatically.
      </p>

      <h2>1. Scope</h2>
      <p>This policy covers:</p>
      <ul>
        <li>Listing Passes ({fee('listingPass')}, one per extra live listing).</li>
        <li>Contact Packs ({fee('contactPack')}).</li>
        <li>Rent agreements.</li>
      </ul>
      <p>
        Property transactions between buyers, tenants, and owners are direct contracts between those parties. Draazy
        is not liable for refunds related to rent deposits, token amounts, or property sale advances exchanged between users.
      </p>

      <h2>2. Contacts come back</h2>
      <p>
        If an owner declines your contact request, or does not reply within <strong>{contactReplyDays} days</strong>,
        the contact returns to your allowance automatically. You do not need to ask.
      </p>

      <h2>3. Contact Packs</h2>
      {!loaded ? null : packRefundDays > 0 ? (
        <p>
          If you have not used any contact from a pack, you can ask for a full refund within{' '}
          <strong>{packRefundDays} days</strong> of buying it. Once a contact has been used, the pack is not refundable.
        </p>
      ) : (
        <p>Contact Packs are not refundable once bought. Contacts that come back (section 2) return to your allowance.</p>
      )}

      <h2>4. Listing Passes</h2>
      {!loaded ? null : passGuaranteeDays > 0 ? (
        <>
          <p>
            If your listing gets {enquiryLimit} in its first <strong>{passGuaranteeDays} live days</strong> on a
            pass, you can ask for a full refund. The guarantee can be used once every{' '}
            <strong>{passGuaranteeEveryMonths} months</strong>.
          </p>
          <p>
            Pausing the listing during that window ends the guarantee. Otherwise a pass is not refundable. It ends
            early if its listing is rented, sold or archived, with no refund for the unused days.
          </p>
        </>
      ) : (
        <p>
          Listing Passes are not refundable once bought. A pass ends early if its listing is rented, sold or
          archived, with no refund for the unused days.
        </p>
      )}
      <p>
        While a refund request is open, the pack&apos;s contacts are frozen and the pass&apos;s listing is paused.
        If the request is declined, they resume.
      </p>

      <h2>5. Rent agreements</h2>
      <p>
        For a Leave and License agreement, everything you paid is refunded until the
        stamp duty is paid to the Government of Maharashtra on GRAS. After that, the stamp duty and registration
        charges are spent, and only the service fee (and anything you overpaid after a change of terms) is
        refunded. Every refund is approved by a second member of our team.
      </p>

      <h2>6. How to request a refund</h2>
      <ol>
        <li>Open <strong>Dashboard → Plan &amp; Billing</strong>. If the purchase qualifies, you will see a <strong>Refund</strong> button.</li>
        <li>
          If it does not qualify but you think it should, choose <strong>Ask for a review</strong>, or raise a ticket
          from the <Link to="/support">Support</Link> page with the invoice number.
        </li>
        <li>Our team reviews every request within 2 business days and keeps you updated.</li>
      </ol>
      <p>Payments taken in error, such as a double charge, are refunded automatically.</p>

      <h2>7. Refund processing</h2>
      <ul>
        <li>Approved refunds are processed within <strong>5–7 business days</strong>.</li>
        <li>Refunds are credited to the original payment method (UPI, bank account, or card).</li>
        <li>You receive a GST credit note for every refund.</li>
      </ul>

      <h2>8. Non-refundable items</h2>
      <ul>
        <li>Contact Pack contacts once used (phone number or email viewed).</li>
        <li>Government fees, stamp duty, or registration charges paid on your behalf.</li>
      </ul>

      <h2>9. Disputes and chargebacks</h2>
      <p>
        If you raise a chargeback with your bank or card issuer, we pause only that purchase while it is
        investigated. Your account, your other listings and your contacts keep working. We encourage you to reach out
        to our support team first, as it is usually faster.
      </p>

      <h2>10. Grievance Officer</h2>
      <p>
        For any complaint about a payment or refund, write to our Grievance Officer
        {officer.name ? <>, <strong>{officer.name}</strong>,</> : null} at{' '}
        <a href={`mailto:${officer.email}`}>{officer.email}</a>. We acknowledge complaints within 48 hours and resolve
        them within one month.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Refund Policy from time to time. Changes take effect 15 days after notification via email
        or in-app banner. The policy applicable to your purchase is the one in effect at the time of the transaction.
      </p>
    </LegalPage>
  );
}
