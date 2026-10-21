-- properties.views had no writer before DemandSignalService; replay recorded view signals, minus owners' own.
UPDATE properties p
SET views = p.views + s.n
FROM (SELECT d.property_id, count(*) AS n
      FROM demand_signals d
      JOIN properties o ON o.id = d.property_id
      WHERE d.kind = 'view' AND d.user_id IS DISTINCT FROM o.owner_id
      GROUP BY d.property_id) s
WHERE p.id = s.property_id;
