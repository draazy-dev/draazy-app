export const STEP_LABELS = ['Property', 'Owner', 'Tenant', 'Terms', 'Witnesses', 'Review'];

export const LAST_PUBLIC_STEP = 0;

export const FURN_PRESETS = [
  ['Beds', 'bed-double'], ['Wardrobes', 'shirt'], ['Sofa', 'sofa'], ['Dining Table', 'utensils'],
  ['Table', 'table'], ['Chair', 'armchair'], ['Fridge', 'refrigerator'], ['Washing Machine', 'washing-machine'],
  ['AC', 'air-vent'], ['Geyser', 'shower-head'], ['Modular Kitchen', 'cooking-pot'], ['Microwave', 'microwave'],
  ['TV', 'tv'], ['Fan', 'fan'], ['Tube Light', 'lamp-ceiling'], ['Bulb', 'lightbulb'],
  ['Curtains', 'blinds'], ['Mirror', 'rectangle-vertical'], ['Water Purifier', 'droplets'], ['Exhaust Fan', 'wind'],
  ['Stove', 'flame'], ['Chimney', 'cooking-pot'], ['Inverter', 'battery-charging'], ['WiFi Router', 'wifi'],
];

export const FIXTURES = new Set(['Fan', 'Tube Light', 'Bulb', 'Exhaust Fan', 'Geyser', 'Modular Kitchen', 'Chimney', 'Mirror', 'Curtains', 'Water Purifier', 'Inverter', 'WiFi Router']);

export const PERIODS = [11, 12, 22, 24, 36, 60];
export const MAX_OCCUPANTS = 20;
export const PARKING = ['none', 'two-wheeler', 'car', 'both'];
export const DEED_LANGUAGES = ['English', 'Marathi'];
export const VISIT_PLACES = ['property', 'licensor', 'licensee'];
export const VISIT_SLOTS = ['any', 'morning', 'afternoon', 'evening'];
export const VISIT_DATE_FUTURE_DAYS = 90;
export const AREA_UNITS = ['sqft', 'sqm'];
export const PUNE_TALUKAS =  ['Pune City', 'Haveli', 'Mulshi', 'Maval', 'Khed', 'Shirur', 'Daund', 'Indapur', 'Baramati', 'Purandar', 'Bhor', 'Velhe / Rajgad', 'Junnar', 'Ambegaon', 'Pimpri-Chinchwad / Pimpri'];
export const MAX_AREA = 100000;
export const MAX_FLOOR = 200;
export const DECLARATION_VERSION = 'ra-decl-2026-10';

export const OWNER_DOCS = [['Index II', 'o-own']];

export const OWNER_DOCS_REQUIRED = ['o-own'];
export const POA_DOC = 'o-poa';
export const RESIDENCIES = ['resident', 'nri', 'foreign'];
export const PARTY_TYPES = ['individual', 'entity'];
export const ADDRESS_PROOF_TYPES = ['driving-license', 'election-card', 'passport', 'uid'];
export const FAMILY_MEMBER_TYPES = ['family', 'co-tenant'];
export const FAMILY_RELATIONS = ['father', 'mother', 'spouse', 'son', 'daughter', 'brother', 'sister', 'friend', 'other'];
export const MAX_POLICE_OCCUPANTS = MAX_OCCUPANTS;

export const OWNER_DOC_CATEGORY = { 'o-passport': 'licensor-0-passport', 'o-visa': 'licensor-0-visa', 'o-own': 'ownership-proof', 'o-poa': 'licensor-0-poa' };

export const MAX_LICENSORS = 4;
export const MAX_TENANTS = 6;
export const MAX_MONTHS = 60;
export const START_DATE_PAST_DAYS = 30;
export const START_DATE_FUTURE_DAYS = 180;
export const MH_PINCODE = /^(?!403)4[0-4]\d{4}$/;
export const CASH_LIMIT = 200000;
export const DEPOSIT_PAY_FIELDS = {
  upi: ['ref', 'amount', 'date'],
  netbanking: ['bank', 'branch', 'ref', 'amount', 'date'],
  dd: ['bank', 'branch', 'date', 'ref', 'amount'],
  cash: ['date', 'amount'],
};
export const MAX_DEPOSIT_PAYMENTS = 10;
export const PAYMENT_REF = /^[A-Za-z0-9]{4,30}$/;
export const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Bank of Maharashtra', 'Bank of Baroda', 'Punjab National Bank', 'Union Bank of India', 'Canara Bank', 'Bank of India', 'IDFC FIRST Bank', 'IndusInd Bank', 'Yes Bank', 'Cosmos Co-operative Bank', 'Saraswat Co-operative Bank'];
export const TDS_RENT_THRESHOLD = 50000;

export const COMMERCIAL_ROUTE = '/services/property-legal';
export const RESIDENTIAL_PROPERTY_TYPES = ['Flat / Apartment', 'Independent House / Bungalow', 'Row House'];

export const OWNER_VAULT_CAT = { 'o-own': 'Ownership Proof' };

export const SERVICES = [
  ['Drafting Leave & License', 'file-pen-line', 'Legally sound, government-approved residential drafts.'],
  ['Online e-Registration', 'globe', 'End-to-end e-registration on the Maharashtra IGR portal.'],
  ['Stamp Duty Calculation & Payment', 'badge-indian-rupee', 'Accurate Art. 36A computation and online payment.'],
  ['Biometric Verification', 'fingerprint', 'Doorstep biometric (thumb) capture for all parties.'],
  ['Agreement Renewal', 'refresh-cw', 'Hassle-free renewal of expiring agreements.'],
  ['Police Verification Assistance', 'shield-check', 'Tenant police verification support where required.'],
];
export const DOC_OWNER = ['PAN number', 'Index II of the flat (mandatory)', 'Latest Electricity Bill or Property Tax receipt', 'Every co-owner’s PAN number — all co-owners sign', 'Registered Power of Attorney, if signing for the owner'];
export const DOC_TENANT = ['PAN number', 'Proof of current address (if outstation)', 'Work ID proof (if employed or self-employed)'];
export const DOC_OTHER = ['Two adult witnesses — name, age and mobile number', 'Aadhaar and Aadhaar-registered mobile of every party for the OTP at our doorstep visit', 'Biometric (thumb) and live photo of all parties and witnesses at e-registration'];
export const FAQ = [
  ['Is registration of a rent agreement mandatory in Maharashtra?', 'Yes. Section 55 of the Maharashtra Rent Control Act, 1999 makes registration compulsory for every leave and licence agreement, whatever its term, and puts the duty on the owner. If it is not registered, the tenant\'s account of the terms prevails in a dispute, and the owner can be fined up to ₹5,000 or jailed for up to three months.'],
  ['How is stamp duty calculated?', 'For Leave & License (Article 36A), stamp duty is 0.25% of the total of: rent for the full period, including any agreed increases, + any non-refundable deposit + 10% of the refundable deposit for each year of the term.'],
  ['What is the registration fee?', '₹1,000 for properties in municipal / urban areas and ₹500 for properties in rural (Gram Panchayat) areas.'],
  ['Why is the agreement usually for 11 months?', 'Mostly habit, and a shorter term means less stamp duty and a chance to renegotiate at renewal. In Maharashtra it does not avoid registration: every leave and licence agreement must be registered, whether it runs 11 months or 60. You can choose any term up to 60 months here.'],
  ['Do all parties need to be physically present?', 'No. With e-registration and doorstep biometric (thumb impression), the process can be completed from home for owner, tenant and witnesses.'],
  ['What documents do I need?', 'PAN number of owner and tenant, and the owner’s Index II of the flat. Keep your Aadhaar and its registered mobile handy: we collect them at the doorstep visit for the OTP and biometric, and the portal fetches your name and address from Aadhaar. Two witnesses with name, age and mobile.'],
];
