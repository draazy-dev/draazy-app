import { describe, expect, it } from 'vitest';
import {
  STEPS, inviteRouteFor, invitePath, isActive, progressPct, statusMeta, stepStates,
} from '../../../src/lib/serviceRequestStatus.js';

describe('stepStates', () => {
  it('marks everything done once completed and nothing started while unpaid', () => {
    expect(stepStates('completed')).toEqual(Array(STEPS.length).fill('done'));
    expect(stepStates('awaiting_payment')).toEqual(Array(STEPS.length).fill('todo'));
  });

  it('marks earlier steps done, the current step active and later steps todo', () => {
    expect(stepStates('docs_review')).toEqual(['done', 'active', 'todo', 'todo', 'todo']);
    expect(stepStates('draft_shared')).toEqual(['done', 'done', 'active', 'todo', 'todo']);
    expect(stepStates('registration')).toEqual(['done', 'done', 'done', 'active', 'todo']);
  });

  it('starts at the first step for unknown or waiting statuses', () => {
    expect(stepStates('mystery')).toEqual(['active', 'todo', 'todo', 'todo', 'todo']);
    expect(stepStates('awaiting_party')[0]).toBe('active');
  });
});

describe('isActive and progressPct', () => {
  it('treats completed and cancelled as finished', () => {
    expect(isActive('submitted')).toBe(true);
    expect(isActive('completed')).toBe(false);
    expect(isActive('cancelled')).toBe(false);
  });

  it('reports progress as a percentage of the steps', () => {
    expect(progressPct('cancelled')).toBeNull();
    expect(progressPct('completed')).toBe(100);
    expect(progressPct('submitted')).toBe(25);
    expect(progressPct('draft_shared')).toBe(50);
    expect(progressPct('approved')).toBe(75);
    expect(progressPct('unknown')).toBe(0);
  });
});

describe('statusMeta', () => {
  it('describes known statuses', () => {
    expect(statusMeta('completed')).toMatchObject({ label: 'Registered & ready', icon: 'badge-check' });
    expect(statusMeta('changes_requested')).toMatchObject({ label: 'Changes requested', icon: 'rotate-ccw' });
  });

  it('falls back to a neutral in-progress entry', () => {
    expect(statusMeta('whatever')).toMatchObject({ label: 'In progress', icon: 'loader' });
    expect(statusMeta(undefined).label).toBe('In progress');
  });
});

describe('rent agreement links', () => {
  it('encodes invite ids', () => {
    expect(invitePath('a b&c')).toBe('/services/rent-agreement?invite=a%20b%26c');
    expect(invitePath()).toBe('/services/rent-agreement?invite=');
  });

  it('builds the party route from a row', () => {
    expect(inviteRouteFor({ id: 'p 1', requestId: 'r/2' })).toBe('/services/rent-agreement?party=p%201&request=r%2F2');
    expect(inviteRouteFor(null)).toBe('/services/rent-agreement?party=&request=');
  });
});
