-- Rows saved before the server stopped storing answers the wizard never asks for:
-- a bhk on commercial/plot/farm stock and rent-only defaults on a sale.
UPDATE properties SET bhk = NULL
 WHERE bhk IS NOT NULL AND property_type_key IN ('commercial', 'farmland', 'plot');
UPDATE properties
   SET deposit = NULL,
       pets = NULL,
       form_details = form_details - ARRAY['agreementDuration', 'lockIn', 'noticePeriod', 'foodPref', 'food', 'petsPolicy', 'rentMaintMode', 'preferredTenants', 'fitOutMonths', 'escalationPct']
 WHERE deal = 'buy'
   AND (deposit IS NOT NULL OR pets IS NOT NULL OR form_details ?| ARRAY['agreementDuration', 'lockIn', 'noticePeriod', 'foodPref', 'food', 'petsPolicy', 'rentMaintMode', 'preferredTenants', 'fitOutMonths', 'escalationPct']);
