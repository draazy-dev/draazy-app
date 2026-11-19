-- The repeatable seed keeps stored fee values, so an existing database needs this to pick up the new caps.
UPDATE settings
   SET value = value || '{"referralQualifyPerMonth": 3, "referralQualifyPerYear": 10}'::jsonb
 WHERE key = 'fees';
