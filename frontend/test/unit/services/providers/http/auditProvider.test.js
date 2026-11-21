import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import { listAuditLog } from '../../../../../src/services/providers/http/auditProvider.js';

describe('auditProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('sends defaults and only the set filters', async () => {
    net.reply({ content: [] });
    await listAuditLog({ actor: 'a1', entity: 'Property', from: '2026-01-01' });
    expect(net.last().path).toBe('/admin/audit-log');
    expect(net.last().query).toEqual({ actor: 'a1', entity: 'Property', from: '2026-01-01', page: '0', size: '50' });
  });

  it('maps rows with defaults and unwraps the page', async () => {
    net.reply({
      content: [
        { id: 'e1', actor: 'u1', action: 'EDIT', metadata: { k: 1 }, at: 't' },
        { actorName: 'Named', metadata: 'str' },
        null,
      ],
      totalElements: 3,
      totalPages: 1,
      number: 2,
      size: 10,
    });
    const res = await listAuditLog({ entityId: 'x', to: 'z', page: 2, size: 10 });
    expect(net.last().query).toMatchObject({ entityId: 'x', to: 'z' });
    expect(res).toMatchObject({ page: 2, size: 10, total: 3, totalPages: 1 });
    expect(res.items[0]).toEqual({
      id: 'e1', actor: 'u1', actorName: 'u1', actorRole: '', action: 'EDIT', entity: '', entityId: null, checker: null, at: 't', metadata: { k: 1 },
    });
    expect(res.items[1]).toMatchObject({ id: '', actorName: 'Named', metadata: {} });
    expect(res.items[2]).toMatchObject({ id: '', actor: '', actorName: '' });
  });

  it('accepts a bare array response', async () => {
    net.reply([{ id: 'a' }]);
    const res = await listAuditLog();
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
  });
});
