import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepareUpload = vi.fn();
vi.mock('../../../../src/lib/uploads/prepareUpload.js', () => ({ prepareUpload: (...a) => mockPrepareUpload(...a) }));

import {
  capturePreparedImage, capturePreviewUrl, readFrameQuality, releasePreviewUrl, startCameraStream, stopCameraStream,
} from '../../../../src/lib/identity-verification/capture.js';
import { UserError } from '../../../../src/lib/userError.js';

const rect = (left, top, width, height) => ({ left, top, width, height });
const videoOf = ({ w = 1280, h = 720, box = rect(0, 0, 0, 0) } = {}) => ({ videoWidth: w, videoHeight: h, getBoundingClientRect: () => box });
const guideOf = (box) => ({ getBoundingClientRect: () => box });

let canvases;
let pixels;

beforeEach(() => {
  canvases = [];
  pixels = null;
  vi.spyOn(document, 'createElement').mockImplementation(() => {
    const context = {
      drawImage: vi.fn(),
      getImageData: (x, y, w, h) => ({ data: pixels || new Uint8ClampedArray(w * h * 4) }),
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: (cb, type, quality) => cb(new Blob(['jpg'], { type })), context };
    canvases.push(canvas);
    return canvas;
  });
});
afterEach(() => {
  delete navigator.mediaDevices;
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
});

const grey = (values) => new Uint8ClampedArray(values.flatMap((g) => [g, g, g, 255]));

describe('camera stream', () => {
  it('requests an ideal facing mode and size without audio', async () => {
    const getUserMedia = vi.fn().mockResolvedValue('stream');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    expect(await startCameraStream({ facingMode: 'user' })).toBe('stream');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    await startCameraStream({ facingMode: 'environment', width: 640, height: 480 });
    expect(getUserMedia.mock.calls[1][0].video.width).toEqual({ ideal: 640 });
  });

  it('explains when the device has no camera API', async () => {
    const error = await startCameraStream({ facingMode: 'user' }).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toContain('does not expose a browser camera');
  });

  it('stops every track and tolerates missing streams', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopCameraStream({ getTracks: () => tracks });
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(() => stopCameraStream(null)).not.toThrow();
    expect(() => stopCameraStream({})).not.toThrow();
  });
});

describe('capturePreparedImage', () => {
  it('captures the full frame when there is no guide and hands the JPEG to prepareUpload', async () => {
    mockPrepareUpload.mockResolvedValue('prepared');
    const out = await capturePreparedImage(videoOf(), { fileName: 'front.jpg', document: true });
    expect(out).toBe('prepared');
    const [canvas] = canvases;
    expect(canvas).toMatchObject({ width: 1280, height: 720 });
    expect(canvas.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 720, 0, 0, 1280, 720);
    const [file, options] = mockPrepareUpload.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('front.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(options).toEqual({ document: true });
  });

  it('crops to the on-screen guide, accounting for object-fit cover', async () => {
    mockPrepareUpload.mockResolvedValue('x');
    const video = videoOf({ box: rect(0, 0, 640, 480) });
    await capturePreparedImage(video, { fileName: 'a.jpg', document: false, guide: guideOf(rect(100, 100, 300, 200)) });
    const [, sx, sy, sw, sh] = canvases[0].context.drawImage.mock.calls[0];
    expect(sx).toBeCloseTo(310, 5);
    expect(sy).toBeCloseTo(150, 5);
    expect(sw).toBeCloseTo(450, 5);
    expect(sh).toBeCloseTo(300, 5);
    expect(canvases[0].width).toBe(450);
    expect(canvases[0].height).toBe(300);
  });

  it('falls back to the full frame when the video has no size yet', async () => {
    mockPrepareUpload.mockResolvedValue('x');
    await capturePreparedImage(videoOf({ w: 0, h: 0 }), { fileName: 'a.jpg', document: false, guide: guideOf(rect(0, 0, 10, 10)) });
    expect(canvases[0]).toMatchObject({ width: 1280, height: 720 });
  });
});

describe('preview urls', () => {
  it('creates and revokes object URLs', () => {
    URL.createObjectURL = vi.fn(() => 'blob:abc');
    URL.revokeObjectURL = vi.fn();
    const file = new File(['x'], 'a.jpg');
    expect(capturePreviewUrl(file)).toBe('blob:abc');
    releasePreviewUrl('blob:abc');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:abc');
    releasePreviewUrl('');
    releasePreviewUrl(null);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('readFrameQuality', () => {
  it('downsamples to a 240 px probe', () => {
    readFrameQuality(videoOf(), null);
    expect(canvases[0]).toMatchObject({ width: 240, height: 135 });
  });

  it('measures brightness and sharpness from pixel differences', () => {
    pixels = grey([0, 100, 0, 100]);
    const q = readFrameQuality(videoOf({ w: 4, h: 1 }), null);
    expect(q.brightness).toBe(50);
    expect(q.sharpness).toBe(50);
  });

  it('reports zero for a black, flat frame and full brightness for white', () => {
    pixels = grey([0, 0, 0, 0]);
    expect(readFrameQuality(videoOf({ w: 4, h: 1 }), null)).toEqual({ brightness: 0, sharpness: 0 });
    pixels = grey([255, 255, 255, 255]);
    expect(readFrameQuality(videoOf({ w: 4, h: 1 }), null)).toEqual({ brightness: 255, sharpness: 0 });
  });

  it('never divides by zero for an empty frame', () => {
    pixels = new Uint8ClampedArray(0);
    expect(readFrameQuality(videoOf({ w: 4, h: 1 }), null)).toEqual({ brightness: 0, sharpness: 0 });
  });
});
