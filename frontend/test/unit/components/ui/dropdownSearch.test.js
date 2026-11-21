import { describe, expect, it } from 'vitest';
import { SEARCH_MIN_OPTIONS, isSearchableList } from '../../../../src/components/ui/dropdownSearch.js';
import { AMEN_ICON, POSSESSION, amenLabel } from '../../../../src/components/property/tileMeta.js';
import { AMEN_LBL } from '../../../../src/pages/consumer/listings/constants.js';

describe('isSearchableList', () => {
  it('honours an explicit choice either way', () => {
    expect(isSearchableList(true, false, 1)).toBe(true);
    expect(isSearchableList(false, true, 500)).toBe(false);
  });

  it('is always searchable when options load remotely', () => {
    expect(isSearchableList(undefined, true, 0)).toBe(true);
    expect(isSearchableList(null, 'yes', 0)).toBe(true);
  });

  it('turns search on from the minimum option count', () => {
    expect(isSearchableList(undefined, false, SEARCH_MIN_OPTIONS - 1)).toBe(false);
    expect(isSearchableList(undefined, false, SEARCH_MIN_OPTIONS)).toBe(true);
  });
});

describe('tileMeta', () => {
  it('labels amenities from the listing constants first', () => {
    const [key, label] = Object.entries(AMEN_LBL)[0];
    expect(amenLabel(key)).toBe(label);
  });

  it('falls back to the extra labels, then to the raw key', () => {
    expect(AMEN_LBL.play).toBeUndefined();
    expect(amenLabel('play')).toBe('Play Area');
    expect(amenLabel('hot_tub')).toBe('hot_tub');
  });

  it('exposes icons and possession labels', () => {
    expect(AMEN_ICON.gym).toBe('dumbbell');
    expect(POSSESSION).toEqual({ ready: 'Ready to move', under: 'Under constr.', new: 'New launch' });
  });
});
