import type { ComponentType } from 'react';
import type { TxnType } from '@/lib/types';
import type { PrintDoc } from './model';
import { ClassicTemplate, CompactTemplate, ElegantTemplate, MinimalTemplate, ModernTemplate, ThermalTemplate, VatTemplate } from './templates';
import { ReceiptClassic, ReceiptCompact, ReceiptModern, ReceiptThermal, ReceiptVoucher } from './receipts';

export type Paper = 'A4' | 'A5' | '80mm';

export interface TemplateDef {
  key: string;
  name: string;
  description: string;
  kind: 'document' | 'receipt';
  paper: Paper;
  Component: ComponentType<{ doc: PrintDoc }>;
}

export const TEMPLATES: TemplateDef[] = [
  { key: 'classic', name: 'Classic', description: 'Boxed layout familiar from Vyapar and Tally', kind: 'document', paper: 'A4', Component: ClassicTemplate },
  { key: 'modern', name: 'Modern', description: 'Colour header band, striped rows, totals card', kind: 'document', paper: 'A4', Component: ModernTemplate },
  // The key stays 'gst' so companies that already picked this template keep it
  { key: 'gst', name: 'VAT Invoice (Mushak 6.3)', description: 'Boxed VAT invoice with BIN, taxable value, VAT columns and declaration', kind: 'document', paper: 'A4', Component: VatTemplate },
  { key: 'minimal', name: 'Minimal', description: 'Clean typography with hairline rules', kind: 'document', paper: 'A4', Component: MinimalTemplate },
  { key: 'elegant', name: 'Elegant', description: 'Serif headings, centred brand and accent bar', kind: 'document', paper: 'A4', Component: ElegantTemplate },
  { key: 'compact', name: 'Compact', description: 'Dense layout that fits long item lists on one page', kind: 'document', paper: 'A4', Component: CompactTemplate },
  { key: 'thermal', name: 'Thermal 80 mm', description: 'Roll receipt for POS / thermal printers', kind: 'document', paper: '80mm', Component: ThermalTemplate },
  { key: 'receipt-classic', name: 'Classic receipt', description: 'Company letterhead with dotted lines', kind: 'receipt', paper: 'A4', Component: ReceiptClassic },
  { key: 'receipt-modern', name: 'Modern receipt', description: 'Large amount card with details grid', kind: 'receipt', paper: 'A4', Component: ReceiptModern },
  { key: 'receipt-voucher', name: 'Voucher', description: 'Boxed voucher with payer, preparer and company signatures', kind: 'receipt', paper: 'A4', Component: ReceiptVoucher },
  { key: 'receipt-compact', name: 'Half page (A5)', description: 'Small receipt that fits half an A4 sheet', kind: 'receipt', paper: 'A5', Component: ReceiptCompact },
  { key: 'receipt-thermal', name: 'Thermal 80 mm', description: 'Roll receipt for POS / thermal printers', kind: 'receipt', paper: '80mm', Component: ReceiptThermal },
];

export const PAPER: Record<Paper, { widthPx: number; minHeightPx: number; page: string; mm: [number, number | null] }> = {
  A4: { widthPx: 794, minHeightPx: 1123, page: 'A4', mm: [210, 297] },
  A5: { widthPx: 559, minHeightPx: 794, page: 'A5', mm: [148, 210] },
  '80mm': { widthPx: 302, minHeightPx: 200, page: '80mm auto', mm: [80, null] },
};

export function templatesFor(kind: 'document' | 'receipt') {
  return TEMPLATES.filter((t) => t.kind === kind);
}

/** Template chosen for a document type: per-type setting, then the company default, then the first of its kind. */
export function defaultTemplate(type: TxnType, kind: 'document' | 'receipt', print: { defaultTemplate?: string; templates?: Record<string, string> }) {
  const list = templatesFor(kind);
  const wanted = print.templates?.[type] ?? (kind === 'document' ? print.defaultTemplate : print.templates?.RECEIPT);
  return list.find((t) => t.key === wanted) ?? list[0];
}
