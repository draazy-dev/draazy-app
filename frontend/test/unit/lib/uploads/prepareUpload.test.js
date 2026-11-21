import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProcessImage = vi.fn();
vi.mock('../../../../src/lib/uploads/imageProcess.js', () => ({
  processImage: (...a) => mockProcessImage(...a),
  imageErrorMessage: (e) => `decode:${e.message}`,
}));

import { prepareUpload } from '../../../../src/lib/uploads/prepareUpload.js';
import { MAX_UPLOAD_BYTES } from '../../../../src/lib/uploads/policy.js';
import { UserError } from '../../../../src/lib/userError.js';

const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0];
const PDF = [...'%PDF-1.7\n'].map((c) => c.charCodeAt(0));
const png = (name = 'photo.png', type = 'image/png') => new File([new Uint8Array(PNG)], name, { type, lastModified: 42 });
const pdf = (name = 'doc.pdf') => new File([new Uint8Array(PDF)], name, { type: 'application/pdf', lastModified: 42 });

let workers;
let reply;

class FakeWorker {
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.terminated = false;
    workers.push(this);
  }

  postMessage(message) {
    this.sent = message;
    if (reply) queueMicrotask(() => reply(this));
  }

  terminate() { this.terminated = true; }
}

beforeEach(() => {
  workers = [];
  reply = null;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('prepareUpload (worker path)', () => {
  beforeEach(() => vi.stubGlobal('OffscreenCanvas', class {}));

  it('sends images to the image worker and renames the result to .jpg', async () => {
    reply = (w) => w.onmessage({ data: { blob: new Blob(['x'], { type: 'image/jpeg' }), look: 'dark' } });
    const out = await prepareUpload(png('IMG 1.png'));
    expect(workers[0].url).toContain('image.worker.js');
    expect(workers[0].options).toEqual({ type: 'module' });
    expect(workers[0].sent).toMatchObject({ type: 'image/png', document: false, maxBytes: MAX_UPLOAD_BYTES });
    expect(out).toBeInstanceOf(File);
    expect(out.name).toBe('IMG 1.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.lastModified).toBe(42);
    expect(workers[0].terminated).toBe(true);
  });

  it('returns the look alongside the file when asked', async () => {
    reply = (w) => w.onmessage({ data: { blob: new Blob(['x'], { type: 'image/jpeg' }), look: 'blurry' } });
    const out = await prepareUpload(png(), { withLook: true });
    expect(out.look).toBe('blurry');
    expect(out.file.name).toBe('photo.jpg');
  });

  it('sends PDFs to the pdf worker and keeps the original when unchanged', async () => {
    reply = (w) => w.onmessage({ data: { unchanged: true } });
    const original = pdf();
    const out = await prepareUpload(original, { document: true });
    expect(workers[0].url).toContain('pdf.worker.js');
    expect(out).toBe(original);
  });

  it('retypes an unchanged file whose browser type differs', async () => {
    reply = (w) => w.onmessage({ data: { unchanged: true } });
    const out = await prepareUpload(png('p.png', ''));
    expect(out.type).toBe('image/png');
    expect(out.name).toBe('p.png');
  });

  it('keeps the PDF filename for a compressed PDF', async () => {
    reply = (w) => w.onmessage({ data: { blob: new Blob(['%'], { type: 'application/pdf' }) } });
    const out = await prepareUpload(pdf('deed.pdf'), { document: true });
    expect(out.name).toBe('deed.pdf');
    expect(out.type).toBe('application/pdf');
  });

  it('surfaces worker error messages as UserError', async () => {
    reply = (w) => w.onmessage({ data: { error: 'bad file' } });
    const error = await prepareUpload(png()).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('bad file');
    expect(workers[0].terminated).toBe(true);
  });

  it('rejects results that are empty, missing or still over the cap', async () => {
    reply = (w) => w.onmessage({ data: { blob: new Blob([]) } });
    await expect(prepareUpload(png())).rejects.toThrow('cannot fit under 1 MB');
    reply = (w) => w.onmessage({ data: { blob: 'not a blob' } });
    await expect(prepareUpload(png())).rejects.toThrow('cannot fit under 1 MB');
    reply = (w) => w.onmessage({ data: { blob: new Blob(['abcdef']) } });
    await expect(prepareUpload(png(), { maxBytes: 5 })).rejects.toThrow('cannot fit under 0.000005 MB');
  });

  it('reports a crashed worker', async () => {
    reply = (w) => w.onerror(new Event('error'));
    await expect(prepareUpload(png())).rejects.toThrow('Could not process this file');
  });

  it('gives up after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const done = prepareUpload(png()).catch((e) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      const error = await done;
      expect(error.message).toContain('took too long');
      expect(workers[0].terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels when aborted before the worker starts', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareUpload(png(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(0);
  });

  it('cancels and terminates the worker when aborted mid-flight', async () => {
    const controller = new AbortController();
    const done = prepareUpload(png(), { signal: controller.signal }).catch((e) => e);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    controller.abort();
    expect((await done).name).toBe('AbortError');
    expect(workers[0].terminated).toBe(true);
  });

  it('cancels when aborted after the content check', async () => {
    const controller = new AbortController();
    const done = prepareUpload(png(), { signal: controller.signal }).catch((e) => e);
    controller.abort();
    expect((await done).name).toBe('AbortError');
    expect(workers).toHaveLength(0);
  });
});

describe('prepareUpload (validation)', () => {
  it('rejects unsupported files before any processing', async () => {
    await expect(prepareUpload(new File(['x'], 'a.gif'))).rejects.toBeInstanceOf(UserError);
    expect(workers).toHaveLength(0);
  });

  it('requires an original PDF when asked', async () => {
    await expect(prepareUpload(png(), { document: true, originalPdf: true })).rejects.toThrow('original MSEDCL PDF');
    const huge = new File([new Uint8Array(PDF), new Uint8Array(MAX_UPLOAD_BYTES)], 'big.pdf', { type: 'application/pdf' });
    await expect(prepareUpload(huge, { document: true, originalPdf: true })).rejects.toThrow('under 1 MB');
  });
});

describe('prepareUpload (main-thread path)', () => {
  beforeEach(() => { mockProcessImage.mockReset(); });

  it('processes images in-thread when OffscreenCanvas is unavailable', async () => {
    mockProcessImage.mockResolvedValue({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), look: null });
    const out = await prepareUpload(png('a.png'), { document: true, maxBytes: 500_000 });
    expect(mockProcessImage).toHaveBeenCalledWith(expect.any(File), 'image/png', true, 500_000);
    expect(out.name).toBe('a.jpg');
    expect(workers).toHaveLength(0);
  });

  it('returns the look when requested', async () => {
    mockProcessImage.mockResolvedValue({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), look: 'dark' });
    expect((await prepareUpload(png(), { withLook: true })).look).toBe('dark');
  });

  it('turns decoder failures into friendly messages', async () => {
    mockProcessImage.mockImplementation(async () => { throw new Error('boom'); });
    await expect(prepareUpload(png())).rejects.toThrow('decode:boom');
  });

  it('rejects results over the cap', async () => {
    mockProcessImage.mockResolvedValue({ blob: new Blob(['0123456789']), look: null });
    await expect(prepareUpload(png(), { maxBytes: 10 })).rejects.toThrow('cannot fit under');
    mockProcessImage.mockResolvedValue({ blob: new Blob([]), look: null });
    await expect(prepareUpload(png())).rejects.toThrow('cannot fit under');
  });

  it('times out slow processing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      mockProcessImage.mockReturnValue(new Promise(() => {}));
      const done = prepareUpload(png()).catch((e) => e);
      while (!mockProcessImage.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
      vi.advanceTimersByTime(30_000);
      const error = await done;
      expect(error).toBeInstanceOf(UserError);
      expect(error.message).toContain('took too long');
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours an abort that lands after processing', async () => {
    const controller = new AbortController();
    mockProcessImage.mockImplementation(async () => {
      controller.abort();
      return { blob: new Blob(['x']), look: null };
    });
    await expect(prepareUpload(png(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
