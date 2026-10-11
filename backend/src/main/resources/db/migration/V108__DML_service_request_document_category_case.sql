UPDATE documents SET category = lower(trim(category))
WHERE service_request_id IS NOT NULL AND category <> lower(trim(category));
