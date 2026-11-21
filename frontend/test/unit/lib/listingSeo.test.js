import { describe, expect, it } from 'vitest';
import {
  bhkLabel, crumbs, listingHead, listingJsonLd, listingPrice, listingTitle, propertyHref, propertyKey, propertyPath, societyHead,
} from '../../../src/lib/listingSeo.js';

const RS = '\u20b9';
const ID = '123E4567-E89B-12D3-A456-426614174000';

describe('labels', () => {
  it('names bedrooms, studios and large homes', () => {
    expect(bhkLabel(2, 'Flat')).toBe('2 BHK');
    expect(bhkLabel('3', 'Villa')).toBe('3 BHK');
    expect(bhkLabel(0, 'Flat')).toBe('1 RK');
    expect(bhkLabel(7, 'Flat')).toBe('5+ BHK');
  });

  it('omits BHK for commercial and land, and for missing values', () => {
    expect(bhkLabel(2, 'Commercial Office')).toBe('');
    expect(bhkLabel(2, 'Plot')).toBe('');
    expect(bhkLabel(2, 'Co-working')).toBe('');
    expect(bhkLabel(null, 'Flat')).toBe('');
    expect(bhkLabel('', 'Flat')).toBe('');
  });

  it('builds a listing title', () => {
    expect(listingTitle({ bhk: 2, type: 'Flat', deal: 'rent', locality: 'Baner' })).toBe('2 BHK Flat for Rent in Baner');
    expect(listingTitle({ deal: 'sale' })).toBe('Property for Sale in');
    expect(listingTitle({ type: 'Shop', deal: 'sale', locality: 'Aundh' })).toBe('Shop for Sale in Aundh');
  });

  it('formats prices by deal type', () => {
    expect(listingPrice({ deal: 'rent', price: 25000 })).toBe(`${RS}25,000/month`);
    expect(listingPrice({ deal: 'sale', price: 20000000 })).toBe(`${RS}2 Cr`);
    expect(listingPrice({ deal: 'rent', price: 0 })).toBe('');
    expect(listingPrice({ deal: 'rent', price: 'x' })).toBe('');
  });
});

describe('listingHead', () => {
  it('includes price and area in title and description', () => {
    const head = listingHead({ bhk: 2, type: 'Flat', deal: 'rent', locality: 'Baner', price: 25000, area: 1000, areaUnit: 'sqft' });
    expect(head.title).toBe(`2 BHK Flat for Rent in Baner, Pune: ${RS}25,000/month | Draazy`);
    expect(head.description).toBe(`2 BHK Flat for Rent in Baner, Pune: 1,000 sq.ft. at ${RS}25,000/month. Contact the owner directly on Draazy, with no brokerage.`);
  });

  it('degrades without price or area', () => {
    const head = listingHead({ type: 'Flat', deal: 'sale', locality: 'Baner' });
    expect(head.title).toBe('Flat for Sale in Baner, Pune | Draazy');
    expect(head.description).toBe('Flat for Sale in Baner, Pune. Contact the owner directly on Draazy, with no brokerage.');
    expect(listingHead({ type: 'Flat', deal: 'sale', locality: 'B', area: 500 }).description).toContain('Pune: 500 sq.ft.. Contact');
  });
});

describe('property URLs', () => {
  it('prefers an explicit slug', () => {
    expect(propertyPath({ id: ID, slug: 'my-flat' })).toBe('/property/my-flat');
  });

  it('keeps non-uuid ids as they are', () => {
    expect(propertyPath({ id: 42 })).toBe('/property/42');
  });

  it('builds a descriptive slug ending in the lower-cased uuid', () => {
    expect(propertyPath({ id: ID, bhk: 2, type: 'Flat', deal: 'rent', locality: 'Baner Road' }))
      .toBe(`/property/2-bhk-flat-for-rent-baner-road-${ID.toLowerCase()}`);
    expect(propertyPath({ id: ID })).toBe(`/property/property-for-sale-${ID.toLowerCase()}`);
  });

  it('derives the href from a property object', () => {
    expect(propertyHref({ uuid: ID, bhkNum: 3, type: 'Flat', deal: 'sale', locality: 'Aundh' })).toBe(`/property/3-bhk-flat-for-sale-aundh-${ID.toLowerCase()}`);
    expect(propertyHref({ id: '77', slug: 's' })).toBe('/property/s');
    expect(propertyHref({ id: '77' })).toBe('/property/77');
  });

  it('extracts the property key from a route parameter', () => {
    expect(propertyKey(`2-bhk-flat-${ID.toLowerCase()}`)).toBe(ID.toLowerCase());
    expect(propertyKey(ID.toLowerCase())).toBe(ID.toLowerCase());
    expect(propertyKey('42')).toBe('42');
    expect(propertyKey(null)).toBe('');
    expect(propertyKey(`x${ID.toLowerCase()}`)).toBe(`x${ID.toLowerCase()}`);
  });
});

describe('societyHead', () => {
  it('describes a society with builder, year and inventory', () => {
    const head = societyHead({ name: 'Sun City', localitySlug: 'baner-road', builder: 'Kumar', year: 2015, forRent: 1, forSale: 3, listingCount: 4 });
    expect(head.loc).toBe('Baner Road');
    expect(head.where).toBe('Baner Road, Pune');
    expect(head.title).toBe('Sun City, Baner Road, Pune: Homes, Amenities & Reviews | Draazy');
    expect(head.description).toBe('Sun City in Baner Road, Pune by Kumar, built in 2015. 1 home for rent and 3 homes for sale from owners, with no brokerage.');
    expect(head.thin).toBe(false);
  });

  it('falls back to a generic sentence and flags thin pages', () => {
    const head = societyHead({ name: 'Tiny' });
    expect(head).toMatchObject({ loc: '', where: 'Pune', thin: true });
    expect(head.description).toBe('Tiny in Pune. Facts, amenities and resident reviews on Draazy.');
    expect(societyHead({ name: 'A', amenities: ['gym'] }).thin).toBe(false);
    expect(societyHead({ name: 'A', forSale: 2 }).description).toContain('2 homes for sale from owners');
  });
});

describe('crumbs', () => {
  it('numbers each step and absolutises its URL', () => {
    expect(crumbs('https://x.test', [['Home', '/'], ['Rent', '/r']])).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.test/' },
        { '@type': 'ListItem', position: 2, name: 'Rent', item: 'https://x.test/r' },
      ],
    });
  });
});

describe('listingJsonLd', () => {
  const full = {
    id: ID, bhkNum: 2, type: 'Flat', deal: 'rent', locality: 'Baner', localitySlug: 'baner', price: 25000, area: 1000, areaUnit: 'sqft',
    status: 'approved', coverImage: 'https://img.test/1.jpg', images: ['https://img.test/1.jpg', 'http://insecure.test/2.jpg', 'https://img.test/3.jpg'],
    createdAt: '2026-01-05T10:00:00Z', lat: 18.5590123, lng: 73.7870456, amenities: ['gym', 'pool'], societySlug: 'sun-city', societyName: 'Sun City',
    video: 'https://v.test/1.mp4', description: 'Bright home',
  };
  const build = (p, opts) => listingJsonLd(p, opts);
  const nodes = (p, opts) => build(p, opts)['@graph'];

  it('emits a listing, breadcrumb and video for a complete property', () => {
    const doc = build(full);
    expect(doc['@context']).toBe('https://schema.org');
    const [listing, trail, video] = doc['@graph'];
    const url = `https://draazy.com/property/2-bhk-flat-for-rent-baner-${ID.toLowerCase()}`;
    expect(listing).toMatchObject({
      '@type': 'RealEstateListing', '@id': `${url}#listing`, url, name: '2 BHK Flat for Rent in Baner', description: 'Bright home',
      datePosted: '2026-01-05', image: ['https://img.test/1.jpg', 'https://img.test/3.jpg'],
    });
    expect(listing.offers).toMatchObject({
      price: 25000, priceCurrency: 'INR', availability: 'https://schema.org/InStock', businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      priceSpecification: { unitText: 'MONTH', price: 25000 },
    });
    expect(listing.mainEntity).toMatchObject({
      '@type': 'Apartment', numberOfBedrooms: 2, floorSize: { '@type': 'QuantitativeValue', value: 1000, unitCode: 'FTK' },
      geo: { latitude: 18.559, longitude: 73.787 },
      address: { addressLocality: 'Baner', addressRegion: 'Maharashtra', addressCountry: 'IN' },
      containedInPlace: { '@type': 'ApartmentComplex', name: 'Sun City', url: 'https://draazy.com/society/sun-city' },
    });
    expect(listing.mainEntity.amenityFeature.map((a) => a.name)).toEqual(['Gym', 'Pool']);
    expect(trail.itemListElement.map((i) => [i.name, i.item])).toEqual([
      ['Home', 'https://draazy.com/'],
      ['Rent', 'https://draazy.com/listings?deal=rent'],
      ['Baner', 'https://draazy.com/locality/baner'],
      ['Sun City', 'https://draazy.com/society/sun-city'],
      ['2 BHK Flat for Rent in Baner', url],
    ]);
    expect(video).toMatchObject({ '@type': 'VideoObject', contentUrl: 'https://v.test/1.mp4', thumbnailUrl: 'https://img.test/1.jpg', uploadDate: '2026-01-05' });
  });

  it('marks closed or unapproved listings sold out', () => {
    expect(nodes({ ...full, dealStatus: 'closed' })[0].offers.availability).toBe('https://schema.org/SoldOut');
    expect(nodes({ ...full, status: 'pending' })[0].offers.availability).toBe('https://schema.org/SoldOut');
  });

  it('describes a sale without a monthly price specification', () => {
    const offers = nodes({ ...full, deal: 'sale', price: 9000000 })[0].offers;
    expect(offers.businessFunction).toBe('http://purl.org/goodrelations/v1#Sell');
    expect(offers.priceSpecification).toBeUndefined();
  });

  it('uses a Place, skips residence facts for commercial space and omits optional blocks', () => {
    const [listing, trail, extra] = nodes({ id: 5, type: 'Commercial Shop', deal: 'sale', locality: '', price: 0, area: 400, status: 'approved' }, { site: 'https://s.test', path: '/property/5' });
    expect(listing.mainEntity['@type']).toBe('Place');
    expect(listing.mainEntity.floorSize).toBeUndefined();
    expect(listing.mainEntity.numberOfBedrooms).toBeUndefined();
    expect(listing.mainEntity.address.addressLocality).toBeUndefined();
    expect(listing.offers).toBeUndefined();
    expect(listing.datePosted).toBeUndefined();
    expect(listing.image).toBeUndefined();
    expect(listing.url).toBe('https://s.test/property/5');
    expect(trail.itemListElement.map((i) => i.name).slice(0, 3)).toEqual(['Home', 'Buy', 'Pune']);
    expect(trail.itemListElement[2].item).toBe('https://s.test/listings');
    expect(extra).toBeUndefined();
  });

  it('maps property kinds and area units to schema types', () => {
    expect(nodes({ ...full, type: 'Villa' })[0].mainEntity['@type']).toBe('SingleFamilyResidence');
    expect(nodes({ ...full, type: 'Independent House' })[0].mainEntity['@type']).toBe('House');
    expect(nodes({ ...full, areaUnit: 'guntha' })[0].mainEntity.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 1000, unitText: 'guntha' });
    expect(nodes({ ...full, areaUnit: 'sqm' })[0].mainEntity.floorSize.unitCode).toBe('MTK');
  });

  it('falls back to the share image, the generated description and 500 characters', () => {
    const [listing] = nodes({ ...full, coverImage: undefined, images: undefined, description: undefined, video: 'http://nope' });
    expect(listing.description).toContain('Contact the owner directly on Draazy');
    expect(nodes({ ...full, coverImage: undefined, images: undefined, video: undefined })).toHaveLength(2);
    expect(nodes({ ...full, description: 'x'.repeat(900) })[0].description).toHaveLength(500);
  });

  it('only offers the video thumbnail fallback when no image exists', () => {
    const [, , video] = nodes({ ...full, coverImage: undefined, images: [] });
    expect(video.thumbnailUrl).toBe('https://draazy.com/og-image.jpg');
  });

  it('accepts alternate field names and skips studio bedroom counts', () => {
    const [listing] = nodes({ id: 9, bhk: 0, propertyType: 'Flat', deal: 'rent', locality: 'X', price: 100, status: 'approved' });
    expect(listing.name).toBe('1 RK Flat for Rent in X');
    expect(listing.mainEntity.numberOfBedrooms).toBeUndefined();
    expect(listing.mainEntity['@type']).toBe('Apartment');
  });
});
