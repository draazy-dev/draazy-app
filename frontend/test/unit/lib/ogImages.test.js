import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LISTING_OG_TYPES, OG_PAGES, OG_SIZE, SITE_OG, flatmatesOg, landingOg, listingOg, pageOg, routeOg,
} from '../../../src/lib/ogImages.js';

describe('ogImages', () => {
  it('exposes the card size and site fallback', () => {
    expect(OG_SIZE).toEqual([1200, 630]);
    expect(SITE_OG).toBe('/og-image.jpg');
    expect(existsSync(resolve(process.cwd(), 'public/og-image.jpg'))).toBe(true);
  });

  it('maps the home route to the site card and others to a flattened name', () => {
    expect(routeOg('/')).toBe(SITE_OG);
    expect(routeOg('/services/rent-agreement')).toBe('/og/route/services-rent-agreement.jpg');
  });

  it('maps listing types to a card per deal', () => {
    expect(listingOg('Farm Land', 'buy')).toBe('/og/listing/buy-farmland.jpg');
    expect(listingOg('Apartment', 'rent')).toBe('/og/listing/rent-flat.jpg');
    expect(listingOg('Shop / Showroom', 'rent')).toBe('/og/listing/rent-commercial.jpg');
    expect(listingOg('Open Plot', 'sale')).toBe('/og/listing/buy-plot.jpg');
  });

  it('falls back to the site card for unknown or missing types', () => {
    expect(listingOg('Spaceship', 'rent')).toBe(SITE_OG);
    expect(listingOg(undefined, undefined)).toBe(SITE_OG);
  });

  it('builds landing, flatmates and page card paths', () => {
    expect(landingOg('rent', 'baner')).toBe('/og/rent/baner.jpg');
    expect(landingOg('sale', 'baner')).toBe('/og/buy/baner.jpg');
    expect(flatmatesOg('pune')).toBe('/og/flatmates/pune.jpg');
    expect(pageOg('signup')).toBe('/og/page/signup.jpg');
    expect(OG_PAGES).toContain('signup');
    expect(LISTING_OG_TYPES.length).toBeGreaterThan(0);
  });
});
