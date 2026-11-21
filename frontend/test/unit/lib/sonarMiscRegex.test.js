import { describe, expect, it } from 'vitest';
import { parseWhen } from '../../../src/lib/visitWhen.js';
import { safeInAppPath } from '../../../src/lib/authIntent.js';
import { moduleForPath } from '../../../src/lib/adminModules.js';
import { scrub, uaFamily } from '../../../src/lib/errorScrub.js';
import { propertyPath } from '../../../src/lib/listingSeo.js';
import { slugOfName } from '../../../src/lib/searchEntities.js';
import { formatIndian, formatMoneyInput, groupPairs } from '../../../src/pages/consumer/list-property/format.js';
import { CONFLICT_MARKER, conflictSubCode } from '../../../src/services/providers/http/flatmateMapper.js';
import minFontSize from '../../../src/styles/min-font-size.js';

describe('parseWhen mode capture', () => {
  it('reads the first non-empty parenthesised group', () => {
    expect(parseWhen('12 Mar 2026, 10:30 AM (video)').mode).toBe('video');
    expect(parseWhen('5 Jan () (in person)').mode).toBe('in person');
    expect(parseWhen('x ((a)').mode).toBe('(a');
  });

  it('returns an empty mode without a complete group', () => {
    expect(parseWhen('5 Jan (video').mode).toBe('');
    expect(parseWhen('5 Jan ()').mode).toBe('');
    expect(parseWhen('5 Jan 2026').mode).toBe('');
  });

  it('formats the time label', () => {
    expect(parseWhen('12 Mar 2026, 10:30 pm (video)').timeLabel).toBe('10:30 PM');
  });
});

describe('trailing slash handling', () => {
  it('safeInAppPath checks the normalised path and returns the input', () => {
    expect(safeInAppPath('/Listings///')).toBe('/Listings///');
    expect(safeInAppPath('/')).toBe('/');
    expect(safeInAppPath('/signin/')).toBeNull();
    expect(safeInAppPath('/SignUp///?x=1')).toBeNull();
  });

  it('moduleForPath resolves paths with trailing slashes', () => {
    expect(moduleForPath('/admin/')).toEqual(moduleForPath('/admin'));
    expect(moduleForPath('/staff//')).toEqual(moduleForPath('/admin'));
  });
});

describe('slug helpers', () => {
  it('trim a single leading and trailing dash after collapsing runs', () => {
    expect(slugOfName('  --Baner Road!! ', { locNames: [] })).toBe('baner-road');
    expect(slugOfName('!!', { locNames: [] })).toBe('');
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(propertyPath({ id, slug: null, bhk: 2, type: 'apartment', deal: 'rent', locality: ' *Kothrud* ' }))
      .toBe(`/property/2-bhk-apartment-for-rent-kothrud-${id}`);
  });
});

describe('errorScrub', () => {
  it('detects Safari from the Version token', () => {
    expect(uaFamily('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17.1 Safari/605.1.15')).toBe('Safari 17 / macOS');
    expect(uaFamily('Version/ Safari')).toBe('Other / Other');
    expect(uaFamily('Version/12Version/99 Safari')).toBe('Safari 12 / Other');
  });

  it('still redacts emails', () => {
    expect(scrub('contact a.b+c@mail.example.com now')).toBe('contact [email] now');
  });
});

describe('Indian digit grouping', () => {
  it('groups digit strings', () => {
    expect(formatIndian('1234567')).toBe('12,34,567');
    expect(formatIndian('12345678')).toBe('1,23,45,678');
    expect(formatIndian('999')).toBe('999');
    expect(formatIndian('1000')).toBe('1,000');
    expect(formatMoneyInput('1234567.5')).toBe('12,34,567.5');
  });

  it('keeps non-digit prefixes intact', () => {
    expect(groupPairs('1234')).toBe('12,34');
    expect(groupPairs('123')).toBe('1,23');
    expect(groupPairs('1.2345e')).toBe('1.23,45e');
    expect(groupPairs('')).toBe('');
  });
});

describe('flatmate conflict marker', () => {
  it('extracts the sub-code and strips it', () => {
    expect(conflictSubCode({ status: 409, message: 'Conflict (group_full)' })).toBe('group_full');
    expect(conflictSubCode({ status: 400, message: 'Conflict (group_full)' })).toBeNull();
    expect('Conflict   (group_full)  '.replace(CONFLICT_MARKER, '')).toBe('Conflict');
    expect('Conflict (Group)'.replace(CONFLICT_MARKER, '')).toBe('Conflict (Group)');
  });
});

describe('min font size absolute lengths', () => {
  const run = (value) => {
    const decl = { value };
    minFontSize().Declaration['font-size'](decl);
    return decl.value;
  };

  it('raises small absolute sizes', () => {
    expect(run('10px')).toBe('12px');
    expect(run(' .5rem ')).toBe('0.75rem');
    expect(run('0.6rem')).toBe('0.75rem');
  });

  it('leaves other values alone', () => {
    expect(run('14px')).toBe('14px');
    expect(run('1.rem')).toBe('1.rem');
    expect(run('-2px')).toBe('-2px');
    expect(run('smaller')).toBe('smaller');
  });
});
