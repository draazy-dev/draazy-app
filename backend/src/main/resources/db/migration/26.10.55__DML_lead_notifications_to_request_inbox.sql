-- Incoming-interest notifications open the request inbox, where the host can act on them.
UPDATE notifications
   SET link = '/dashboard?tab=leads&box=received'
 WHERE type IN ('flatmate.interest', 'flatmate.room.interest', 'flatmate.group.interest',
                'flatmate.groupApplication.received');
