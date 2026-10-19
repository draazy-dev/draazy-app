import assert from 'node:assert/strict';
import { photoLook } from './photoLook.js';

const WIDTH = 20;
const image = (pixel) => {
  const rgba = new Uint8ClampedArray(WIDTH * WIDTH * 4);
  for (let i = 0; i < WIDTH * WIDTH; i += 1) rgba.set([...Array(3).fill(pixel(i % WIDTH, Math.floor(i / WIDTH))), 255], i * 4);
  return rgba;
};

assert.equal(photoLook(image(() => 20), WIDTH), 'dark');
assert.equal(photoLook(image(() => 160), WIDTH), 'blurry');
assert.equal(photoLook(image((x) => 120 + x), WIDTH), 'blurry');
assert.equal(photoLook(image((x) => (x % 2 ? 200 : 100)), WIDTH), null);
assert.equal(photoLook(image((x) => (x % 2 ? 60 : 30)), WIDTH), 'dark');
assert.equal(photoLook(new Uint8ClampedArray(0), WIDTH), null);

// Stripes that change only between rows must not count as detail: the gradient never wraps across rows.
assert.equal(photoLook(image((x, y) => (y % 2 ? 200 : 100)), WIDTH), 'blurry');

// A plain wall with one crisp door frame is a sharp photo, however little of it is edge.
const wall = new Uint8ClampedArray(100 * 100 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) % 100 >= 50 && (i >> 2) % 100 < 52 ? 40 : 160));
assert.equal(photoLook(wall, 100), null);

console.log('photoLook ok');
