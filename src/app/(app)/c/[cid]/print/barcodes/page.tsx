'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Barcode as BarcodeIcon, Printer, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Item } from '@/lib/types';
import { cn, money, plural, qty as fmtQty } from '@/lib/utils';
import { useItems } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, NumberInput, Select } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { EmptyState, NoAccess, PageLoader } from '@/components/ui/misc';
import { Barcode, code128 } from '@/components/item/barcode';

/** Label stock: common A4 sheets (centred on the page) and single labels for thermal label printers. Sizes in mm. */
const LAYOUTS = [
  { key: 'a4-65', label: 'A4 sheet · 65 labels', note: '38.1 × 21.2 mm, 5 across, 13 down', cols: 5, rows: 13, w: 38.1, h: 21.2, gap: 2.5 },
  { key: 'a4-40', label: 'A4 sheet · 40 labels', note: '48.5 × 25.4 mm, 4 across, 10 down', cols: 4, rows: 10, w: 48.5, h: 25.4, gap: 0 },
  { key: 'a4-24', label: 'A4 sheet · 24 labels', note: '63.5 × 33.9 mm, 3 across, 8 down', cols: 3, rows: 8, w: 63.5, h: 33.9, gap: 2.5 },
  { key: 'roll-50x25', label: 'Label printer · 50 × 25 mm', note: 'One label per page on a roll', cols: 1, rows: 1, w: 50, h: 25, gap: 0, roll: true },
  { key: 'roll-38x25', label: 'Label printer · 38 × 25 mm', note: 'One label per page on a roll', cols: 1, rows: 1, w: 38, h: 25, gap: 0, roll: true },
] as const;
type Layout = (typeof LAYOUTS)[number];

interface Options {
  layout: Layout['key'];
  company: boolean;
  name: boolean;
  code: boolean;
  price: 'sale' | 'mrp' | 'both' | 'none';
  start: number;
}
const DEFAULTS: Options = { layout: 'a4-65', company: true, name: true, code: true, price: 'sale', start: 1 };
const STORE = 'vy:barcode-labels';

function loadOptions(): Options {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Options>;
    return { ...DEFAULTS, ...saved, start: 1, layout: LAYOUTS.some((l) => l.key === saved.layout) ? saved.layout! : DEFAULTS.layout };
  } catch {
    return DEFAULTS;
  }
}

function Label({ item, layout, o, companyName }: { item: Item; layout: Layout; o: Options; companyName: string }) {
  // Text scales with the label height so a 21 mm label and a 34 mm label both stay readable
  const unit = layout.h / 21.2;
  const prices = [
    (o.price === 'sale' || o.price === 'both') && `Price ${money(item.salePrice)}`,
    (o.price === 'mrp' || o.price === 'both') && item.mrp ? `MRP ${money(item.mrp)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-[1.5mm] py-[1mm] text-center leading-tight text-black" style={{ fontSize: `${2.3 * unit}mm` }}>
      {o.company && <p className="w-full truncate font-semibold uppercase" style={{ fontSize: `${1.9 * unit}mm` }}>{companyName}</p>}
      {o.name && <p className="line-clamp-1 w-full font-medium">{item.name}</p>}
      {/* The bars take the height left after the text lines, up to just over half the label */}
      <Barcode value={item.code!} className="my-[0.4mm] min-h-0 w-full flex-1" style={{ maxHeight: `${layout.h * 0.55}mm` }} />
      <div className="flex w-full items-baseline justify-between gap-1" style={{ fontSize: `${2 * unit}mm` }}>
        {o.code && <span className="truncate font-mono">{item.code}</span>}
        {prices.length > 0 && <span className={cn('truncate font-semibold', !o.code && 'mx-auto')}>{prices.join(' · ')}</span>}
      </div>
    </div>
  );
}

export default function BarcodeLabelsPage() {
  const { company, can, href, cid } = useCompany();
  const params = useSearchParams();
  const qc = useQueryClient();
  const items = useItems();
  const [o, setO] = useState<Options>(loadOptions);
  const [picked, setPicked] = useState<{ id: string; count: number }[]>(() => (params.get('items') ?? '').split(',').filter(Boolean).map((id) => ({ id, count: 1 })));
  const set = <K extends keyof Options>(k: K, v: Options[K]) =>
    setO((x) => {
      const next = { ...x, [k]: v };
      try {
        localStorage.setItem(STORE, JSON.stringify({ ...next, start: undefined }));
      } catch {
        /* remembering the choice is optional */
      }
      return next;
    });

  const assign = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<{ codes: Record<string, string> }>('/items/assign-codes', { items: ids })).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [cid, 'items'] });
      toast.success(`Codes created for ${plural(Object.keys(r.codes).length, 'item')}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('items.view')) return <div className="p-6"><NoAccess what="items" /></div>;
  if (items.isLoading || !company) return <PageLoader label="Loading items…" />;

  const all = items.data ?? [];
  const byId = new Map(all.map((i) => [i._id, i]));
  const rows = picked.map((p) => ({ ...p, item: byId.get(p.id) })).filter((r): r is { id: string; count: number; item: Item } => !!r.item);
  const missing = rows.filter((r) => !r.item.code);
  const invalid = rows.filter((r) => r.item.code && !code128(r.item.code));
  const printable = rows.filter((r) => r.item.code && code128(r.item.code));
  const layout = LAYOUTS.find((l) => l.key === o.layout) ?? LAYOUTS[0];
  const perPage = layout.cols * layout.rows;
  const skip = 'roll' in layout ? 0 : Math.min(Math.max(1, o.start), perPage) - 1;
  const labels: (Item | null)[] = [...Array<null>(skip).fill(null), ...printable.flatMap((r) => Array<Item>(r.count).fill(r.item))];
  const total = labels.length - skip;
  const pages: (Item | null)[][] = [];
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
  // The last sheet shows its unused labels too, so the preview looks like the sheet in the printer
  const lastPage = pages[pages.length - 1];
  if (lastPage && !('roll' in layout)) lastPage.push(...Array<null>(perPage - lastPage.length).fill(null));

  const pageW = 'roll' in layout ? layout.w : 210;
  const pageH = 'roll' in layout ? layout.h : 297;
  const marginX = (pageW - layout.cols * layout.w - (layout.cols - 1) * layout.gap) / 2;
  const marginY = (pageH - layout.rows * layout.h) / 2;
  const pageCss = `
    @media print {
      @page { size: ${'roll' in layout ? `${layout.w}mm ${layout.h}mm` : 'A4'}; margin: 0; }
      html, body { background: #fff !important; }
      .label-page { box-shadow: none !important; margin: 0 !important; break-after: page; }
      .label-page:last-child { break-after: auto; }
      .label-root, .label-preview { padding: 0 !important; overflow: visible !important; height: auto !important; background: #fff !important; }
    }`;

  const options = all
    .filter((i) => i.isActive !== false && !picked.some((p) => p.id === i._id))
    .map((i) => ({ value: i._id, label: i.name, hint: i.code ?? 'No code yet', keywords: i.code ?? '', right: money(i.salePrice) }));
  const update = (id: string, count: number) => setPicked((list) => list.map((p) => (p.id === id ? { ...p, count: Math.max(1, Math.min(1000, Math.round(count) || 1)) } : p)));

  return (
    <div className="label-root min-h-screen bg-slate-100 lg:flex">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <aside className="no-print w-full shrink-0 space-y-4 border-b border-slate-200 bg-white p-4 lg:h-screen lg:w-[400px] lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2">
          <Link href={href('/items')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to items">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900">Barcode labels</h1>
            <p className="text-xs text-slate-500">Print item codes as barcodes for shelves and packets</p>
          </div>
        </div>

        <Card className="space-y-3 p-3">
          <p className="text-sm font-semibold text-slate-900">Items</p>
          <Combobox value={null} onChange={(v) => v && setPicked((list) => [...list, { id: v, count: 1 }])} options={options} placeholder="Add an item" searchPlaceholder="Search name or code" />
          {rows.length > 1 && (
            <div className="flex justify-end gap-3 text-xs">
              <button type="button" className="text-blue-600 hover:underline" onClick={() => setPicked((list) => list.map((p) => ({ ...p, count: Math.max(1, Math.floor(byId.get(p.id)?.stock ?? 1)) })))}>
                One label per item in stock
              </button>
              <button type="button" className="text-slate-500 hover:underline" onClick={() => setPicked([])}>
                Clear
              </button>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">Add the items you want labels for.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{r.item.name}</p>
                    <p className={cn('text-[11px]', r.item.code ? 'text-slate-500' : 'text-amber-600')}>
                      {r.item.code ?? 'No item code'}
                      {r.item.type === 'product' && ` · stock ${fmtQty(r.item.stock)}`}
                    </p>
                  </div>
                  <NumberInput value={r.count} min={1} max={1000} step={1} onValueChange={(v) => update(r.id, v)} className="h-8 w-20" aria-label={`Labels for ${r.item.name}`} />
                  <button type="button" onClick={() => setPicked((list) => list.filter((p) => p.id !== r.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${r.item.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {plural(missing.length, 'item')} {missing.length === 1 ? 'has' : 'have'} no item code, so no barcode can be printed.
              </p>
              {can('items.edit') && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => assign.mutate(missing.map((m) => m.id))} loading={assign.isPending}>
                  Create codes
                </Button>
              )}
            </div>
          )}
          {invalid.length > 0 && <p className="text-xs text-rose-600">These codes have characters a barcode cannot hold: {invalid.map((r) => r.item.code).join(', ')}</p>}
        </Card>

        <Card className="space-y-3 p-3">
          <p className="text-sm font-semibold text-slate-900">Label</p>
          <Field label="Paper" hint={layout.note}>
            <Select value={o.layout} onChange={(e) => set('layout', e.target.value as Layout['key'])}>
              {LAYOUTS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          {!('roll' in layout) && (
            <Field label="Start at label" hint="Skip labels already used on a part-used sheet">
              <NumberInput value={o.start} min={1} max={perPage} step={1} onValueChange={(v) => setO((x) => ({ ...x, start: Math.max(1, Math.min(perPage, Math.round(v) || 1)) }))} />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2">
            <Checkbox checked={o.company} onChange={(v) => set('company', v)} label="Business name" />
            <Checkbox checked={o.name} onChange={(v) => set('name', v)} label="Item name" />
            <Checkbox checked={o.code} onChange={(v) => set('code', v)} label="Item code under the barcode" />
          </div>
          <Field label="Price">
            <Select value={o.price} onChange={(e) => set('price', e.target.value as Options['price'])}>
              <option value="sale">Sale price</option>
              <option value="mrp">MRP</option>
              <option value="both">Sale price and MRP</option>
              <option value="none">No price</option>
            </Select>
          </Field>
        </Card>

        <div className="space-y-2">
          <Button className="w-full" onClick={() => window.print()} disabled={!total}>
            <Printer className="h-4 w-4" /> Print {plural(total, 'label')}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {total ? `${plural(pages.length, 'roll' in layout ? 'label' : 'sheet')} · ` : ''}In the print window choose the actual size (100%) and no margins.
          </p>
        </div>
      </aside>

      <main className="label-preview min-w-0 flex-1 overflow-auto p-4 lg:h-screen lg:p-8">
        {total === 0 ? (
          <div className="no-print mx-auto max-w-md pt-10">
            <EmptyState icon={<BarcodeIcon className="h-6 w-6" />} title="No labels yet" description="Add items with a code on the left. The labels appear here exactly as they will print." />
          </div>
        ) : (
          <div className="space-y-6">
            {pages.map((page, pi) => (
              <div
                key={pi}
                className="label-page relative mx-auto bg-white shadow-md"
                style={{ width: `${pageW}mm`, height: `${pageH}mm`, paddingTop: `${marginY}mm`, paddingLeft: `${marginX}mm` }}
              >
                <div className="grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, ${layout.w}mm)`, gridAutoRows: `${layout.h}mm`, columnGap: `${layout.gap}mm` }}>
                  {page.map((it, i) => (
                    <div key={i} className={cn(!('roll' in layout) && 'outline outline-1 outline-dashed outline-slate-200 print:outline-none')}>
                      {it && <Label item={it} layout={layout} o={o} companyName={company.name} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
