-- Consumer self-service actions are no longer audited; staff, system, money, consent and identity rows stay.
DELETE FROM audit_log
 WHERE action IN (
        'flatmate.interest',
        'flatmate.group.leave',
        'flatmate.group.remove_member',
        'flatmate.groupApplication.create',
        'flatmate.groupApplication.accepted',
        'flatmate.groupApplication.declined',
        'document.request.declined',
        'property.ownerPause',
        'property.ownerResume',
        'property.split',
        'property.unsplit',
        'rentAgreement.renewalReminder')
    OR action LIKE 'contact.request.%'
    OR action LIKE 'photo.request.%'
    OR action LIKE 'flatmate.request.%'
    OR (action IN ('conversation.started', 'visit.status') AND actor_role IN ('buyer', 'owner'));
