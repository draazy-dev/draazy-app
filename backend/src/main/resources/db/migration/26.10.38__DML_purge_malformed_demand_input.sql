-- Scanner payloads stored before the @Pattern guards. Slug regex mirrors DemandSignalCreate; the city test
-- drops only ASCII punctuation/digits other than . ' - so non-Latin city names survive.
DELETE FROM demand_signals WHERE locality_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';

DELETE FROM city_waitlist WHERE translate(city, '.''-', '') ~ '[[:punct:][:digit:]]';
