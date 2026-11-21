import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PHOTOS, DOCUMENT_ACCEPT, MAX_INPUT_BYTES, MAX_PHOTOS_CEILING, MAX_UPLOAD_BYTES, MIN_PHOTOS_CAP, PHOTO_ACCEPT, uploadType,
} from '../../../../src/lib/uploads/policy.js';
import { UserError } from '../../../../src/lib/userError.js';

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const JPEG = [255, 216, 255, 224, 0, 0, 0, 0];
const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0];
const PDF = ascii('%PDF-1.7\n');
const WEBP = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')];
const heic = (brand) => [0, 0, 0, 24, ...ascii('ftyp'), ...ascii(brand), 0, 0];

const file = (bytes, name, type = '') => new File([new Uint8Array(bytes)], name, { type });

describe('upload limits', () => {
  it('keeps the photo cap bounds ordered', () => {
    expect(MIN_PHOTOS_CAP).toBeLessThan(DEFAULT_MAX_PHOTOS);
    expect(DEFAULT_MAX_PHOTOS).toBeLessThan(MAX_PHOTOS_CEILING);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(MAX_INPUT_BYTES);
    expect(PHOTO_ACCEPT).not.toContain('pdf');
    expect(DOCUMENT_ACCEPT).toContain('application/pdf');
  });
});

describe('uploadType', () => {
  it('detects a type from content that matches name and declared type', async () => {
    expect(await uploadType(file(JPEG, 'a.JPG', 'image/jpeg'), false)).toBe('image/jpeg');
    expect(await uploadType(file(JPEG, 'a.jpeg', 'image/jpg'), false)).toBe('image/jpeg');
    expect(await uploadType(file(PNG, 'a.png', 'image/png; charset=x'), false)).toBe('image/png');
    expect(await uploadType(file(PNG, 'a.png', 'application/octet-stream'), false)).toBe('image/png');
    expect(await uploadType(file(PNG, 'a.png'), false)).toBe('image/png');
    expect(await uploadType(file(WEBP, 'a.webp', 'image/webp'), true)).toBe('image/webp');
    expect(await uploadType(file(PDF, 'a.pdf', 'application/pdf'), true)).toBe('application/pdf');
  });

  it('accepts HEIC and HEIF containers as photos', async () => {
    expect(await uploadType(file(heic('heic'), 'a.heic', 'image/heic'), false)).toBe('image/heic');
    expect(await uploadType(file(heic('mif1'), 'a.heif', 'image/heif'), false)).toBe('image/heic');
  });

  it('rejects AVIF disguised as HEIC', async () => {
    await expect(uploadType(file([...heic('mif1'), ...ascii('avif')], 'a.heic'), false)).rejects.toThrow('contents do not match');
  });

  it('rejects empty, non-blob and oversized input', async () => {
    await expect(uploadType(file([], 'a.jpg'), false)).rejects.toBeInstanceOf(UserError);
    await expect(uploadType('nope', false)).rejects.toThrow('non-empty');
    const big = { size: MAX_INPUT_BYTES + 1, name: 'a.jpg' };
    Object.setPrototypeOf(big, Blob.prototype);
    await expect(uploadType(big, false)).rejects.toThrow('25 MB');
  });

  it('rejects unsupported extensions per mode', async () => {
    await expect(uploadType(file(JPEG, 'a.gif'), false)).rejects.toThrow('HEIF/HEIC, JPEG/JPG or PNG photos only');
    await expect(uploadType(file(JPEG, 'noext'), true)).rejects.toThrow('PDF, JPEG/JPG, PNG or WebP only');
    await expect(uploadType(file(PDF, 'a.pdf'), false)).rejects.toThrow('photos only');
    await expect(uploadType(file(heic('heic'), 'a.heic'), true)).rejects.toThrow('PDF, JPEG/JPG, PNG or WebP only');
  });

  it('rejects a declared type that contradicts the filename', async () => {
    await expect(uploadType(file(JPEG, 'a.jpg', 'image/png'), false)).rejects.toThrow('does not match its filename');
  });

  it('rejects content that does not match the extension', async () => {
    await expect(uploadType(file(PNG, 'a.jpg'), false)).rejects.toThrow('contents do not match');
    await expect(uploadType(file(ascii('hello world, not an image'), 'a.png'), false)).rejects.toThrow('contents do not match');
    await expect(uploadType(file([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')], 'a.webp'), true)).rejects.toThrow('contents do not match');
  });
});
