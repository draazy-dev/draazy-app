-- Places looked up before the lookup asked for English came back with a local-script district (पुणे),
-- which never matches a served district.
UPDATE localities SET district = NULL, district_checked_at = NULL WHERE district ~ '[^[:ascii:]]';
UPDATE societies SET district = NULL, district_checked_at = NULL WHERE district ~ '[^[:ascii:]]';
