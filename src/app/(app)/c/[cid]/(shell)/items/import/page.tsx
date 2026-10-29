'use client';
import { money, qty } from '@/lib/utils';
import { ImportWizard, type ImportColumn, type ImportRow } from '@/components/import/import-wizard';

interface ItemRow extends ImportRow {
  code?: string;
  hsn?: string;
  category?: string;
  baseUnit?: string;
  secondaryUnit?: string;
  conversionRate: number;
  salePrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  purchasePrice: number;
  taxRate: number;
  openingQty: number;
  openingPrice: number;
  minStock: number;
  location?: string;
  type: 'product' | 'service';
}

const COLUMNS: ImportColumn<ItemRow>[] = [
  {
    label: 'Item name',
    render: (r) => (
      <span className="font-medium text-slate-900">
        {r.name || <span className="text-rose-600 italic">missing</span>}
        {r.type === 'service' && <span className="ml-1.5 text-[11px] font-normal text-violet-600">service</span>}
      </span>
    ),
  },
  { label: 'Code / HS code', render: (r) => <span className="text-xs text-slate-600">{[r.code, r.hsn].filter(Boolean).join(' / ') || '—'}</span> },
  { label: 'Category', render: (r) => <span className="text-slate-600">{r.category || '—'}</span> },
  {
    label: 'Units',
    render: (r) => (
      <span className="text-xs text-slate-600">
        {r.baseUnit || '—'}
        {r.secondaryUnit ? ` → ${r.secondaryUnit} (×${r.conversionRate})` : ''}
      </span>
    ),
  },
  { label: 'Sale price', align: 'right', render: (r) => money(r.salePrice) },
  { label: 'Purchase price', align: 'right', render: (r) => money(r.purchasePrice) },
  { label: 'Tax', align: 'right', render: (r) => `${r.taxRate}%` },
  { label: 'Opening qty', align: 'right', render: (r) => (r.type === 'product' ? qty(r.openingQty) : '—') },
];

export default function ImportItemsPage() {
  return (
    <ImportWizard<ItemRow>
      resource="items"
      noun={{ one: 'item', many: 'items' }}
      title="Import items from Excel"
      description="Add hundreds of products and services at once. Categories and units that don't exist yet are created for you."
      templateHelp={
        <>
          Fill one item per row. Only <b>Item Name</b> is required. Use the same unit short names you use in the app (e.g. PCS, KG, BOX); new ones are created automatically. Set <b>Type</b> to
          &quot;service&quot; for services.
        </>
      }
      doneNote="Opening stock was recorded for products with an opening quantity."
      columns={COLUMNS}
      minWidth={1100}
    />
  );
}
