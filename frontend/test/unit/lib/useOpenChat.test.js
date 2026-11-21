import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserError } from '../../../src/lib/userError.js';

const navigate = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();
const startConversation = vi.fn();

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../../../src/services/conversationService.js', () => ({
  listConversations: (...a) => listConversations(...a),
  getConversation: (...a) => getConversation(...a),
  startConversation: (...a) => startConversation(...a),
}));

import { useOpenChat } from '../../../src/lib/useOpenChat.js';

const open = (toast) => renderHook(() => useOpenChat(toast)).result.current;

beforeEach(() => {
  [navigate, listConversations, getConversation, startConversation].forEach((m) => m.mockReset());
  listConversations.mockResolvedValue([]);
});

describe('useOpenChat', () => {
  it('opens an existing thread for the same property and counterpart', async () => {
    listConversations.mockResolvedValue([
      { id: 'c-staged', propertyId: 'p1', staged: true },
      { id: 'c-group', propertyId: 'p1', group: true },
      { id: 'c-other', propertyId: 'p2' },
      { id: 'c-wrong', propertyId: 'p1' },
      { id: 'c-slug', propertySlug: 'p1' },
    ]);
    getConversation.mockImplementation(async (id) => ({ id, party: { mobile: id === 'c-slug' ? '+91 98765 43210' : '9111111111' } }));
    await open()({ mobile: '9876543210', propertyId: 'p1', greeting: 'Hi' });
    expect(getConversation.mock.calls.map((c) => c[0])).toEqual(['c-wrong', 'c-slug']);
    expect(startConversation).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/messages?c=c-slug');
  });

  it('starts a conversation with an idempotent client id when none exists', async () => {
    startConversation.mockResolvedValue({ id: 'new 1' });
    await open()({ mobile: '098765 43210', propertyId: 'p1', greeting: 'Hello there' });
    expect(startConversation).toHaveBeenCalledWith({
      counterpartyMobile: '9876543210', propertyId: 'p1', firstMessage: 'Hello there', clientId: 'open:p1:9876543210',
    });
    expect(navigate).toHaveBeenCalledWith('/messages?c=new%201');
  });

  it('skips the lookup when there is no property id', async () => {
    startConversation.mockResolvedValue({ id: 'n' });
    await open()({ mobile: '9876543210' });
    expect(listConversations).not.toHaveBeenCalled();
    expect(startConversation).toHaveBeenCalledWith(expect.objectContaining({ propertyId: undefined, clientId: 'open::9876543210' }));
  });

  it('shows a friendly toast on failure', async () => {
    const toast = vi.fn();
    startConversation.mockRejectedValue(new TypeError('secret internal detail'));
    await open(toast)({ mobile: '9876543210', propertyId: 'p1' });
    expect(toast).toHaveBeenCalledWith('Could not open the chat. Please try again.', 'error');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('passes through messages written for the user', async () => {
    const toast = vi.fn();
    startConversation.mockRejectedValue(new UserError('You cannot message yourself'));
    await open(toast)({ mobile: '9876543210', propertyId: 'p1' });
    expect(toast).toHaveBeenCalledWith('You cannot message yourself', 'error');
  });

  it('works without a toast callback', async () => {
    startConversation.mockRejectedValue(new Error('x'));
    await expect(open()({ mobile: '9876543210', propertyId: 'p1' })).resolves.toBeUndefined();
  });
});
