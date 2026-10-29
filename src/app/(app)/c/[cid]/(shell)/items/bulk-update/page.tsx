'use client';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw, Save, Wand2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Item } from '@/lib/types';
import { invalidateCompany } from '@/lib/query';
import { cn, plural, round2 } from '@/lib/utils';
import { useCategories, useItems } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, NumberInput, Select } from '@/components/ui/input';
import { EmptyState, NoAccess, PageHeader, PageLoader, SearchInput } from '@/components/ui/misc';
import { LoadError } from '@/components/ui/fallback';
import { useConfirm } from '@/components/ui/confirm';

type NumberField = 'salePrice' | 'wholesalePrice' | 'minWholesaleQty' | 'purchasePrice' | 'mrp' | 'taxRate' | 'minStock';
type Draft = Partial<Record<NumberField, number>> & { category?: string };
type Row = Pick<Item, '_id' | 'name' | 'code' | 'type'> & Record<NumberField, number> & { category: string };

const PAGE = 300;

function toRow(i: Item): Row {
  return {
    _id: i._id, name: i.name, code: i.code, type: i.type, category: i.category?._id ?? '',
    salePrice: i.salePrice, wholesalePrice: i.wholesalePrice, minWholesaleQty: i.minWholesaleQty, purchasePrice: i.purchasePrice, mrp: i.mrp ?? 0, taxRate: i.taxRate, minStock: i.minStock,
  };
}

/** One editable row. Memoised, so typing in a cell re-renders only its own row in a list of thousands. */
const BulkRow = memo(function BulkRow({
  row, draft, columns, categories, taxRates, onChange,
}: {
  row: Row;
  draft: Draft | undefined;
  columns: { key: NumberField; label: string }[];
  categories: { _id: string; name: string }[];
  taxRates: number[];
  onChange: (id: string, patch: Draft) => void;
}) {
  const value = <K extends keyof Draft>(k: K) => (draft?.[k] ?? row[k as keyof Row]) as NonNullable<Draft[K]>;
  const changed = (k: keyof Draft) => draft?.[k] !== undefined;
  return (
    <tr className={cn(draft && 'bg-amber-50/40')}>
      <td className="sticky left-0 z-[1] bg-white px-3 py-1.5">
        <span className="block max-w-56 truncate font-medium text-slate-900" title={row.name}>
          {row.name}
        </span>
        <span className="text-[11px] text-slate-400">{[row.code, row.type === 'service' ? 'Service' : null].filter(Boolean).join(' · ') || '—'}</span>
      </td>
      {categories.length > 0 && (
        <td className="px-2 py-1.5">
          <Select value={value('category')} onChange={(e) => onChange(row._id, { category: e.target.value })} className={cn('h-8 min-w-36 px-2 text-xs', changed('category') && 'border-amber-400 bg-amber-50')} aria-label={`Category of ${row.name}`}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </td>
      )}
      {columns.map((c) =>
        c.key === 'taxRate' ? (
          <td key={c.key} className="px-2 py-1.5">
            <Select value={String(value('taxRate'))} onChange={(e) => onChange(row._id, { taxRate: Number(e.target.value) })} className={cn('h-8 w-24 px-2 text-xs', changed('taxRate') && 'border-amber-400 bg-amber-50')} aria-label={`Tax of ${row.name}`}>
              {[...new Set([...taxRates, value('taxRate')])].sort((a, b) => a - b).map((r) => (
                <option key={r} value={r}>
                  {r ? `${r}%` : 'None'}
                </option>
              ))}
            </Select>
          </td>
        ) : (
          <td key={c.key} className="px-2 py-1.5">
            <NumberInput
              value={value(c.key)}
              min={0}
              onValueChange={(v) => onChange(row._id, { [c.key]: v })}
              className={cn('h-8 w-28 px-2 text-xs', changed(c.key) && 'border-amber-400 bg-amber-50')}
              aria-label={`${c.label} of ${row.name}`}
              disabled={row.type === 'service' && c.key === 'minStock'}
            />
          </td>
        ),
      )}
    </tr>
  );
});

export default function BulkUpdateItemsPage() {
  const { cid, can, href, settings } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const items = useItems();
  const categories = useCategories(settings?.items.enableCategories !== false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [tool, setTool] = useState<{ field: 'salePrice' | 'purchasePrice' | 'wholesalePrice' | 'mrp'; dir: 'up' | 'down'; by: 'percent' | 'amount'; value: number }>({ field: 'salePrice', dir: 'up', by: 'percent', value: 0 });

  const rows = useMemo(() => (items.data ?? []).map(toRow), [items.data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r._id, r])), [rows]);
  const changedCount = Object.keys(drafts).length;

  useEffect(() => {
    if (!changedCount) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changedCount]);

  /** Merges a change into the row's draft, dropping fields that are back to the saved value. */
  const onChange = useCallback(
    (id: string, patch: Draft) =>
      setDrafts((all) => {
        const row = byId.get(id);
        if (!row) return all;
        const next: Draft = { ...all[id], ...patch };
        for (const k of Object.keys(next) as (keyof Draft)[]) if (next[k] === row[k as keyof Row]) delete next[k];
        const out = { ...all };
        if (Object.keys(next).length) out[id] = next;
        else delete out[id];
        return out;
      }),
    [byId],
  );

  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (!q || r.name.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q)) && (!category || (category === 'none' ? !r.category : r.category === category)) && (!onlyChanged || drafts[r._id]),
  );

  const applyTool = () => {
    if (!tool.value) return toast.error('Enter the change to apply');
    for (const r of shown) {
      const current = drafts[r._id]?.[tool.field] ?? r[tool.field];
      if (tool.field === 'mrp' && !current) continue;
      const delta = tool.by === 'percent' ? (current * tool.value) / 100 : tool.value;
      onChange(r._id, { [tool.field]: Math.max(0, round2(current + (tool.dir === 'up' ? delta : -delta))) });
    }
    toast.success(`${FIELD_LABEL[tool.field]} changed for ${plural(shown.length, 'item')}. Review and save.`);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(drafts).map(([id, d]) => ({ id, ...d, ...(d.mrp !== undefined ? { mrp: d.mrp || null } : {}) }));
      return (await api.put<{ updated: number; skipped: { id: string; reason: string }[] }>('/items/bulk-update', { items: payload })).data;
    },
    onSuccess: (r) => {
      setDrafts({});
      invalidateCompany(qc, cid);
      if (r.skipped.length) toast.warning(`${plural(r.updated, 'item')} updated, ${r.skipped.length} skipped`, { description: r.skipped.map((s) => s.reason).join('; ') });
      else toast.success(`${plural(r.updated, 'item')} updated`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('items.edit')) return <NoAccess what="editing items" />;
  if (items.isLoading || !settings) return <PageLoader label="Loading items…" />;
  if (items.isError) return <LoadError error={items.error} what="items" onRetry={() => items.refetch()} />;

  const columns: { key: NumberField; label: string }[] = [
    { key: 'salePrice', label: 'Sale price' },
    ...(settings.items.enableWholesalePrice !== false
      ? [
          { key: 'wholesalePrice' as const, label: 'Wholesale price' },
          { key: 'minWholesaleQty' as const, label: 'Min wholesale qty' },
        ]
      : []),
    { key: 'purchasePrice', label: 'Purchase price' },
    ...(settings.items.enableMrp !== false ? [{ key: 'mrp' as const, label: 'MRP' }] : []),
    ...(settings.taxes.enableGst !== false ? [{ key: 'taxRate' as const, label: 'Tax' }] : []),
    ...(settings.items.enableStock !== false ? [{ key: 'minStock' as const, label: 'Min stock' }] : []),
  ];
  const taxRates = (settings.taxes.rates ?? []).map((r) => r.rate);
  const cats = settings.items.enableCategories !== false ? (categories.data?.categories ?? []) : [];

  const discard = async () => {
    if (await confirm({ title: 'Discard changes?', message: `Changes to ${plural(changedCount, 'item')} will be lost.`, confirmText: 'Discard', danger: true })) setDrafts({});
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link href={href('/items')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Back to items">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            Update items in bulk
          </span>
        }
        description="Change prices, tax, minimum stock and categories of many items at once. Nothing is saved until you press Save changes."
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Wand2 className="h-4 w-4 text-violet-500" /> Change for all {plural(shown.length, 'item')} shown:
          </span>
          <Select value={tool.field} onChange={(e) => setTool((t) => ({ ...t, field: e.target.value as typeof t.field }))} className="h-9 w-auto text-sm" aria-label="Price to change">
            <option value="salePrice">Sale price</option>
            <option value="purchasePrice">Purchase price</option>
            {settings.items.enableWholesalePrice !== false && <option value="wholesalePrice">Wholesale price</option>}
            {settings.items.enableMrp !== false && <option value="mrp">MRP</option>}
          </Select>
          <Select value={tool.dir} onChange={(e) => setTool((t) => ({ ...t, dir: e.target.value as 'up' | 'down' }))} className="h-9 w-auto text-sm" aria-label="Increase or decrease">
            <option value="up">Increase by</option>
            <option value="down">Decrease by</option>
          </Select>
          <NumberInput value={tool.value} min={0} onValueChange={(v) => setTool((t) => ({ ...t, value: v }))} className="h-9 w-24" aria-label="Change by" />
          <Select value={tool.by} onChange={(e) => setTool((t) => ({ ...t, by: e.target.value as 'percent' | 'amount' }))} className="h-9 w-auto text-sm" aria-label="Percent or amount">
            <option value="percent">%</option>
            <option value="amount">{settings.general.currencySymbol || '৳'}</option>
          </Select>
          <Button variant="outline" onClick={applyTool} disabled={!shown.length}>
            Apply
          </Button>
        </div>
      </Card>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setLimit(PAGE); }} placeholder="Search name or code" className="w-full sm:w-64" />
          {cats.length > 0 && (
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }} className="h-9 w-full text-sm sm:w-48" aria-label="Category filter">
              <option value="">All categories</option>
              <option value="none">No category</option>
              {cats.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Checkbox checked={onlyChanged} onChange={setOnlyChanged} label="Show only changed" />
          <span className="ml-auto text-xs text-slate-500">{plural(shown.length, 'item')}</span>
        </div>
        {shown.length === 0 ? (
          <EmptyState title={rows.length ? 'No items match' : 'No items yet'} description={rows.length ? 'Change the search or the category filter.' : 'Add items first, then update them here.'} />
        ) : (
          <div className="max-h-[calc(100vh-320px)] min-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[2] bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="sticky left-0 z-[3] bg-slate-50 px-3 py-2">Item</th>
                  {cats.length > 0 && <th className="px-2 py-2">Category</th>}
                  {columns.map((c) => (
                    <th key={c.key} className={cn('px-2 py-2', c.key !== 'taxRate' && 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.slice(0, limit).map((r) => (
                  <BulkRow key={r._id} row={r} draft={drafts[r._id]} columns={columns} categories={cats} taxRates={taxRates} onChange={onChange} />
                ))}
              </tbody>
            </table>
            {shown.length > limit && (
              <div className="p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, shown.length - limit)} more
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {changedCount > 0 && (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-blue-200 bg-blue-50/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-sm text-blue-900">
            <b className="font-semibold">{plural(changedCount, 'item')}</b> changed and not saved yet
          </span>
          <Button variant="outline" onClick={discard} disabled={save.isPending}>
            <RotateCcw className="h-4 w-4" /> Discard
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {!save.isPending && <Save className="h-4 w-4" />} Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { salePrice: 'Sale price', purchasePrice: 'Purchase price', wholesalePrice: 'Wholesale price', mrp: 'MRP' };
