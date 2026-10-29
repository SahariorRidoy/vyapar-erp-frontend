import { PAPER, type Paper } from './registry';

/** Resolves once every image inside the element has loaded (or failed) and web fonts are ready. */
export async function waitForAssets(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
}

/** Renders the print sheet to a PDF (A4/A5 pages are sliced; thermal rolls become one long page). */
export async function sheetToPdf(el: HTMLElement, paper: Paper): Promise<Blob> {
  await waitForAssets(el);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const [wMm, hMm] = PAPER[paper].mm;
  const imgHmm = (canvas.height * wMm) / canvas.width;

  if (hMm === null) {
    const pdf = new jsPDF({ unit: 'mm', format: [wMm, Math.max(imgHmm, 50)], orientation: 'portrait' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, wMm, imgHmm);
    return pdf.output('blob');
  }

  const pdf = new jsPDF({ unit: 'mm', format: paper === 'A5' ? 'a5' : 'a4', orientation: 'portrait' });
  if (imgHmm <= hMm + 0.5) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, wMm, Math.min(imgHmm, hMm));
    return pdf.output('blob');
  }
  // Long documents: cut the bitmap into page-sized slices.
  const pagePx = Math.floor((canvas.width * hMm) / wMm);
  const slice = document.createElement('canvas');
  slice.width = canvas.width;
  const ctx = slice.getContext('2d')!;
  for (let y = 0, page = 0; y < canvas.height; y += pagePx, page++) {
    const h = Math.min(pagePx, canvas.height - y);
    slice.height = h;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, wMm, (h * wMm) / canvas.width);
  }
  return pdf.output('blob');
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
