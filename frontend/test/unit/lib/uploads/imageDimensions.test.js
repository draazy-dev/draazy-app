import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_PIXELS, checkImageDimensions } from '../../../../src/lib/uploads/imageDimensions.js';
import { UserError } from '../../../../src/lib/userError.js';

const asFile = (bytes) => {
  const buffer = Uint8Array.from(bytes).buffer;
  return { arrayBuffer: async () => buffer };
};
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

const png = (w, h) => [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, ...ascii('IHDR'), ...u32(w), ...u32(h), 8, 2, 0, 0, 0];
const jpeg = (w, h, marker = 0xC0) => [255, 216, 255, 224, ...u16(4), 0, 0, 255, marker, ...u16(11), 8, ...u16(h), ...u16(w), 1, 1, 17, 0];
const box = (type, payload) => [...u32(payload.length + 8), ...ascii(type), ...payload];
const ispe = (w, h) => box('ispe', [0, 0, 0, 0, ...u32(w), ...u32(h)]);
const heif = (w, h) => [...box('ftyp', ascii('heic')), ...box('meta', [0, 0, 0, 0, ...box('iprp', box('ipco', ispe(w, h)))])];
const riff = (kind, body) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(kind), ...body];
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

describe('checkImageDimensions', () => {
  it('accepts PNG, JPEG, WebP and HEIF within the pixel cap', async () => {
    await expect(checkImageDimensions(asFile(png(4000, 3000)), 'image/png')).resolves.toBeUndefined();
    await expect(checkImageDimensions(asFile(jpeg(4000, 3000)), 'image/jpeg')).resolves.toBeUndefined();
    await expect(checkImageDimensions(asFile(heif(4000, 3000)), 'image/heic')).resolves.toBeUndefined();
    const vp8x = riff('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, ...le24(3999), ...le24(2999)]);
    await expect(checkImageDimensions(asFile(vp8x), 'image/webp')).resolves.toBeUndefined();
  });

  it('exports a 48 megapixel limit', () => {
    expect(MAX_IMAGE_PIXELS).toBe(48_000_000);
  });

  it('rejects oversized images in every format', async () => {
    const tooBig = /48 megapixels/;
    await expect(checkImageDimensions(asFile(png(10000, 10000)), 'image/png')).rejects.toThrow(tooBig);
    await expect(checkImageDimensions(asFile(jpeg(10000, 10000)), 'image/jpeg')).rejects.toThrow(tooBig);
    await expect(checkImageDimensions(asFile(heif(10000, 10000)), 'image/heic')).rejects.toBeInstanceOf(UserError);
    await expect(checkImageDimensions(asFile(riff('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, ...le24(9999), ...le24(9999)])), 'image/webp')).rejects.toThrow(tooBig);
  });

  it('accepts the exact pixel cap and rejects one pixel more', async () => {
    await expect(checkImageDimensions(asFile(png(8000, 6000)), 'image/png')).resolves.toBeUndefined();
    await expect(checkImageDimensions(asFile(png(6000, 8001)), 'image/png')).rejects.toThrow('48 megapixels');
  });

  it('rejects zero-sized and truncated images', async () => {
    await expect(checkImageDimensions(asFile(png(0, 10)), 'image/png')).rejects.toThrow('Invalid image dimensions.');
    await expect(checkImageDimensions(asFile([137, 80]), 'image/png')).rejects.toThrow('Invalid image dimensions.');
  });

  it('reads JPEG progressive and skips non-frame markers', async () => {
    await expect(checkImageDimensions(asFile(jpeg(10000, 10000, 0xC2)), 'image/jpeg')).rejects.toThrow('48 megapixels');
    const skipDht = [255, 216, 255, 0xC4, ...u16(4), 0, 0, 255, 0xC0, ...u16(11), 8, ...u16(10), ...u16(10), 1, 1, 17, 0];
    await expect(checkImageDimensions(asFile(skipDht), 'image/jpeg')).resolves.toBeUndefined();
  });

  it('rejects malformed JPEG metadata', async () => {
    await expect(checkImageDimensions(asFile([255, 216, 0, 0, 0, 0]), 'image/jpeg')).rejects.toThrow('Invalid JPEG metadata.');
    await expect(checkImageDimensions(asFile([255, 216, 255, 0xDA, 0, 0, 0, 0]), 'image/jpeg')).rejects.toThrow('Invalid JPEG metadata.');
    await expect(checkImageDimensions(asFile([255, 216, 255, 0xE0, ...u16(2000), 0]), 'image/jpeg')).rejects.toThrow('Invalid JPEG metadata.');
  });

  it('reads WebP lossy and lossless dimensions', async () => {
    const lossy = riff('VP8 ', [...new Array(10).fill(0), ...[100, 0, 50, 0]]);
    await expect(checkImageDimensions(asFile(lossy), 'image/webp')).resolves.toBeUndefined();
    const oversizedLossy = riff('VP8 ', [...new Array(10).fill(0), 0xFF, 0x3F, 0xFF, 0x3F]);
    await expect(checkImageDimensions(asFile(oversizedLossy), 'image/webp')).rejects.toThrow('48 megapixels');
    const lossless = riff('VP8L', [0, 0, 0, 0, 0, 99, 0x3f, 0xff, 0x0f]);
    await expect(checkImageDimensions(asFile(lossless), 'image/webp')).rejects.toThrow('48 megapixels');
    const small = riff('VP8L', [0, 0, 0, 0, 0, 99, 0x40, 12, 0]);
    await expect(checkImageDimensions(asFile(small), 'image/webp')).resolves.toBeUndefined();
  });

  it('rejects malformed WebP', async () => {
    await expect(checkImageDimensions(asFile(ascii('RIFFxxxxWAVEfmt ')), 'image/webp')).rejects.toThrow('Invalid WebP metadata.');
    await expect(checkImageDimensions(asFile(riff('ABCD', new Array(20).fill(0))), 'image/webp')).rejects.toThrow('Invalid WebP metadata.');
  });

  it('rejects malformed HEIF', async () => {
    await expect(checkImageDimensions(asFile([...u32(4), ...ascii('ftyp')]), 'image/heic')).rejects.toThrow('Invalid HEIF image metadata.');
    await expect(checkImageDimensions(asFile([...u32(1), ...ascii('mdat'), 0, 0]), 'image/heic')).rejects.toThrow('Invalid HEIF image metadata.');
    await expect(checkImageDimensions(asFile(box('ftyp', ascii('heic'))), 'image/heic')).rejects.toThrow('Invalid image dimensions.');
  });

  it('supports 64-bit and to-end box sizes in HEIF', async () => {
    const payload = [0, 0, 0, 0, ...box('iprp', box('ipco', ispe(100, 100)))];
    const large = [...u32(1), ...ascii('meta'), 0, 0, 0, 0, 0, 0, 0, 16 + payload.length, ...payload];
    await expect(checkImageDimensions(asFile(large), 'image/heic')).resolves.toBeUndefined();
    const toEnd = [...u32(0), ...ascii('meta'), ...payload];
    await expect(checkImageDimensions(asFile(toEnd), 'image/heic')).resolves.toBeUndefined();
  });

  it('refuses deeply nested HEIF boxes', async () => {
    let nested = ispe(10, 10);
    for (let i = 0; i < 6; i += 1) nested = box('ipco', nested);
    await expect(checkImageDimensions(asFile(nested), 'image/heic')).rejects.toThrow('Invalid HEIF image metadata.');
  });
});
