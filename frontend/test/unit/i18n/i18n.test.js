import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n, { loadNamespaces } from '../../../src/i18n/index.js';
import { EAGER_NAMESPACES } from '../../../src/i18n/namespaces.js';
import { lazyPage } from '../../../src/i18n/lazyPage.js';
import enListings from '../../../src/i18n/locales/en/listings.json';

describe('i18n instance', () => {
  it('ships the eager namespaces in English', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.options.fallbackLng).toEqual(['en']);
    expect(i18n.options.interpolation.escapeValue).toBe(false);
    expect(EAGER_NAMESPACES).toEqual(['auth', 'chrome', 'common', 'help', 'home', 'misc1']);
    expect(i18n.exists('common.alreadyReviewed')).toBe(true);
  });

  it('returns the key when a translation is missing', () => {
    expect(i18n.t('definitely.not.a.key')).toBe('definitely.not.a.key');
  });
});

describe('loadNamespaces', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves to nothing without doing any work for eager or no namespaces', async () => {
    const add = vi.spyOn(i18n, 'addResourceBundle');
    await expect(loadNamespaces([])).resolves.toBeUndefined();
    await expect(loadNamespaces(EAGER_NAMESPACES)).resolves.toBeUndefined();
    expect(add).not.toHaveBeenCalled();
  });

  it('loads a lazy namespace into the translation bundle and interpolates it', async () => {
    expect(i18n.exists('listings.titleShortForRent')).toBe(false);
    await expect(loadNamespaces(['listings'])).resolves.toBeUndefined();
    expect(enListings.listings.titleShortForRent).toBe('Rent in {{city}}');
    expect(i18n.t('listings.titleShortForRent', { city: 'Pune' })).toBe('Rent in Pune');
  });

  it('shares one load between concurrent callers and does not reload a loaded namespace', async () => {
    const add = vi.spyOn(i18n, 'addResourceBundle');
    await Promise.all([loadNamespaces(['dashboard']), loadNamespaces(['dashboard', 'common'])]);
    await loadNamespaces(['dashboard']);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('en', 'translation', expect.any(Object), true, true);
  });

  it('reports an unknown namespace without failing the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadNamespaces(['no-such-namespace'])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('no-such-namespace');
  });

  it('retries a failed load once before giving up quietly', async () => {
    const add = vi.spyOn(i18n, 'addResourceBundle');
    add.mockImplementationOnce(() => { throw new Error('flaky'); });
    await expect(loadNamespaces(['flatmates'])).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(2);
    expect(i18n.exists('flatmates', { ns: 'translation' })).toBe(true);
  });

  it('logs, forgets a namespace that failed twice and loads it on the next attempt', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const add = vi.spyOn(i18n, 'addResourceBundle');
    add.mockImplementationOnce(() => { throw new Error('down'); }).mockImplementationOnce(() => { throw new Error('down'); });
    await expect(loadNamespaces(['locality'])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"locality"'), expect.any(Error));
    expect(add).toHaveBeenCalledTimes(2);
    await loadNamespaces(['locality']);
    expect(add).toHaveBeenCalledTimes(3);
    expect(add.mock.results[2].type).toBe('return');
  });
});

describe('lazyPage', () => {
  it('waits for both the page module and its namespaces', async () => {
    const add = vi.spyOn(i18n, 'addResourceBundle');
    const Page = () => null;
    const loader = vi.fn(async () => ({ default: Page }));
    const wrapped = lazyPage(loader, 'compare-saved');
    expect(typeof wrapped).toBe('function');
    expect(loader).not.toHaveBeenCalled();
    await wrapped.preload();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('keeps the preload promise quiet when the page fails to load', async () => {
    const wrapped = lazyPage(() => Promise.reject(new Error('chunk')));
    await expect(wrapped.preload()).resolves.toBeUndefined();
  });
});
