import { BUDGET_MIN, BUDGET_MAX } from './helpers.js';
import { AGE_BANDS } from '../../../lib/flatmates/filterState.js';

const budgetOf = (x) => {
  if (!x) return undefined;
  if (x.budget != null) return Number(x.budget);
  if (x.rent != null) return Math.round(Number(x.rent) / (x.seatsTotal || 1));
  return undefined;
};

const meFacets = (myPost) => {
  if (!myPost) return undefined;
  const localities = myPost.localities?.length
    ? myPost.localities
    : (myPost.locality ? [myPost.locality] : undefined);
  const budget = budgetOf(myPost);
  const gender = myPost.gender || undefined;
  if (!localities && budget === undefined && !gender) return undefined;
  return { localities, budget, gender };
};

export default function toFlatmateQuery(filters = {}, { sort, myPost = null } = {}) {
  const [lo, hi] = filters.budget || [];
  const [minAge, maxAge] = AGE_BANDS[filters.age] || [];
  return {
    q: filters.q || undefined,
    locality: filters.locality || undefined,
    budget: (lo > BUDGET_MIN || hi < BUDGET_MAX) ? [lo, hi] : undefined,
    moveIn: filters.moveIn || undefined,
    gender: filters.gender || undefined,
    strictGender: (filters.gender && filters.genderOnly) || undefined,
    roomType: filters.roomType || undefined,
    furnishing: filters.furnishing || undefined,
    sharing: filters.sharing || undefined,
    verifiedOnly: filters.verifiedOnly || undefined,
    gated: filters.gated || undefined,
    attachedBath: filters.attachedBath || undefined,
    bhk: filters.bhk || undefined,
    vegOnly: filters.vegOnly || undefined,
    parking: filters.parking || undefined,
    minAge,
    maxAge,
    minOpenSeats: filters.roomForTwo ? 2 : undefined,
    vibe: filters.vibe?.length ? [...filters.vibe] : undefined,
    near: filters.near || undefined,
    nearRadius: filters.near ? filters.nearRadius : undefined,
    nearMode: filters.near ? filters.nearMode : undefined,
    sort: sort || undefined,
    me: sort === 'match' ? meFacets(myPost) : undefined,
  };
}
