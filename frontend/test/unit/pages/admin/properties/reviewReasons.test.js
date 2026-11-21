import { describe, expect, it } from 'vitest';
import {
  REVIEW_REASONS, REVIEW_REASON_BY_CODE, SIGNAL_LABELS, isResubmittableReason, ownerMessagePreview,
  reasonTemplateHints, signalLabel, signalsForChecklistItem,
} from '../../../../../src/pages/admin/properties/reviewReasons.js';

describe('review reasons', () => {
  it('indexes every reason by code', () => {
    expect(Object.keys(REVIEW_REASON_BY_CODE)).toHaveLength(REVIEW_REASONS.length);
    expect(REVIEW_REASON_BY_CODE.broker.label).toBe('Broker');
  });

  it('reports resubmittable reasons', () => {
    expect(isResubmittableReason('wrong_details')).toBe(true);
    expect(isResubmittableReason('broker')).toBe(false);
    expect(isResubmittableReason('nope')).toBe(false);
  });
});

describe('ownerMessagePreview', () => {
  it('returns the owner ask plus a trimmed note for a request', () => {
    expect(ownerMessagePreview('request', 'broker', '  Call us. ')).toBe(
      'Please confirm that you are the owner or family, not a broker. Call us.',
    );
    expect(ownerMessagePreview('request', 'broker')).toBe('Please confirm that you are the owner or family, not a broker.');
  });

  it('falls back to the "other" reason for unknown codes', () => {
    expect(ownerMessagePreview('request', 'zzz')).toBe('Please share the missing information.');
  });

  it('closes a final rejection', () => {
    const msg = ownerMessagePreview('reject', 'duplicate', 'See #12');
    expect(msg).toContain('Reason: This listing was identified as a duplicate of an existing listing. See #12');
    expect(msg.endsWith('This decision is final. The listing cannot be resubmitted.')).toBe(true);
  });

  it('invites a resubmission when the reason allows it', () => {
    const msg = ownerMessagePreview('reject', 'wrong_details');
    expect(msg.endsWith('Edit the listing and resubmit it for review.')).toBe(true);
    expect(msg).not.toContain('final');
  });
});

describe('signals', () => {
  it('labels known and unknown signal codes', () => {
    expect(signalLabel('conflict')).toBe(SIGNAL_LABELS.conflict);
    expect(signalLabel('some_new_signal')).toBe('some new signal');
    expect(signalLabel(undefined)).toBe('');
  });

  const signals = {
    items: [
      { code: 'photo_match_other_account' }, { code: 'copied_description' }, { code: 'many_localities_30d' }, { code: 'broker_wording' },
    ],
    conflict: true,
  };

  it('maps checklist items to relevant signals', () => {
    expect(signalsForChecklistItem(signals, 'Photos look real')).toEqual([{ code: 'photo_match_other_account' }]);
    expect(signalsForChecklistItem(signals, 'Locality matches')).toEqual([{ code: 'many_localities_30d' }]);
    expect(signalsForChecklistItem(signals, 'Details are right')).toEqual([{ code: 'many_localities_30d' }]);
    expect(signalsForChecklistItem(signals, 'Pricing sane')).toEqual([]);
    expect(signalsForChecklistItem(signals)).toEqual([]);
  });

  it('prepends a conflict row for the duplicate check', () => {
    const rows = signalsForChecklistItem(signals, 'Not a duplicate');
    expect(rows.map((r) => r.code)).toEqual(['conflict', 'photo_match_other_account', 'copied_description'].sort((a, b) => (a === 'conflict' ? -1 : b === 'conflict' ? 1 : 0)));
    expect(rows[0]).toMatchObject({ severity: 'hard' });
    expect(signalsForChecklistItem({ items: signals.items }, 'duplicate')).toHaveLength(2);
  });

  it('tolerates missing signals', () => {
    expect(signalsForChecklistItem(undefined, 'photos')).toEqual([]);
    expect(signalsForChecklistItem({ items: 'x' }, 'photos')).toEqual([]);
  });

  it('builds template hints', () => {
    expect(reasonTemplateHints('')).toEqual([]);
    expect(reasonTemplateHints('wrong_details')).toEqual(['reason_wrong_details', 'wrong_details', 'wrong-details', 'wrong details']);
  });
});
