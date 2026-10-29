'use client';
import { ArrowRight } from 'lucide-react';
import { fmtDate, num } from '@/lib/utils';

type Plain = Record<string, unknown>;

const IGNORE = new Set([
  '_id', 'company', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'passwordHash', 'links', 'source', 'confirmations', 'pendingApprovals',
  'paidViaPayments', 'attachments', 'docFiles','images', 'autoNumber', 'autoAllocate', 'sourceId', 'template', 'costPrice', 'baseQty', 'unit', 'item',
]);
const LABELS: Record<string, string> = {
  partyName: 'Party', party: 'Party', dueDate: 'Due date', settled: 'Received / paid', paymentType: 'Payment type', paymentAccount: 'Payment account',
  discountPercent: 'Discount %', discountAmount: 'Discount', taxTotal: 'Tax', roundOff: 'Round off', refNo: 'Reference no.', stateOfSupply: 'Delivery division',
  billingAddress: 'Billing address', shippingAddress: 'Shipping address', openingBalance: 'Opening balance', salePrice: 'Sale price', purchasePrice: 'Purchase price',
  wholesalePrice: 'Wholesale price', minStock: 'Minimum stock', openingQty: 'Opening quantity', taxRate: 'Tax rate', cancelReason: 'Cancel reason',
};

const isDateKey = (k: string) => /(^date$|Date$|At$)/.test(k);
export const humanize = (k: string) => LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function show(k: string, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string' && isDateKey(k) && !Number.isNaN(Date.parse(v))) return fmtDate(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? (x as Plain).label ?? (x as Plain).name ?? JSON.stringify(x) : String(x))).join(', ') : '—';
  if (typeof v === 'object') return (v as Plain).name ? String((v as Plain).name) : JSON.stringify(v);
  return String(v);
}

function same(a: unknown, b: unknown, key = '') {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
  if ((a === undefined || a === null || a === '') && (b === undefined || b === null || b === '')) return true;
  if (key && isDateKey(key) && typeof a === 'string' && typeof b === 'string' && !Number.isNaN(Date.parse(a)) && !Number.isNaN(Date.parse(b))) {
    return fmtDate(a) === fmtDate(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

interface Line {
  name: string;
  qty?: number;
  price?: number;
  amount?: number;
  unitName?: string;
}

function lineChanges(before: Line[] = [], after: Line[] = []) {
  const out: { kind: 'added' | 'removed' | 'changed'; text: string }[] = [];
  const b = new Map(before.map((l) => [l.name, l]));
  const a = new Map(after.map((l) => [l.name, l]));
  for (const [name, l] of a) {
    const old = b.get(name);
    if (!old) out.push({ kind: 'added', text: `${name} — ${num(l.qty ?? 0, 3)} × ${num(l.price ?? 0)}` });
    else {
      const parts: string[] = [];
      if (!same(old.qty, l.qty)) parts.push(`qty ${num(old.qty ?? 0, 3)} → ${num(l.qty ?? 0, 3)}`);
      if (!same(old.price, l.price)) parts.push(`price ${num(old.price ?? 0)} → ${num(l.price ?? 0)}`);
      if (parts.length) out.push({ kind: 'changed', text: `${name}: ${parts.join(', ')}` });
    }
  }
  for (const [name, l] of b) if (!a.has(name)) out.push({ kind: 'removed', text: `${name} — ${num(l.qty ?? 0, 3)} × ${num(l.price ?? 0)}` });
  return out;
}

/** Field-by-field "before → after" table for audit entries and approval requests. */
export function ChangeList({ before, after, className }: { before?: Plain | null; after?: Plain | null; className?: string }) {
  if (!before && !after) return null;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !IGNORE.has(k) && k !== 'items' && k !== 'allocations');
  const rows = keys
    .filter((k) => !before || !after || !same(before[k], after[k], k))
    .filter((k) => !(before && !after) || (before[k] !== undefined && before[k] !== null && before[k] !== ''))
    .filter((k) => !(!before && after) || (after[k] !== undefined && after[k] !== null && after[k] !== ''));
  const items = before && after && (Array.isArray(before.items) || Array.isArray(after.items)) ? lineChanges(before.items as Line[], after.items as Line[]) : [];
  if (!rows.length && !items.length) return <p className="text-xs text-slate-400">No field changes recorded.</p>;
  return (
    <div className={className}>
      {rows.length > 0 && (
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 40).map((k) => (
              <tr key={k}>
                <td className="w-40 py-1 pr-3 align-top font-medium text-slate-500">{humanize(k)}</td>
                <td className="py-1 align-top text-slate-700">
                  {before && after ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-rose-600 line-through decoration-rose-300">{show(k, before[k])}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="text-emerald-700">{show(k, after[k])}</span>
                    </span>
                  ) : (
                    show(k, (after ?? before)![k])
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs">
          <p className="font-medium text-slate-500">Items</p>
          {items.map((c, i) => (
            <p key={i} className={c.kind === 'added' ? 'text-emerald-700' : c.kind === 'removed' ? 'text-rose-600' : 'text-slate-700'}>
              {c.kind === 'added' ? '+ ' : c.kind === 'removed' ? '− ' : '~ '}
              {c.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
