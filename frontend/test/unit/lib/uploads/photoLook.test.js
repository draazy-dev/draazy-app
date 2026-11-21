import { describe, expect, it } from 'vitest';
import { photoLook } from '../../../../src/lib/uploads/photoLook.js';

const WIDTH = 20;
const image = (pixel) => {
  const rgba = new Uint8ClampedArray(WIDTH * WIDTH * 4);
  for (let i = 0; i < WIDTH * WIDTH; i += 1) rgba.set([...Array(3).fill(pixel(i % WIDTH, Math.floor(i / WIDTH))), 255], i * 4);
  return rgba;
};

describe('photoLook', () => {
  it('flags dark photos', () => {
    expect(photoLook(image(() => 20), WIDTH)).toBe('dark');
    expect(photoLook(image((x) => (x % 2 ? 60 : 30)), WIDTH)).toBe('dark');
  });

  it('flags flat or smoothly graded photos as blurry', () => {
    expect(photoLook(image(() => 160), WIDTH)).toBe('blurry');
    expect(photoLook(image((x) => 120 + x), WIDTH)).toBe('blurry');
    expect(photoLook(image((x, y) => (y % 2 ? 200 : 100)), WIDTH)).toBe('blurry');
  });

  it('accepts a photo with strong horizontal edges', () => {
    expect(photoLook(image((x) => (x % 2 ? 200 : 100)), WIDTH)).toBeNull();
  });

  it('is not fooled by a plain wall with a thin dark stripe', () => {
    const wall = new Uint8ClampedArray(100 * 100 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) % 100 >= 50 && (i >> 2) % 100 < 52 ? 40 : 160));
    expect(photoLook(wall, 100)).toBeNull();
  });

  it('returns null for empty input or a zero width', () => {
    expect(photoLook(new Uint8ClampedArray(0), WIDTH)).toBeNull();
    expect(photoLook(image(() => 100), 0)).toBeNull();
  });
});
