import { PDFDocument, PDFDict, PDFArray, PDFName } from 'pdf-lib';
import { UserError } from '../userError.js';

function rejectSignatureFields(pdf) {
  const pending = pdf.context.enumerateIndirectObjects().map(([, value]) => value);
  const visited = new Set();
  for (let index = 0; index < pending.length; index += 1) {
    if (pending.length > 100_000) throw new UserError('This PDF is too complex. Please choose a smaller original.');
    const value = pending[index];
    if (visited.has(value)) continue;
    visited.add(value);
    if (value instanceof PDFDict) {
      if (value.has(PDFName.of('ByteRange')) || value.has(PDFName.of('DocMDP'))
        || pdf.context.lookup(value.get(PDFName.of('Type')))?.toString() === '/Sig'
        || pdf.context.lookup(value.get(PDFName.of('FT')))?.toString() === '/Sig') {
        throw new UserError('This signed PDF is too large. Keep the original: compression would invalidate its signature.');
      }
      pending.push(...value.values());
    } else if (value instanceof PDFArray) pending.push(...value.asArray());
  }
}

self.onmessage = async ({ data: { file, maxBytes } }) => {
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false, throwOnInvalidObject: true });
    if (pdf.getPageCount() < 1 || pdf.getPageCount() > 100) throw new UserError('Please upload a PDF with 1 to 100 pages.');
    if (file.size < maxBytes) { self.postMessage({ unchanged: true }); return; }
    rejectSignatureFields(pdf);
    const bytes = await pdf.save({ useObjectStreams: true, updateFieldAppearances: false, addDefaultPage: false });
    self.postMessage({ blob: new Blob([bytes], { type: 'application/pdf' }) });
  } catch (error) {
    self.postMessage({ error: error instanceof UserError ? error.message : 'This PDF could not be processed. Upload a valid, unencrypted original PDF.' });
  }
};