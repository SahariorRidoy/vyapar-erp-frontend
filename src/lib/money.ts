import { round2 } from './utils';

/** Same maths as the API (backend/src/modules/transactions/service.ts) so on-screen totals always match saved ones. */
export function computeLine(l: { qty: number; price: number; discountPercent?: number; discountAmount?: number; taxRate?: number; taxInclusive?: boolean }) {
  const gross = (Number(l.qty) || 0) * (Number(l.price) || 0);
  const discountAmount = l.discountPercent ? round2((gross * l.discountPercent) / 100) : round2(Math.min(l.discountAmount ?? 0, gross));
  const afterDiscount = gross - discountAmount;
  const rate = l.taxRate ?? 0;
  let taxable: number;
  let taxAmount: number;
  if (l.taxInclusive) {
    taxable = afterDiscount / (1 + rate / 100);
    taxAmount = afterDiscount - taxable;
  } else {
    taxable = afterDiscount;
    taxAmount = (taxable * rate) / 100;
  }
  return { gross: round2(gross), discountAmount, taxAmount: round2(taxAmount), amount: round2(taxable + taxAmount), taxable: round2(taxable) };
}

export function computeTotals(
  lines: { amount: number; discountAmount: number; taxAmount: number }[],
  opts: { discountPercent?: number; discountAmount?: number; charges?: { amount: number }[]; roundOff: boolean },
) {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const itemDiscount = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const discountAmount = opts.discountPercent ? round2((subtotal * opts.discountPercent) / 100) : round2(Math.min(opts.discountAmount ?? 0, subtotal));
  const charges = round2((opts.charges ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const pre = round2(subtotal - discountAmount + charges);
  const total = opts.roundOff ? Math.round(pre) : pre;
  return { subtotal, itemDiscount, taxTotal, discountAmount, charges, total, roundOff: round2(total - pre) };
}

/** VAT summary for print: taxable value and VAT per rate. */
export function taxBreakup(lines: { taxRate: number; taxAmount: number; amount: number }[]) {
  const by = new Map<number, { rate: number; taxable: number; tax: number }>();
  for (const l of lines) {
    if (!l.taxRate) continue;
    const row = by.get(l.taxRate) ?? { rate: l.taxRate, taxable: 0, tax: 0 };
    row.taxable = round2(row.taxable + (l.amount - l.taxAmount));
    row.tax = round2(row.tax + l.taxAmount);
    by.set(l.taxRate, row);
  }
  return [...by.values()].sort((a, b) => a.rate - b.rate);
}
