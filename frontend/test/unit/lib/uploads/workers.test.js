import { PDFDocument, PDFName } from 'pdf-lib';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProcessImage = vi.fn();
vi.mock('../../../../src/lib/uploads/imageProcess.js', () => ({
  processImage: (...a) => mockProcessImage(...a),
  imageErrorMessage: (e) => `decode:${e.message}`,
}));

const asFile = (bytes, size = bytes.length) => ({ size, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

async function makePdf(pages, tweak) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage();
  tweak?.(doc);
  return doc.save();
}

let posted;
const run = async (file, maxBytes) => {
  posted = [];
  vi.spyOn(self, 'postMessage').mockImplementation((m) => posted.push(m));
  await self.onmessage({ data: { file, maxBytes } });
  return posted[0];
};

describe('pdf.worker', () => {
  beforeAll(async () => { await import('../../../../src/lib/uploads/pdf.worker.js'); });

  it('reports an unchanged PDF that is already under the cap', async () => {
    const bytes = await makePdf(1);
    expect(await run(asFile(bytes), bytes.length + 1)).toEqual({ unchanged: true });
  });

  it('re-saves an oversized PDF', async () => {
    const bytes = await makePdf(2);
    const out = await run(asFile(bytes, 5_000_000), 1_000_000);
    expect(out.blob).toBeInstanceOf(Blob);
    expect(out.blob.type).toBe('application/pdf');
    expect(out.blob.size).toBeGreaterThan(0);
  });

  it('rejects PDFs with too many pages', async () => {
    const many = await makePdf(101);
    expect((await run(asFile(many), 1_000_000)).error).toBe('Please upload a PDF with 1 to 100 pages.');
  });

  it('refuses to recompress signed PDFs', async () => {
    const signed = [
      (doc) => doc.context.register(doc.context.obj({ ByteRange: [0, 1, 2, 3] })),
      (doc) => doc.context.register(doc.context.obj({ DocMDP: 1 })),
      (doc) => doc.context.register(doc.context.obj({ Type: PDFName.of('Sig') })),
      (doc) => doc.context.register(doc.context.obj({ FT: PDFName.of('Sig') })),
    ];
    for (const tweak of signed) {
      const bytes = await makePdf(1, tweak);
      const out = await run(asFile(bytes, 5_000_000), 1_000_000);
      expect(out.error).toContain('signed PDF');
    }
  });

  it('allows a signed PDF that already fits', async () => {
    const bytes = await makePdf(1, (doc) => doc.context.register(doc.context.obj({ ByteRange: [0, 1, 2, 3] })));
    expect(await run(asFile(bytes), bytes.length + 10)).toEqual({ unchanged: true });
  });

  it('gives a generic message for unreadable input', async () => {
    const out = await run(asFile(new TextEncoder().encode('not a pdf at all')), 1_000_000);
    expect(out.error).toContain('could not be processed');
  });
});

describe('image.worker', () => {
  beforeEach(() => { mockProcessImage.mockReset(); });

  it('posts the processed image', async () => {
    await import('../../../../src/lib/uploads/image.worker.js');
    const result = { blob: new Blob(['x']), look: null };
    mockProcessImage.mockResolvedValue(result);
    const sent = [];
    vi.spyOn(self, 'postMessage').mockImplementation((m) => sent.push(m));
    await self.onmessage({ data: { file: 'f', type: 'image/png', document: true, maxBytes: 9 } });
    expect(mockProcessImage).toHaveBeenCalledWith('f', 'image/png', true, 9);
    expect(sent).toEqual([result]);
  });

  it('posts a friendly error on failure', async () => {
    await import('../../../../src/lib/uploads/image.worker.js');
    mockProcessImage.mockImplementation(async () => { throw new Error('boom'); });
    const sent = [];
    vi.spyOn(self, 'postMessage').mockImplementation((m) => sent.push(m));
    await self.onmessage({ data: { file: 'f', type: 'image/png', document: false, maxBytes: 9 } });
    expect(sent).toEqual([{ error: 'decode:boom' }]);
  });
});
