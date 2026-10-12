ALTER TABLE properties ADD COLUMN available_on date;

COMMENT ON COLUMN properties.available_on IS
    'Exact move-in date, IST calendar. The legacy now/15/30 bucket is derived from it on read; null when unstated.';

CREATE FUNCTION pg_temp.iso_date_or_null(raw text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
        RETURN raw::date;
    END IF;
    RETURN NULL;
EXCEPTION WHEN others THEN
    RETURN NULL;
END $$;

UPDATE properties SET available_on = COALESCE(
    pg_temp.iso_date_or_null(form_details ->> 'availableFrom'),
    CASE available_from
        WHEN 'now' THEN (created_at AT TIME ZONE 'Asia/Kolkata')::date
        WHEN '15' THEN (created_at AT TIME ZONE 'Asia/Kolkata')::date + 15
        WHEN '30' THEN (created_at AT TIME ZONE 'Asia/Kolkata')::date + 30
    END);

ALTER TABLE properties DROP COLUMN available_from;
