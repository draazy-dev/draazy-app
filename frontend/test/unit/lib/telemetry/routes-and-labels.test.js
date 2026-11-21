import { describe, expect, it } from 'vitest';
import { ROUTE_PATTERNS, UNMATCHED, isBackOffice, toRoutePattern } from '../../../../src/lib/telemetry/routePatterns.js';
import { pageLabel } from '../../../../src/lib/telemetry/pageLabels.js';

describe('toRoutePattern', () => {
  it('collapses ids and slugs into their route pattern', () => {
    expect(toRoutePattern('/property/abc-123')).toBe('/property/:id');
    expect(toRoutePattern('/rent/baner/2-bhk')).toBe('/rent/:place/:bhk');
    expect(toRoutePattern('/buy/aundh')).toBe('/buy/:place');
    expect(toRoutePattern('/view-documents/9f2')).toBe('/view-documents/:requestId');
    expect(toRoutePattern('/help/a/how-to-list')).toBe('/help/a/:slug');
  });

  it('keeps static routes as they are', () => {
    expect(toRoutePattern('/')).toBe('/');
    expect(toRoutePattern('/listings')).toBe('/listings');
    expect(toRoutePattern('/ops/legal')).toBe('/ops/legal');
  });

  it('prefers a specific route over a wildcard sibling', () => {
    expect(toRoutePattern('/flatmates/room/7')).toBe('/flatmates/:kind/:id');
    expect(toRoutePattern('/flatmates/baner')).toBe('/flatmates/:place');
    expect(toRoutePattern('/ops/unknown-tool')).toBe('/ops/*');
  });

  it('uses the wildcard bucket for unknown paths and a missing pathname', () => {
    expect(toRoutePattern('/totally/unknown/page')).toBe(UNMATCHED);
    expect(toRoutePattern('')).toBe('/');
    expect(toRoutePattern(undefined)).toBe('/');
  });

  it('never leaks personal identifiers in the registered patterns', () => {
    expect(ROUTE_PATTERNS.every((p) => !/\d{6,}/.test(p))).toBe(true);
  });
});

describe('isBackOffice', () => {
  it('flags admin, ops and staff areas', () => {
    expect(['/admin', '/ops', '/admin/*', '/ops/legal', '/staff/*'].every(isBackOffice)).toBe(true);
  });

  it('does not flag public routes with a similar prefix', () => {
    expect(['/', '/staff-login', '/staff-invite', '/operations', '/administrator'].some(isBackOffice)).toBe(false);
  });
});

describe('pageLabel', () => {
  it('labels known routes and echoes unknown ones', () => {
    expect(pageLabel('/')).toBe('Home');
    expect(pageLabel('/property/:id')).toBe('Property detail');
    expect(pageLabel('/*')).toBe('Not found (404)');
    expect(pageLabel('/blog/:slug')).toBe('/blog/:slug');
  });
});
