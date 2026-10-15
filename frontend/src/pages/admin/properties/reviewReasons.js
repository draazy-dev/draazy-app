export const REVIEW_REASONS = [
  {
    code: 'photos_not_real',
    label: 'Photos not real',
    ownerMessage: 'Please upload clear, real photos of this home so we can verify the listing.',
    rejectionMessage: 'This listing was rejected because the photos are not authentic.',
  },
  {
    code: 'duplicate',
    label: 'Duplicate',
    ownerMessage: 'This looks like another listing already on Draazy. Please confirm the correct listing.',
    rejectionMessage: 'This listing was rejected as a duplicate of an existing listing.',
  },
  {
    code: 'broker',
    label: 'Broker',
    ownerMessage: 'Draazy is owner-only. Please confirm that you are the owner or an immediate family member.',
    rejectionMessage: 'This listing was rejected because Draazy is strictly owner-only.',
  },
  {
    code: 'wrong_details',
    label: 'Wrong details',
    ownerMessage: 'Some listing details do not match what was submitted. Please correct the details and resubmit.',
    rejectionMessage: 'This listing was rejected due to inaccurate details.',
  },
  {
    code: 'locality_unclear',
    label: 'Locality unclear',
    ownerMessage: 'Please update the locality and address details so we can verify the exact property.',
    rejectionMessage: 'This listing was rejected because the property locality could not be verified.',
  },
  {
    code: 'document_unreadable',
    label: 'Document unreadable',
    ownerMessage: 'Please upload a clearer document photo or scan so the details can be read.',
    rejectionMessage: 'This listing was rejected because ownership documents could not be verified.',
  },
  {
    code: 'name_mismatch',
    label: 'Name mismatch',
    ownerMessage: 'The name on the submitted document does not match the lister. Please clarify or upload the right proof.',
    rejectionMessage: 'This listing was rejected due to an unverified name on ownership documents.',
  },
  {
    code: 'rera_not_found',
    label: 'RERA ID not found',
    ownerMessage: 'We could not find your RERA ID on MahaRERA. Please send the correct one.',
    rejectionMessage: 'This listing was rejected because the RERA ID could not be found on MahaRERA.',
  },
  {
    code: 'rera_mismatch',
    label: 'RERA ID mismatch',
    ownerMessage: 'Your RERA ID on MahaRERA does not match this project. Please correct it.',
    rejectionMessage: 'This listing was rejected because the RERA ID on MahaRERA does not match this project.',
  },
  {
    code: 'other',
    label: 'Other',
    ownerMessage: 'Please check the note below and update the listing so we can complete verification.',
    rejectionMessage: 'This listing was not approved following moderation review.',
  },
];

export const REVIEW_REASON_BY_CODE = Object.fromEntries(REVIEW_REASONS.map((reason) => [reason.code, reason]));

export const ownerMessagePreview = (decision, reasonCode, note = '') => {
  const reason = REVIEW_REASON_BY_CODE[reasonCode];
  const suffix = note.trim() ? `\n\nReviewer note: ${note.trim()}` : '';
  if (decision === 'reject') {
    const base = reason?.rejectionMessage || 'This listing was not approved.';
    return `${base}${suffix}\n\nThis decision is final. The listing cannot be resubmitted.`;
  }
  const base = reason?.ownerMessage || 'Please update the listing so we can complete verification.';
  return `${base}${suffix}`;
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
