import { describe, expect, it } from 'vitest';
import {
  CARD_SIZES, GALLERY_SIZES, cardSrcSet, gallerySrcSet, srcSetFor,
} from '../../../src/lib/imgSrcSet.js';

describe('srcSetFor', () => {
  it('rewrites the w parameter for each width', () => {
    expect(srcSetFor('https://img.test/a.jpg?w=800&q=80')).toBe(
      'https://img.test/a.jpg?w=320&q=80 320w, https://img.test/a.jpg?w=480&q=80 480w, https://img.test/a.jpg?w=640&q=80 640w, https://img.test/a.jpg?w=960&q=80 960w',
    );
    expect(srcSetFor('https://img.test/a.jpg?w=1', [100])).toBe('https://img.test/a.jpg?w=100 100w');
  });

  it('returns undefined when it cannot resize the URL', () => {
    expect(srcSetFor('')).toBeUndefined();
    expect(srcSetFor(null)).toBeUndefined();
    expect(srcSetFor(42)).toBeUndefined();
    expect(srcSetFor('https://img.test/a.jpg')).toBeUndefined();
    expect(srcSetFor('https://img.test/a.jpg?q=80')).toBeUndefined();
  });
});

describe('uploaded photos', () => {
  const owner = 'a1b2c3d4e5f60718';
  const photo = '123e4567-e89b-12d3-a456-426614174000';
  const url = `https://cdn.test/photos/${owner}/${photo}`;

  it('uses pre-rendered webp variants for cards', () => {
    expect(cardSrcSet(url)).toBe(`${url}.w480.webp 480w, ${url}.w960.webp 960w`);
    expect(cardSrcSet(`${url}-0123456789abcdef`)).toContain('.w480.webp 480w');
  });

  it('adds the original for galleries', () => {
    expect(gallerySrcSet(url)).toBe(`${url}.w480.webp 480w, ${url}.w960.webp 960w, ${url} 2560w`);
  });

  it('accepts uuid owners and falls back to query resizing otherwise', () => {
    expect(cardSrcSet(`https://cdn.test/photos/${photo}/${photo}`)).toContain('.w960.webp');
    expect(cardSrcSet('https://img.test/a.jpg?w=800')).toContain('?w=320 320w');
    expect(gallerySrcSet('https://img.test/a.jpg?w=800')).toContain('?w=960 960w');
    expect(cardSrcSet('https://img.test/a.jpg')).toBeUndefined();
    expect(gallerySrcSet(undefined)).toBeUndefined();
  });

  it('exposes sizes hints', () => {
    expect(CARD_SIZES).toContain('320px');
    expect(GALLERY_SIZES).toContain('60vw');
  });
});
