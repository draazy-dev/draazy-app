import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('heic-to/csp?url', () => ({ default: 'data:text/javascript,export const heicTo = () => { throw new Error(\"unused\"); };' }));

import { imageErrorMessage, processImage } from '../../../../src/lib/uploads/imageProcess.js';
import { UserError } from '../../../../src/lib/userError.js';

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const pngBytes = (w, h) => [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, ...ascii('IHDR'), ...u32(w), ...u32(h), 8, 2, 0, 0, 0];
const fileOf = (w, h) => ({ arrayBuffer: async () => Uint8Array.from(pngBytes(w, h)).buffer });

let canvases;
let qualities;
let sizeOf;
let pixel;

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    canvases.push(this);
  }

  getContext() {
    return {
      fillRect() {},
      drawImage: (image, x, y, w, h) => { this.drawn = { image, w, h }; },
      getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i += 1) data.set([...Array(3).fill(pixel(i % w)), 255], i * 4);
        return { data };
      },
    };
  }

  async convertToBlob({ quality }) {
    qualities.push(quality);
    return new Blob([new Uint8Array(sizeOf(this, quality))], { type: 'image/jpeg' });
  }
}

const bitmapOf = (width, height) => ({ width, height, close: vi.fn() });

beforeEach(() => {
  canvases = [];
  qualities = [];
  sizeOf = () => 100;
  pixel = (x) => (x % 2 ? 200 : 100);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal('createImageBitmap', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const decodeTo = (bitmap) => createImageBitmap.mockResolvedValue(bitmap);

describe('imageErrorMessage', () => {
  it('passes user errors through and hides decoder internals', () => {
    expect(imageErrorMessage(new UserError('Too big'))).toBe('Too big');
    expect(imageErrorMessage(new Error('InvalidStateError'))).toContain('Could not decode this photo');
    expect(imageErrorMessage(undefined)).toContain('Could not decode this photo');
  });
});

describe('processImage', () => {
  it('decodes, compresses and reports the look for a photo', async () => {
    const bitmap = bitmapOf(1000, 800);
    decodeTo(bitmap);
    const { blob, look } = await processImage(fileOf(1000, 800), 'image/png', false, 1_000_000);
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' });
    expect(blob.size).toBe(100);
    expect(qualities).toEqual([0.92]);
    expect(look).toBeNull();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('skips the look for documents', async () => {
    decodeTo(bitmapOf(300, 300));
    const { look } = await processImage(fileOf(300, 300), 'image/png', true);
    expect(look).toBeNull();
  });

  it('reports dark photos', async () => {
    pixel = () => 10;
    decodeTo(bitmapOf(600, 600));
    expect((await processImage(fileOf(600, 600), 'image/png', false)).look).toBe('dark');
  });

  it('reports blurry photos', async () => {
    pixel = () => 150;
    decodeTo(bitmapOf(600, 600));
    expect((await processImage(fileOf(600, 600), 'image/png', false)).look).toBe('blurry');
  });

  it('downsizes large images to a 2560 px long edge and releases canvases', async () => {
    decodeTo(bitmapOf(5000, 4000));
    await processImage(fileOf(5000, 4000), 'image/png', false);
    const source = canvases.find((c) => c.drawn?.image.width === 5000);
    expect(source.drawn).toMatchObject({ w: 2560, h: 2048 });
    expect(source.width).toBe(1);
    expect(canvases.every((c) => c.width === 1 && c.height === 1)).toBe(true);
  });

  it('steps quality down until the blob fits', async () => {
    sizeOf = (c, q) => Math.round(q * 2000);
    decodeTo(bitmapOf(600, 600));
    const { blob } = await processImage(fileOf(600, 600), 'image/png', false, 1000);
    expect(qualities).toEqual([0.92, 0.8, 0.68, 0.56, 0.44]);
    expect(blob.size).toBe(880);
  });

  it('shrinks dimensions when quality alone cannot reach the cap', async () => {
    sizeOf = (c, q) => Math.round((c.width * c.height * q) / 50);
    decodeTo(bitmapOf(1000, 1000));
    const { blob } = await processImage(fileOf(1000, 1000), 'image/png', false, 5000);
    expect(blob.size).toBeLessThan(5000);
    expect(canvases.some((c) => c.drawn?.w === 756)).toBe(true);
  });

  it('returns the smallest attempt when already at the minimum edge', async () => {
    sizeOf = () => 9_000_000;
    decodeTo(bitmapOf(480, 480));
    const { blob } = await processImage(fileOf(480, 480), 'image/png', false, 1000);
    expect(blob.size).toBe(9_000_000);
    expect(qualities).toEqual([0.92, 0.8, 0.68, 0.56, 0.44, 0.35]);
  });

  it('uses fewer qualities and a larger floor for documents', async () => {
    sizeOf = () => 9_000_000;
    decodeTo(bitmapOf(1600, 1600));
    await processImage(fileOf(1600, 1600), 'image/png', true, 1000);
    expect(qualities).toEqual([0.92, 0.82, 0.72, 0.62]);
  });

  it('rejects photos shorter than 480 px but allows small documents', async () => {
    decodeTo(bitmapOf(2000, 400));
    const error = await processImage(fileOf(2000, 400), 'image/png', false).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toContain('480 px');
    decodeTo(bitmapOf(2000, 400));
    await expect(processImage(fileOf(2000, 400), 'image/png', true)).resolves.toBeTruthy();
  });

  it('closes the bitmap and rejects when the decoded size is over the cap', async () => {
    const bitmap = bitmapOf(10000, 10000);
    decodeTo(bitmap);
    await expect(processImage(fileOf(1000, 1000), 'image/png', false)).rejects.toThrow('48 megapixels');
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('rejects empty bitmaps', async () => {
    decodeTo(bitmapOf(0, 0));
    await expect(processImage(fileOf(10, 10), 'image/png', false)).rejects.toBeInstanceOf(UserError);
  });

  it('rejects from the header check before decoding', async () => {
    await expect(processImage(fileOf(10000, 10000), 'image/png', false)).rejects.toThrow('48 megapixels');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('propagates decoder failures', async () => {
    createImageBitmap.mockRejectedValue(new Error('InvalidStateError'));
    await expect(processImage(fileOf(100, 100), 'image/png', false)).rejects.toThrow('InvalidStateError');
  });
});

describe('processImage with a DOM canvas', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('encodes through toBlob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmapOf(600, 600)));
    const made = [];
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(10) }) }),
        toBlob: (cb, type, quality) => cb(new Blob(['abc'], { type })),
      };
      made.push(canvas);
      return canvas;
    });
    const { blob, look } = await processImage(fileOf(600, 600), 'image/png', false);
    expect(blob.type).toBe('image/jpeg');
    expect(look).toBe('dark');
    expect(made.length).toBeGreaterThan(1);
  });

  it('fails when toBlob yields nothing', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmapOf(600, 600)));
    vi.spyOn(document, 'createElement').mockImplementation(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(150) }) }),
      toBlob: (cb) => cb(null),
    }));
    await expect(processImage(fileOf(600, 600), 'image/png', false)).rejects.toThrow('encode failed');
  });
});
