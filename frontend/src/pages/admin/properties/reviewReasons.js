export const REVIEW_REASONS = [
  {
    code: 'photos_not_real',
    label: 'Photos not real',
    ownerMessage: 'Please add clear photos of the actual property.',
    rejectionMessage: 'The photos do not appear to be authentic.',
  },
  {
    code: 'duplicate',
    label: 'Duplicate',
    ownerMessage: 'Please tell us why this is not a duplicate listing.',
    rejectionMessage: 'This listing was identified as a duplicate of an existing listing.',
  },
  {
    code: 'broker',
    label: 'Broker',
    ownerMessage: 'Please confirm that you are the owner or family, not a broker.',
    rejectionMessage: 'Draazy is strictly owner-only.',
  },
  {
    code: 'wrong_details',
    label: 'Wrong details',
    ownerMessage: 'Please correct the listing details.',
    rejectionMessage: 'The listing contains inaccurate details.',
  },
  {
    code: 'locality_unclear',
    label: 'Locality unclear',
    ownerMessage: 'Please clarify the exact locality.',
    rejectionMessage: 'The property locality could not be verified.',
  },
  {
    code: 'document_unreadable',
    label: 'Document unreadable',
    ownerMessage: 'Please upload a readable document.',
    rejectionMessage: 'Ownership documents could not be verified.',
  },
  {
    code: 'name_mismatch',
    label: 'Name mismatch',
    ownerMessage: 'Please explain the name mismatch.',
    rejectionMessage: 'Ownership documents show an unverified name mismatch.',
  },
  {
    code: 'rera_not_found',
    label: 'RERA ID not found',
    ownerMessage: 'We could not find your RERA ID on MahaRERA. Please send the correct one.',
    rejectionMessage: 'The RERA ID could not be found on MahaRERA.',
  },
  {
    code: 'rera_mismatch',
    label: 'RERA ID mismatch',
    ownerMessage: 'Your RERA ID on MahaRERA does not match this project. Please correct it.',
    rejectionMessage: 'The RERA ID on MahaRERA does not match this project.',
  },
  {
    code: 'other',
    label: 'Other',
    ownerMessage: 'Please share the missing information.',
    rejectionMessage: 'The listing does not meet moderation guidelines.',
  },
];

export const REVIEW_REASON_BY_CODE = Object.fromEntries(REVIEW_REASONS.map((reason) => [reason.code, reason]));

export const ownerMessagePreview = (decision, reasonCode, note = '') => {
  const reason = REVIEW_REASON_BY_CODE[reasonCode] || REVIEW_REASON_BY_CODE.other;
  const extra = note.trim() ? ` ${note.trim()}` : '';
  if (decision === 'reject') {
    return `\u26D4 Your property could not be approved.\nReason: ${reason.rejectionMessage}${extra}\nThis decision is final. The listing cannot be resubmitted.`;
  }
  return `${reason.ownerMessage}${extra}`;
};

export const SIGNAL_LABELS = {
  photo_match_other_account: 'Photo match',
  conflict: 'Conflict',
  brokerage_reports: 'Brokerage reports',
  many_societies: 'Many societies',
  broker_wording: 'Broker wording',
  copied_description: 'Copied description',
  many_localities_30d: 'Many localities',
};

export const signalLabel = (code) => SIGNAL_LABELS[code] || String(code || '').replace(/_/g, ' ');

export const signalsForChecklistItem = (signals, item = '') => {
  const text = item.toLowerCase();
  const rows = Array.isArray(signals?.items) ? signals.items : [];
  if (text.includes('photo')) return rows.filter((row) => row.code === 'photo_match_other_account');
  if (text.includes('duplicate')) {
    const matches = rows.filter((row) => row.code === 'copied_description' || row.code === 'photo_match_other_account');
    return signals?.conflict ? [{ code: 'conflict', severity: 'hard', detail: 'Duplicate or cross-owner conflict' }, ...matches] : matches;
  }
  if (text.includes('details') || text.includes('location') || text.includes('locality')) {
    return rows.filter((row) => row.code === 'many_localities_30d');
  }
  return [];
};

export const reasonTemplateHints = (reasonCode) => {
  if (!reasonCode) return [];
  return [`reason_${reasonCode}`, reasonCode, reasonCode.replace(/_/g, '-'), reasonCode.replace(/_/g, ' ')];
};
