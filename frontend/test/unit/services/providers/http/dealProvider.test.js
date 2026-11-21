import { describe, expect, it, vi } from 'vitest';
import { setupFetch } from '../net.js';
import { writeTokens } from '../../../../../src/lib/auth.js';
import {
  lastActorOf, mayRespond, toDealViewModel, toFinalizationViewModel, toOfferViewModel, toPartyViewModel,
} from '../../../../../src/services/providers/http/dealMapper.js';
import * as deals from '../../../../../src/services/providers/http/dealProvider.js';

describe('dealMapper', () => {
  it('lastActorOf defaults to buyer', () => {
    expect(lastActorOf(undefined)).toBe('buyer');
    expect(lastActorOf([])).toBe('buyer');
    expect(lastActorOf([{ by: 'owner' }, { by: 'buyer' }, {}])).toBe('buyer');
    expect(lastActorOf([{ by: 'buyer' }, { by: 'owner' }])).toBe('owner');
  });

  it('toOfferViewModel maps a full row', () => {
    const vm = toOfferViewModel({
      id: 'o1',
      propertyId: 'p1',
      amount: '5000',
      status: 'countered',
      message: 'hi',
      from: { id: 'u1', name: 'Asha', mobile: '99', verified: true },
      history: [{ amount: '4000', by: 'buyer', at: '2026-01-01T00:00:00Z' }, { amount: 'x', at: 'bad' }],
      createdAt: '2026-01-02T00:00:00Z',
      moveIn: '2026-02-01',
    });
    expect(vm).toEqual({
      id: 'o1',
      propId: 'p1',
      propertyId: 'p1',
      amount: 5000,
      status: 'countered',
      message: 'hi',
      from: 'buyer',
      buyerId: 'u1',
      buyerName: 'Asha',
      buyerMobile: '99',
      buyerVerified: true,
      history: [
        { amount: 4000, by: 'buyer', at: Date.parse('2026-01-01T00:00:00Z') },
        { amount: 0, by: 'buyer', at: NaN },
      ],
      createdAt: Date.parse('2026-01-02T00:00:00Z'),
      moveIn: '2026-02-01',
    });
  });

  it('toOfferViewModel defaults for an empty row', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    try {
      expect(toOfferViewModel(null)).toMatchObject({
        id: '', amount: 0, status: 'pending', buyerName: 'Buyer', buyerVerified: false, history: [], moveIn: '',
        createdAt: Date.parse('2026-03-01T00:00:00Z'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('mayRespond lets anyone counter but only owners accept/reject', () => {
    expect(mayRespond('counter', false)).toBe(true);
    expect(mayRespond('accept', false)).toBe(false);
    expect(mayRespond('accept', true)).toBe(true);
  });

  it('toDealViewModel', () => {
    expect(toDealViewModel({
      id: 'd', propertyId: 'p', deal: 'rent', status: 'closed', agreedPrice: '100', closedAt: '2026-01-01T00:00:00Z',
      counterparty: { id: 'c', name: 'N', mobile: 'M' },
    })).toEqual({
      id: 'd', propId: 'p', propertyId: 'p', deal: 'rent', status: 'closed', agreedPrice: 100,
      closedAt: Date.parse('2026-01-01T00:00:00Z'), counterpartyName: 'N', counterpartyMobile: 'M', counterpartyId: 'c',
    });
    expect(toDealViewModel(undefined)).toMatchObject({ deal: 'buy', status: 'active', agreedPrice: null, closedAt: null, counterpartyName: '' });
  });

  it('toPartyViewModel and toFinalizationViewModel', () => {
    expect(toPartyViewModel({ id: 'x', name: 'N', mobile: 'M', note: 'n', at: '2026-01-01T00:00:00Z' }))
      .toEqual({ id: 'x', name: 'N', mobile: 'M', note: 'n', at: Date.parse('2026-01-01T00:00:00Z') });
    expect(toPartyViewModel({})).toMatchObject({ name: 'Interested party', mobile: '', note: '' });
    expect(toFinalizationViewModel(null)).toBeNull();
    expect(toFinalizationViewModel({})).toBeNull();
    expect(toFinalizationViewModel({
      id: 'f', propertyId: 'p', status: 'accepted', agreedPrice: '9',
      initiator: { id: 'i', name: 'B', mobile: 'm', verified: true }, counterparty: { id: 'c', name: 'C' },
      createdAt: '2026-01-01T00:00:00Z',
    })).toEqual({
      id: 'f', propId: 'p', propertyId: 'p', status: 'accepted', agreedPrice: 9, initiatorId: 'i', buyerName: 'B',
      buyerMobile: 'm', buyerVerified: true, counterpartyId: 'c', counterpartyName: 'C', createdAt: Date.parse('2026-01-01T00:00:00Z'),
    });
    expect(toFinalizationViewModel({ id: 'f' })).toMatchObject({ status: 'pending', agreedPrice: 0, buyerName: 'Buyer' });
  });
});

describe('dealProvider', () => {
  const net = setupFetch();

  it('signed-out reads return empty values without calling the API', async () => {
    expect(await deals.getDeal('p1')).toBeNull();
    expect(await deals.listParties('p1')).toEqual([]);
    expect(await deals.myOffers()).toEqual([]);
    expect(await deals.offersOnMine()).toEqual([]);
    expect(await deals.finalizationStatus('p1')).toBeNull();
    expect(await deals.myFinalizationRequests()).toEqual([]);
    expect(net.calls).toHaveLength(0);
  });

  describe('signed in', () => {
    const signIn = () => writeTokens({ accessToken: 't' });

    it('getDeal / listParties need an id', async () => {
      signIn();
      expect(await deals.getDeal('')).toBeNull();
      expect(await deals.listParties('')).toEqual([]);
      expect(await deals.finalizationStatus('')).toBeNull();
      expect(net.calls).toHaveLength(0);
    });

    it('getDeal maps the deal', async () => {
      signIn();
      net.reply({ id: 'd1', propertyId: 'a/b', status: 'reserved' });
      const vm = await deals.getDeal('a/b');
      expect(net.last().path).toBe('/me/deals/a%2Fb');
      expect(vm).toMatchObject({ id: 'd1', status: 'reserved' });
      expect(net.last().headers.Authorization).toBe('Bearer t');
    });

    it('dealStatusForBuyer reads the property status', async () => {
      expect(await deals.dealStatusForBuyer({ dealStatus: 'closed' })).toBe('closed');
      expect(await deals.dealStatusForBuyer(null)).toBe('active');
    });

    it('reserve / close / reopen post the right bodies', async () => {
      signIn();
      await deals.reserveDeal('p1');
      expect(net.last()).toMatchObject({ path: '/me/deals/p1/reserve', method: 'POST', body: {} });
      await deals.closeDeal('p1', { agreedPrice: '1200', counterpartyMobile: '+91 98765-43210', note: '' });
      expect(net.last()).toMatchObject({ path: '/me/deals/p1/close', body: { agreedPrice: 1200, counterpartyMobile: '919876543210' } });
      expect(net.last().body.note).toBeUndefined();
      await deals.closeDeal('p1');
      expect(net.last().body).toEqual({ agreedPrice: 0, counterpartyMobile: '' });
      await deals.reopenDeal('p1', '2026-05-01');
      expect(net.last().body).toEqual({ availableOn: '2026-05-01' });
      await deals.reopenDeal('p1');
      expect(net.last().body).toEqual({});
    });

    it('listParties maps rows and tolerates non-arrays', async () => {
      signIn();
      net.reply([{ id: 'x', name: 'N' }]);
      expect(await deals.listParties('p1')).toMatchObject([{ id: 'x', name: 'N' }]);
      net.reply({});
      expect(await deals.listParties('p2')).toEqual([]);
    });

    it('submitOffer posts a normalised offer', async () => {
      net.reply({ id: 'o1', propertyId: 'p1', amount: 10 });
      const vm = await deals.submitOffer({ propId: 'p1', amount: '10', message: '', moveIn: '2026-06-01' });
      expect(net.last()).toMatchObject({ path: '/offers', method: 'POST', body: { propertyId: 'p1', amount: 10, moveIn: '2026-06-01' } });
      expect(net.last().body.message).toBeUndefined();
      expect(vm.id).toBe('o1');
      await deals.submitOffer();
      expect(net.last().body).toEqual({ amount: 0 });
    });

    it('respondOffer blocks non-owners from accepting without calling the API', async () => {
      await expect(deals.respondOffer('o1', 'accept', 0)).rejects.toThrow('Only the listing owner can accept');
      expect(net.calls).toHaveLength(0);
    });

    it('respondOffer sends counterAmount only for counters', async () => {
      await deals.respondOffer('o1', 'counter', '700', { message: 'm' });
      expect(net.last()).toMatchObject({ path: '/offers/o1/respond', body: { action: 'counter', counterAmount: 700, message: 'm' } });
      await deals.respondOffer('o1', 'accept', 700, { isOwner: true });
      expect(net.last().body).toEqual({ action: 'accept' });
    });

    it('myOffers / offersOnMine page requests and mapping', async () => {
      signIn();
      net.reply({ content: [{ id: 'o1', propertyId: 'p1' }] });
      expect((await deals.myOffers({ propertyId: 'p1' }))[0].id).toBe('o1');
      expect(net.last()).toMatchObject({ path: '/offers/mine', query: { propertyId: 'p1', size: '100' } });
      net.reply([{ id: 'o2' }]);
      expect((await deals.offersOnMine())[0].id).toBe('o2');
      expect(net.last()).toMatchObject({ path: '/me/offers', query: { size: '100' } });
    });

    it('finalization lifecycle endpoints', async () => {
      signIn();
      net.reply({ id: 'f1', propertyId: 'p1' });
      expect((await deals.requestFinalization('p1', { counterpartyMobile: '98-76', agreedPrice: '5' })).id).toBe('f1');
      expect(net.last()).toMatchObject({
        path: '/finalization/p1/request', body: { propertyId: 'p1', counterpartyMobile: '9876', agreedPrice: 5 },
      });
      net.reply(null);
      expect(await deals.finalizationStatus('p1')).toBeNull();
      expect(net.last().path).toBe('/finalization/p1/status');
      await deals.cancelFinalization('p1');
      expect(net.last()).toMatchObject({ path: '/finalization/p1/status', method: 'DELETE' });
      net.reply({ content: [{ id: 'f1' }, {}] });
      expect(await deals.myFinalizationRequests({ propertyId: 'p1' })).toHaveLength(1);
      await deals.acceptFinalization('r 1');
      expect(net.last()).toMatchObject({ path: '/finalization/requests/r%201/accept', method: 'POST' });
      await deals.declineFinalization('r1');
      expect(net.last().path).toBe('/finalization/requests/r1/decline');
    });
  });
});
