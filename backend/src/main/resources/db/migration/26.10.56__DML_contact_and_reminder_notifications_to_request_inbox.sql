UPDATE notifications
   SET link = '/dashboard?tab=leads&box=received'
 WHERE type IN ('contact.received', 'request.reminder');
