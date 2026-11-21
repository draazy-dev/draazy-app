import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isViewableDoc, openDocFrom, openDocUrl } from '../../../src/lib/openDoc.js';

const PDF = 'data:application/pdf;base64,JVBERi0=';
const PNG = 'data:image/png;base64,iVBORw0=';

describe('isViewableDoc', () => {
  it('accepts raster/pdf data URLs, same-origin paths and http(s) URLs', () => {
    expect(isViewableDoc(PDF)).toBe(true);
    expect(isViewableDoc(PNG)).toBe(true);
    expect(isViewableDoc('/files/a.pdf')).toBe(true);
    expect(isViewableDoc('https://cdn.example/a.pdf')).toBe(true);
    expect(isViewableDoc('http://cdn.example/a.pdf')).toBe(true);
  });

  it('rejects SVG, scripts, protocol-relative paths and the dev storage stub', () => {
    expect(isViewableDoc('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isViewableDoc('data:text/html;base64,AAAA')).toBe(false);
    expect(isViewableDoc('javascript:alert(1)')).toBe(false);
    expect(isViewableDoc('//evil.example/x')).toBe(false);
    expect(isViewableDoc('/\\evil.example/x')).toBe(false);
    expect(isViewableDoc('https://mock.storage.local/x.pdf')).toBe(false);
    expect(isViewableDoc('')).toBe(false);
    expect(isViewableDoc(undefined)).toBe(false);
  });
});

describe('opening documents', () => {
  let viewer;

  beforeEach(() => {
    viewer = { opener: 'self', location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockImplementation(() => viewer);
  });
  afterEach(() => vi.useRealTimers());

  it('openDocFrom opens a blank tab first, detaches it and navigates to the fetched URL', async () => {
    const fetchUrl = vi.fn().mockResolvedValue('https://cdn.example/a.pdf');
    await expect(openDocFrom(fetchUrl)).resolves.toBe(true);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(viewer.opener).toBeNull();
    expect(viewer.location.replace).toHaveBeenCalledWith('https://cdn.example/a.pdf');
  });

  it('openDocFrom reports a blocked popup without fetching', async () => {
    window.open.mockReturnValue(null);
    const fetchUrl = vi.fn();
    await expect(openDocFrom(fetchUrl)).resolves.toBe(false);
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it('openDocFrom closes the tab when the fetch fails or the URL is unsafe', async () => {
    await expect(openDocFrom(() => Promise.reject(new Error('x')))).resolves.toBe(false);
    expect(viewer.close).toHaveBeenCalledTimes(1);
    await expect(openDocFrom(() => Promise.resolve('javascript:alert(1)'))).resolves.toBe(false);
    expect(viewer.close).toHaveBeenCalledTimes(2);
    expect(viewer.location.replace).not.toHaveBeenCalled();
  });

  it('openDocUrl refuses unsafe URLs without opening a tab', () => {
    expect(openDocUrl('javascript:alert(1)')).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('openDocUrl reports a blocked popup', () => {
    window.open.mockReturnValue(null);
    expect(openDocUrl('/a.pdf')).toBe(false);
  });

  it('openDocUrl navigates directly for network URLs', () => {
    expect(openDocUrl('https://cdn.example/a.pdf')).toBe(true);
    expect(viewer.opener).toBeNull();
    expect(viewer.location.replace).toHaveBeenCalledWith('https://cdn.example/a.pdf');
  });

  it('openDocUrl converts data URLs to a revoked-later blob URL', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:abc');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(function URLStub() {}, { createObjectURL: create, revokeObjectURL: revoke }));
    expect(openDocUrl(PDF)).toBe(true);
    const blob = create.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(5);
    expect(viewer.location.replace).toHaveBeenCalledWith('blob:abc');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:abc');
    vi.unstubAllGlobals();
  });
});
