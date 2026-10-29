import { Home, Images, IndianRupee, MapPin } from 'lucide-react';
import {
  floorOptions, totalFloorsOptions,
  shellOptions, naStatusOptions, otherRightsOptions, buyerEligibilityOptions,
  PROPERTY_TYPES, commercialSubtypeOptions, commercialLabelOf,
  isLandType, landUseFor, DEPOSIT_MONTHS,
} from '../../consumer/list-property/constants.js';

export {
  floorOptions, totalFloorsOptions,
  naStatusOptions, otherRightsOptions, buyerEligibilityOptions,
  commercialSubtypeOptions, commercialLabelOf,
  isLandType, landUseFor, DEPOSIT_MONTHS,
};

export const typeOptions = PROPERTY_TYPES;
export const NONRES_TYPES = ['commercial', 'openplot', 'farmland'];
export const LAND_TYPES = ['openplot', 'farmland'];

export const bhkOptions = [
  { value: '1', label: '1 BHK' }, { value: '2', label: '2 BHK' },
  { value: '3', label: '3 BHK' }, { value: '4', label: '4 BHK' },
  { value: '5', label: '5+ BHK' },
];

export const furnishingOptions = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi', label: 'Semi-Furnished' },
  { value: 'furnished', label: 'Furnished' },
];

export const shellTypeOptions = shellOptions.map(([value, label]) => ({ value, label }));

export const possessionOptions = [
  { value: 'ready', label: 'Ready to Move' }, { value: 'new', label: 'New Launch' },
  { value: 'under', label: 'Under Construction' },
];

export const DRAFT_KEY = 'dz_pob_draft_v2';

export const STEPS = [
  { id: 1, label: 'Details', icon: Home },
  { id: 2, label: 'Location', icon: MapPin },
  { id: 3, label: 'Pricing', icon: IndianRupee },
  { id: 4, label: 'Photos & Review', icon: Images },
];
export const LAST_STEP = STEPS.length;

export const INITIAL_FORM = {
  ownerName: '', ownerMobile: '', ownerNotes: '',
  deal: 'rent', propertyType: '', commercialType: '', bhk: '', carpetArea: '',
  floor: '', totalFloors: '', furnishing: 'unfurnished', shellType: '',
  naStatus: '', otherRights: '', buyerEligibility: '',
  locality: '', localitySlug: '', society: '', societyId: '', lat: null, lng: null, pincode: '', address: '',
  price: '', deposit: '', availableFrom: '', possession: 'ready', reraId: '',
  photos: [],
};

export const fld = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-400/30 transition';
export const label = 'block text-sm font-medium text-gray-300 mb-1.5';
export const errCls = 'border-red-400/60 focus:border-red-400 focus:ring-red-400/30';
