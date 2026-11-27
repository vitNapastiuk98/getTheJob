import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function extractCv(file: File): Promise<{ name: string; text: string }> {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF smaller than 10 MiB.');
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: false, useWasm: false, stopAtErrors: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) throw new Error('Choose a CV with at most 100 pages.');
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      text += content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n';
      page.cleanup();
      if (text.trim().length > 30_000) throw new Error('CV text exceeds 30,000 characters. Choose a shorter PDF.');
    }
    if (!text.trim()) throw new Error('No text found. Export a text-based PDF; scans are not supported.');
    return { name: file.name.slice(0, 255), text: text.trim() };
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('Choose a PDF without password protection.');
    if (error instanceof Error && ['InvalidPDFException', 'UnknownErrorException'].includes(error.name)) throw new Error('The PDF could not be read. Export a new PDF and try again.');
    throw error;
  } finally { await loading.destroy(); }
}
