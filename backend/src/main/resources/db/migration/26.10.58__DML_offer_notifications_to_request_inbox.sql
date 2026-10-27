UPDATE notifications n
   SET link = '/dashboard?tab=leads&box=received'
  FROM properties p
 WHERE n.type IN ('offer.received', 'offer.countered')
   AND n.link = '/property/' || p.id
   AND p.owner_id = n.user_id;
