import { describe, expect, it } from 'vitest';
import {
  ADMIN_MODULES, DESK_BY_VALUE, MODULE_BY_KEY, canAccessModule, canOpenPath, canWriteModule, deskFromFunction, hasPermission, moduleForPath, moduleLabel,
  portalBase, portalPath, runbooksFor, ticketPath,
} from '../../../src/lib/adminModules.js';

const user = (permissions, extra = {}) => ({ role: 'admin', permissions, ...extra });

describe('ticketPath', () => {
  it('opens the loans desk without a view param', () => {
    expect(ticketPath({ desk: 'loans' })).toBe('/admin/home-loans');
    expect(ticketPath({ desk: 'loans', id: 't1' }, true)).toBe('/admin/home-loans?open=t1');
  });

  it('opens other desks on the tickets view', () => {
    expect(ticketPath({ desk: 'legal' })).toBe('/admin/legal?view=tickets');
    expect(ticketPath({ desk: 'legal', id: 't1' }, true)).toBe('/admin/legal?view=tickets&open=t1');
    expect(ticketPath({ desk: 'legal' }, true)).toBe('/admin/legal?view=tickets');
  });

  it('falls back to the loans desk for an unknown or missing ticket', () => {
    expect(ticketPath({ desk: 'nope' })).toBe(DESK_BY_VALUE.loans.path);
    expect(ticketPath(undefined)).toBe(DESK_BY_VALUE.loans.path);
  });
});

describe('permissions', () => {
  it('hasPermission needs an atom and a permissions array', () => {
    expect(hasPermission(user(['a:read']), 'a:read')).toBe(true);
    expect(hasPermission(user(['a:read']), 'b:read')).toBe(false);
    expect(hasPermission(user(['a:read']), undefined)).toBe(false);
    expect(hasPermission({ permissions: 'a:read' }, 'a:read')).toBe(false);
    expect(hasPermission(null, 'a:read')).toBe(false);
  });

  it('canAccessModule lets everyone into base modules and no one into unknown ones', () => {
    expect(canAccessModule(null, 'dashboard')).toBe(true);
    expect(canAccessModule(user([]), 'nope')).toBe(false);
  });

  it('canAccessModule checks any of the listed atoms', () => {
    expect(canAccessModule(user(['reviews:read']), 'reports')).toBe(true);
    expect(canAccessModule(user(['x']), 'reports')).toBe(false);
    expect(canAccessModule(user(['properties:read']), 'properties')).toBe(true);
  });

  it('canAccessModule restricts role-bound modules', () => {
    expect(canAccessModule(user(['audit:read']), 'errorLog')).toBe(true);
    expect(canAccessModule(user(['audit:read'], { role: 'staff' }), 'errorLog')).toBe(false);
  });

  it('staff only reach the desks they are assigned', () => {
    const staff = (desks) => user(['services:read'], { role: 'staff', desks });
    expect(canAccessModule(staff(['legal']), 'desk:legal')).toBe(true);
    expect(canAccessModule(staff(['legal']), 'desk:packers')).toBe(false);
    expect(canAccessModule(staff(undefined), 'desk:legal')).toBe(false);
    expect(canAccessModule(user(['services:read']), 'desk:packers')).toBe(true);
  });

  it('the loans desk uses the tickets atoms', () => {
    expect(canAccessModule(user(['tickets:read']), 'desk:loans')).toBe(true);
    expect(canAccessModule(user(['services:read']), 'desk:loans')).toBe(false);
    expect(canWriteModule(user(['tickets:write']), 'desk:loans')).toBe(true);
    expect(canWriteModule(user(['services:write']), 'desk:legal')).toBe(true);
  });

  it('canWriteModule is false for modules without a write atom', () => {
    expect(canWriteModule(user(['properties:moderate']), 'properties')).toBe(true);
    expect(canWriteModule(user(['x']), 'analytics')).toBe(false);
    expect(canWriteModule(user(['x']), 'nope')).toBe(false);
  });

  it('canOpenPath ignores query/hash and unknown paths, and maps /staff to /admin', () => {
    expect(canOpenPath(user([]), '/admin/users?x=1')).toBe(false);
    expect(canOpenPath(user(['users:read']), '/admin/users#top')).toBe(true);
    expect(canOpenPath(user(['users:read']), '/staff/users')).toBe(true);
    expect(canOpenPath(user([]), '/somewhere/else')).toBe(true);
  });
});

describe('desk functions, labels and portal paths', () => {
  it('deskFromFunction strips the desk: prefix', () => {
    expect(deskFromFunction('desk:legal')).toBe('legal');
    expect(deskFromFunction('other')).toBeNull();
    expect(deskFromFunction(null)).toBeNull();
  });

  it('moduleLabel falls back to the key', () => {
    expect(moduleLabel('users')).toBe('Users');
    expect(moduleLabel('zzz')).toBe('zzz');
  });

  it('portalBase and portalPath switch /admin and /staff', () => {
    expect(portalBase({ role: 'staff' })).toBe('/staff');
    expect(portalBase({ role: 'admin' })).toBe('/admin');
    expect(portalBase(null)).toBe('/admin');
    expect(portalPath({ role: 'staff' }, '/admin/users?x=1')).toBe('/staff/users?x=1');
    expect(portalPath({ role: 'staff' }, '/admin')).toBe('/staff');
    expect(portalPath({ role: 'admin' }, '/staff/users')).toBe('/admin/users');
    expect(portalPath({ role: 'staff' }, '/administer')).toBe('/administer');
  });

  it('every module key and path is unique', () => {
    expect(new Set(ADMIN_MODULES.map((m) => m.key)).size).toBe(ADMIN_MODULES.length);
    expect(new Set(ADMIN_MODULES.map((m) => m.path)).size).toBe(ADMIN_MODULES.length);
    expect(MODULE_BY_KEY.users.path).toBe('/admin/users');
  });
});

describe('moduleForPath', () => {
  it('matches exact and nested paths, preferring the longest', () => {
    expect(moduleForPath('/admin/users').key).toBe('users');
    expect(moduleForPath('/admin/users/42').key).toBe('users');
    expect(moduleForPath('/admin/users/').key).toBe('users');
    expect(moduleForPath('/staff/users').key).toBe('users');
  });

  it('keeps the dashboard exact', () => {
    expect(moduleForPath('/admin').key).toBe('dashboard');
    expect(moduleForPath('/admin/')).toBe(MODULE_BY_KEY.dashboard);
    expect(moduleForPath('/admin/unknown-page')).toBeNull();
  });
});

describe('runbooksFor', () => {
  const articles = [
    { id: 1, category: 'ops-playbook' },
    { id: 2, category: 'ops-playbook', modules: [] },
    { id: 3, category: 'ops-playbook', modules: ['users'] },
    { id: 4, category: 'ops-playbook', modules: ['users', 'analytics'] },
    { id: 5, category: 'faq' },
  ];

  it('keeps general playbooks and those whose modules the user can open', () => {
    expect(runbooksFor(articles, user(['analytics:read'])).map((a) => a.id)).toEqual([1, 2, 4]);
    expect(runbooksFor(articles, user(['users:read'])).map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(runbooksFor(articles, user([])).map((a) => a.id)).toEqual([1, 2]);
  });
});
