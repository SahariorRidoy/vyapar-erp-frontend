'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import type { Company, CompanySettings, Txn } from '@/lib/types';
import { computeLine, computeTotals } from '@/lib/money';
import { buildPrintDoc } from '@/components/print/model';
import { PAPER, TEMPLATES } from '@/components/print/registry';

const SAMPLE_LINES = [
  { name: 'Miniket Rice 5kg', hsn: '1006', qty: 10, unitName: 'BAG', price: 620, taxRate: 5 },
  { name: 'Soybean Oil 1L (Box of 12)', hsn: '1507', qty: 3, unitName: 'BOX', price: 1740, taxRate: 5 },
  { name: 'Green Tea 100 Bags', hsn: '0902', qty: 4, unitName: 'BOX', price: 320, taxRate: 15, discountPercent: 5 },
];

/** A realistic invoice or receipt for previewing print settings before any document exists. */
function sampleTxn(kind: 'document' | 'receipt', company: Company): Txn {
  const today = dayjs().format('YYYY-MM-DD');
  const party = { _id: 'sample', name: 'Rahman General Store', phone: '01822-001100', gstin: '001234567-0101', state: company.state || 'Dhaka', billingAddress: 'Shop 4, Mirpur Road\nDhaka 1207', openingBalance: 0, balance: 18450 };
  if (kind === 'receipt') {
    return {
      _id: 'sample', type: 'PAYMENT_IN', number: 'RCPT-24', date: today, party, items: [], subtotal: 8000, itemDiscount: 0, discountPercent: 0, discountAmount: 0, taxTotal: 0, additionalCharges: [], roundOff: 0,
      total: 8000, settled: 8000, paidViaPayments: 0, balance: 0, paymentType: 'bKash', paymentRef: 'TrxID 9K4D7XQ2LM', allocations: [{ transaction: 'x', number: 'INV-118', amount: 8000 }], status: 'PAID', links: [],
      description: 'Part payment against INV-118', createdAt: today, updatedAt: today,
    } as unknown as Txn;
  }
  const items = SAMPLE_LINES.map((l) => {
    const c = computeLine({ ...l, discountPercent: l.discountPercent ?? 0 });
    return { ...l, discountPercent: l.discountPercent ?? 0, discountAmount: c.discountAmount, taxAmount: c.taxAmount, amount: c.amount };
  });
  const t = computeTotals(items, { roundOff: true });
  const settled = 5000;
  return {
    _id: 'sample', type: 'SALE', number: 'INV-118', date: today, dueDate: dayjs().add(15, 'day').format('YYYY-MM-DD'), party, items,
    subtotal: t.subtotal, itemDiscount: t.itemDiscount, discountPercent: 0, discountAmount: 0, taxTotal: t.taxTotal, additionalCharges: [], roundOff: t.roundOff, total: t.total,
    settled, paidViaPayments: 0, balance: t.total - settled, paymentType: 'Cash', allocations: [], status: 'PARTIAL', links: [], createdAt: today, updatedAt: today,
  } as unknown as Txn;
}

/** Live, scaled preview of a print template with the settings being edited (nothing is saved). */
export function PrintPreview({ templateKey, company, settings, width = 380 }: { templateKey: string; company: Company; settings: CompanySettings; width?: number }) {
  const template = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0]!;
  const paper = PAPER[template.paper];
  const sheet = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(paper.minHeightPx);
  const doc = useMemo(() => buildPrintDoc(sampleTxn(template.kind, company), company, settings), [template.kind, company, settings]);
  const scale = Math.min(1, width / paper.widthPx);
  useLayoutEffect(() => {
    if (!sheet.current) return;
    const el = sheet.current;
    const fit = () => setHeight(el.offsetHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [template.key]);
  const Tpl = template.Component;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-3">
      <div className="mx-auto overflow-hidden" style={{ width: paper.widthPx * scale, height: height * scale }} aria-label={`Preview of the ${template.name} template`}>
        <div
          ref={sheet}
          className="pointer-events-none flex flex-col bg-white text-gray-900 shadow-sm select-none"
          style={{ width: paper.widthPx, minHeight: paper.minHeightPx, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <Tpl doc={doc} />
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">Sample {template.kind === 'receipt' ? 'receipt' : 'invoice'} · {template.name} · {template.paper}</p>
    </div>
  );
}
