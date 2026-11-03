-- One row per viewer per IST day, so a reload or a second tab cannot inflate an owner's view count.
CREATE TABLE property_view_days (
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    day         date NOT NULL,
    viewer_key  text NOT NULL,
    PRIMARY KEY (property_id, day, viewer_key)
);

-- Old view signals carry no IP, so each day's anonymous views collapse into one viewer.
INSERT INTO property_view_days (property_id, day, viewer_key)
SELECT DISTINCT ds.property_id,
       cast(ds.created_at at time zone 'Asia/Kolkata' as date),
       coalesce('u:' || ds.user_id::text, 'anon')
  FROM demand_signals ds
  JOIN properties p ON p.id = ds.property_id
 WHERE ds.kind = 'view'
   AND (ds.user_id IS NULL OR ds.user_id <> p.owner_id);

UPDATE properties p
   SET views = v.n
  FROM (SELECT property_id, count(*) AS n FROM property_view_days GROUP BY property_id) v
 WHERE p.id = v.property_id;

UPDATE properties p
   SET enquiries = c.n
  FROM (SELECT property_id, count(*) AS n FROM contact_requests GROUP BY property_id) c
 WHERE p.id = c.property_id;
