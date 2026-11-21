import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import usePageHead from '../../../src/lib/usePageHead.js';

const meta = (sel) => document.head.querySelector(sel);

afterEach(() => {
  cleanup();
  document.head.innerHTML = '<title>Shell</title>';
  document.title = 'Shell';
});

describe('usePageHead', () => {
  it('does nothing without a title', () => {
    document.title = 'Before';
    renderHook(() => usePageHead({ description: 'd' }));
    expect(document.title).toBe('Before');
    expect(meta('meta[name="description"]')).toBeNull();
  });

  it('writes the title and social tags, then restores everything on unmount', () => {
    document.head.innerHTML = '<title>Shell</title><meta name="description" content="shell desc">';
    document.title = 'Shell';
    const { unmount } = renderHook(() => usePageHead({
      title: 'Flat in Baner', description: 'Nice', path: '/p/1', image: 'https://i/x.jpg', imageAlt: 'alt', noindex: true,
    }));
    expect(document.title).toBe('Flat in Baner');
    expect(meta('meta[name="description"]').content).toBe('Nice');
    expect(meta('link[rel="canonical"]').href).toBe('https://draazy.com/p/1');
    expect(meta('meta[name="robots"]').content).toBe('noindex');
    expect(meta('meta[property="og:title"]').content).toBe('Flat in Baner');
    expect(meta('meta[property="og:description"]').content).toBe('Nice');
    expect(meta('meta[property="og:url"]').content).toBe('https://draazy.com/p/1');
    expect(meta('meta[property="og:type"]').content).toBe('website');
    expect(meta('meta[property="og:image"]').content).toBe('https://i/x.jpg');
    expect(meta('meta[property="og:image:alt"]').content).toBe('alt');
    expect(meta('meta[name="twitter:title"]').content).toBe('Flat in Baner');
    expect(meta('meta[name="twitter:description"]').content).toBe('Nice');
    expect(meta('meta[name="twitter:image"]').content).toBe('https://i/x.jpg');
    unmount();
    expect(document.title).toBe('Shell');
    expect(meta('meta[name="description"]').content).toBe('shell desc');
    expect(meta('link[rel="canonical"]')).toBeNull();
    expect(meta('meta[property="og:title"]')).toBeNull();
    expect(meta('meta[name="robots"]')).toBeNull();
  });

  it('restores the pre-rendered shell values recorded in data-shell', () => {
    document.head.innerHTML = '<title data-shell="Shell title">Live</title><meta property="og:title" content="live" data-shell="shell og">';
    const { unmount } = renderHook(() => usePageHead({ title: 'Page' }));
    expect(document.title).toBe('Page');
    expect(meta('meta[property="og:title"]').content).toBe('Page');
    expect(meta('meta[property="og:title"]').hasAttribute('data-shell')).toBe(false);
    unmount();
    expect(document.title).toBe('Shell title');
    expect(meta('meta[property="og:title"]').content).toBe('shell og');
  });

  it('adds JSON-LD from objects or strings and removes it on unmount', () => {
    const { unmount, rerender } = renderHook(({ ld }) => usePageHead({ title: 'T', jsonLd: ld }), { initialProps: { ld: { a: 1 } } });
    const script = meta('script[type="application/ld+json"]');
    expect(script.hasAttribute('data-page-head')).toBe(true);
    expect(JSON.parse(script.textContent)).toEqual({ a: 1 });
    rerender({ ld: '{"b":2}' });
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(meta('script[type="application/ld+json"]').textContent).toBe('{"b":2}');
    unmount();
    expect(meta('script[type="application/ld+json"]')).toBeNull();
  });

  it('honours a custom og:type and updates when the title changes', () => {
    const { rerender } = renderHook(({ t }) => usePageHead({ title: t, type: 'article' }), { initialProps: { t: 'One' } });
    expect(meta('meta[property="og:type"]').content).toBe('article');
    rerender({ t: 'Two' });
    expect(document.title).toBe('Two');
    expect(meta('meta[property="og:title"]').content).toBe('Two');
  });
});
