'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Barcode, Boxes, Download, FolderInput, MoreVertical, PackagePlus, Pencil, Plus, Ruler, SlidersHorizontal, Tags, Trash2, Upload, Wrench,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Item, TxnType, Unit } from '@/lib/types';
import { TXN } from '@/lib/txn';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { cn, fmtDate, money, plural, qty, today } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCategories, useItems, useUnits, type CategoryRow } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Checkbox, Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState, PageHeader, SearchInput, Skeleton, Spinner, Tabs } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { ItemModal } from '@/components/item/item-modal';
import { TxnMenu } from '@/components/txn/actions';
import { useQueryState } from '@/hooks/use-query-state';
import { useResetOn } from '@/hooks/use-reset-on';
import { useUrlFlag } from '@/hooks/use-url-flag';


const unitOf = (i: Item) => (i.baseUnit && typeof i.baseUnit === 'object' ? i.baseUnit.shortName : '');

/* ------------------------------------------------------------------ */
/* Stock adjustment                                                    */
/* ------------------------------------------------------------------ */

function AdjustModal({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [kind, setKind] = useState<'add' | 'reduce'>('add');
  const [date, setDate] = useState(today());
  const [q, setQ] = useState(0);
  const [price, setPrice] = useState(item.purchasePrice);
  const [details, setDetails] = useState('');
  useResetOn(open ? item._id : null, () => {
    if (!open) return;
    setKind('add');
    setDate(today());
    setQ(0);
    setPrice(item.purchasePrice);
    setDetails('');
  });
  const save = useMutation({
    mutationFn: () => api.post(`/items/${item._id}/adjust`, { kind, date, qty: q, price, details }),
    onSuccess: (res) => {
      reportWrite(res, `Stock ${kind === 'add' ? 'added' : 'reduced'}`);
      invalidateCompany(qc, cid);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const after = kind === 'add' ? item.stock + q : item.stock - q;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Stock adjustment · ${item.name}`}
      description="Correct stock for damage, loss, free samples, counting differences and more. The change is kept in the item history."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!(q > 0)}>
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {(['add', 'reduce'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn('flex-1 py-2', kind === k ? (k === 'add' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-white text-slate-600 hover:bg-slate-50')}>
              {k === 'add' ? 'Add stock' : 'Reduce stock'}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Adjustment date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`Quantity${unitOf(item) ? ` (${unitOf(item)})` : ''}`} required>
            <NumberInput value={q} min={0} onValueChange={setQ} />
          </Field>
          <Field label="At price (per unit)">
            <NumberInput value={price} min={0} onValueChange={setPrice} />
          </Field>
        </div>
        <Field label="Details">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="e.g. 3 pieces damaged in transit" />
        </Field>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Current stock <b>{qty(item.stock)}</b> → after adjustment <b className={after < 0 ? 'text-rose-600' : 'text-slate-900'}>{qty(after)}</b> {unitOf(item)}
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Item detail                                                         */
/* ------------------------------------------------------------------ */

interface ItemTxnRow {
  _id: string;
  kind: 'txn' | 'adjustment' | 'opening';
  type: string;
  number: string;
  party?: string;
  partyName?: string;
  phone?: string;
  date: string;
  dueDate?: string;
  qty: number;
  unitName?: string;
  price: number;
  amount: number;
  status: string;
  balance?: number;
  total?: number;
}

const ROW_LABEL: Record<string, string> = { ADD_STOCK: 'Add stock', REDUCE_STOCK: 'Reduce stock', OPENING_STOCK: 'Opening stock' };

function ItemDetailPane({ itemId, onBack, onEdit, onDeleted }: { itemId: string; onBack: () => void; onEdit: (i: Item) => void; onDeleted: () => void }) {
  const { cid, can, href, settings } = useCompany();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [adjust, setAdjust] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const debounced = useDebounce(search);
  const item = useQuery({ queryKey: [cid, 'items', 'detail', itemId], queryFn: async () => (await api.get<Item>(`/items/${itemId}`)).data });
  const hist = useQuery({
    queryKey: [cid, 'items', 'history', itemId, debounced, type],
    queryFn: async () => (await api.get<ItemTxnRow[]>(`/items/${itemId}/transactions`, { search: debounced, type: type || undefined })).data,
  });
  const del = useMutation({
    mutationFn: () => api.del(`/items/${itemId}`),
    onSuccess: (res) => {
      if (!reportWrite(res, 'Item deleted')) return invalidateCompany(qc, cid);
      invalidateCompany(qc, cid, itemId);
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delAdj = useMutation({
    mutationFn: (id: string) => api.del(`/items/adjustments/${id}`),
    onSuccess: (res) => {
      reportWrite(res, 'Adjustment removed');
      invalidateCompany(qc, cid);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const i = item.data;
  if (item.isError)
    return (
      <Card>
        <EmptyState title="Item not found" description="It may have been deleted, or the link is old." action={<Button variant="outline" onClick={onDeleted}>Open the first item</Button>} />
      </Card>
    );
  if (item.isLoading || !i)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  const low = i.type === 'product' && i.minStock > 0 && i.stock <= i.minStock;
  const unit = unitOf(i);
  const stockOn = settings?.items.enableStock !== false && i.type === 'product';

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3 p-5 pb-3">
          <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to list">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">{i.name}</h2>
              {i.type === 'service' && <Badge tone="violet">Service</Badge>}
              {i.category && typeof i.category === 'object' && <Badge tone="blue">{i.category.name}</Badge>}
              {i.isActive === false && <Badge tone="amber">Inactive</Badge>}
              {low && (
                <Badge tone="red">
                  <AlertTriangle className="h-3 w-3" /> Low stock
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {[i.code && `Code ${i.code}`, i.hsn && `HS ${i.hsn}`, i.location && `Location ${i.location}`, i.secondaryUnit && typeof i.secondaryUnit === 'object' && `1 ${unit} = ${i.conversionRate} ${i.secondaryUnit.shortName}`]
                .filter(Boolean)
                .join(' · ') || 'No code or HS code set'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stockOn && can('items.adjust_stock') && (
              <Button size="sm" onClick={() => setAdjust(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Adjust item
              </Button>
            )}
            {can('items.edit') && (
              <Button size="sm" variant="outline" onClick={() => onEdit(i)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {(can('items.delete') || settings?.items.enableItemCode !== false) && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="More item actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  {settings?.items.enableItemCode !== false && (
                    <DropdownItem icon={<Barcode className="h-4 w-4" />} onSelect={() => router.push(href(`/print/barcodes?items=${i._id}`))}>
                      Print barcode labels
                    </DropdownItem>
                  )}
                  {can('items.delete') && (
                    <>
                      {settings?.items.enableItemCode !== false && <DropdownSeparator />}
                      <DropdownItem
                        danger
                        icon={<Trash2 className="h-4 w-4" />}
                        onSelect={async () => {
                          if (await confirm({ title: `Delete ${i.name}?`, message: 'Items used in transactions cannot be deleted; mark them inactive instead.', danger: true, confirmText: 'Delete' })) del.mutate();
                        }}
                      >
                        Delete item
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </Dropdown>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-5">
          {[
            { label: 'Sale price', value: money(i.salePrice), sub: i.saleTaxInclusive ? 'incl. tax' : 'excl. tax' },
            { label: 'Purchase price', value: money(i.purchasePrice), sub: i.purchaseTaxInclusive ? 'incl. tax' : 'excl. tax' },
            ...(settings?.items.enableWholesalePrice !== false ? [{ label: 'Wholesale price', value: money(i.wholesalePrice), sub: i.minWholesaleQty ? `from ${qty(i.minWholesaleQty)} ${unit}` : '—' }] : []),
            ...(stockOn
              ? [
                  { label: 'Stock quantity', value: `${qty(i.stock)} ${unit}`, sub: i.minStock ? `min ${qty(i.minStock)}` : 'no minimum', danger: low },
                  { label: 'Stock value', value: money(i.stockValue ?? Math.max(0, i.stock) * i.purchasePrice), sub: 'at purchase price' },
                ]
              : [{ label: 'Tax rate', value: `${i.taxRate}%`, sub: '' }]),
          ].map((s) => (
            <div key={s.label} className="bg-white px-5 py-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn('mt-0.5 font-semibold', 'danger' in s && s.danger ? 'text-rose-600' : 'text-slate-900')}>{s.value}</p>
              <p className="text-[11px] text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <p className="text-sm font-semibold text-slate-900">Transactions</p>
          <div className="flex-1" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
            <option value="">All</option>
            {(['SALE', 'PURCHASE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ESTIMATE', 'PROFORMA', 'SALE_ORDER', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'EXPENSE'] as TxnType[]).map((t) => (
              <option key={t} value={t}>
                {TXN[t].label}
              </option>
            ))}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoice or party" className="w-full sm:w-60" />
        </div>
        {hist.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, k) => (
              <Skeleton key={k} className="h-9" />
            ))}
          </div>
        ) : !hist.data?.length ? (
          <EmptyState title="No transactions for this item" description="Sales, purchases and stock adjustments of this item appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Invoice / Ref.</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Price / unit</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="w-12 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hist.data.map((r) => (
                  <tr key={`${r.kind}-${r._id}-${r.number}-${r.qty}`} className={cn('hover:bg-slate-50', r.status === 'CANCELLED' && 'text-slate-400')}>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      {r.kind === 'txn' ? TXN[r.type as TxnType]?.label : <span className={r.type === 'REDUCE_STOCK' ? 'text-rose-600' : 'text-emerald-700'}>{ROW_LABEL[r.type] ?? r.type}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.number || '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600">{r.partyName || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {qty(r.qty)} {r.unitName}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.price)}</td>
                    <td className="px-3 py-2.5">
                      {r.kind === 'txn' ? <StatusBadge txn={{ status: r.status, type: r.type as TxnType, dueDate: r.dueDate }} /> : r.kind === 'adjustment' ? <Badge>Adjusted</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-1 text-right">
                      {r.kind === 'txn' ? (
                        <TxnMenu txn={{ _id: r._id, type: r.type as TxnType, number: r.number, status: r.status, party: r.party, partyName: r.partyName, phone: r.phone, balance: r.balance, total: r.total, date: r.date, dueDate: r.dueDate }} />
                      ) : r.kind === 'adjustment' && can('items.adjust_stock') ? (
                        <Dropdown>
                          <DropdownTrigger asChild>
                            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Adjustment actions">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownTrigger>
                          <DropdownContent>
                            <DropdownItem
                              danger
                              icon={<Trash2 className="h-4 w-4" />}
                              onSelect={async () => {
                                if (await confirm({ title: 'Delete this stock adjustment?', message: 'Stock is recalculated without it.', danger: true, confirmText: 'Delete' })) delAdj.mutate(r._id);
                              }}
                            >
                              Delete adjustment
                            </DropdownItem>
                          </DropdownContent>
                        </Dropdown>
                      ) : r.kind === 'opening' && can('items.edit') ? (
                        <button onClick={() => onEdit(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit opening stock" title="Edit opening stock">
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AdjustModal item={i} open={adjust} onOpenChange={setAdjust} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Products tab                                                        */
/* ------------------------------------------------------------------ */

function ProductsTab({ onAdd, onEdit }: { onAdd: () => void; onEdit: (i: Item) => void }) {
  const { cid, can } = useCompany();
  const { params, set } = useQueryState();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const debounced = useDebounce(search);
  const [mobileDetail, setMobileDetail] = useState(false);
  const q = useQuery({
    queryKey: [cid, 'items', 'list', debounced, filter],
    queryFn: async () =>
      api.get<Item[]>('/items', {
        search: debounced,
        limit: 5000,
        lowStock: filter === 'low' ? 'true' : undefined,
        type: filter === 'service' ? 'service' : filter === 'product' ? 'product' : undefined,
        active: filter === 'all' ? 'all' : undefined,
      }),
  });
  const list = q.data?.data ?? [];
  const summary = q.data?.meta?.summary as { stockValue: number; lowStock: number; products: number } | undefined;
  const selected = params.get('item');

  useEffect(() => {
    if (!selected && list.length) set({ item: list[0]._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, list.length]);

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <p className="text-xs text-slate-500">Stock value</p>
          <p className="font-semibold text-slate-900">{money(summary?.stockValue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <p className="text-xs text-slate-500">Products</p>
          <p className="font-semibold text-slate-900">{summary?.products ?? 0}</p>
        </div>
        <button onClick={() => setFilter(filter === 'low' ? '' : 'low')} className={cn('rounded-xl border px-4 py-2.5 text-left', filter === 'low' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:bg-rose-50/40')}>
          <p className="text-xs text-rose-600">Low stock</p>
          <p className="font-semibold text-rose-700">{summary?.lowStock ?? 0}</p>
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={cn('flex flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)]', mobileDetail && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, HS code" className="flex-1" />
              {can('items.create') && (
                <Button size="icon" className="h-9 w-9" onClick={onAdd} aria-label="Add item" title="Add item">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 text-xs">
              <option value="">All active items</option>
              <option value="product">Products only</option>
              <option value="service">Services only</option>
              <option value="low">Low stock</option>
              <option value="all">Include inactive</option>
            </Select>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <span>Item</span>
            <span>Quantity</span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {q.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, k) => (
                  <Skeleton key={k} className="h-10" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState icon={<Boxes className="h-6 w-6" />} title="No items" description={debounced || filter ? 'Nothing matches the filters.' : 'Add your first product or service.'} />
            ) : (
              list.map((i) => {
                const low = i.type === 'product' && i.minStock > 0 && i.stock <= i.minStock;
                return (
                  <button
                    key={i._id}
                    onClick={() => {
                      set({ item: i._id });
                      setMobileDetail(true);
                    }}
                    className={cn('flex w-full items-center justify-between gap-3 border-l-[3px] px-4 py-2.5 text-left text-sm transition', selected === i._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50', i.isActive === false && 'opacity-60')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{i.name}</span>
                      <span className="block truncate text-xs text-slate-500">{i.code || (i.category && typeof i.category === 'object' ? i.category.name : '') || (i.type === 'service' ? 'Service' : '')}</span>
                    </span>
                    <span className={cn('shrink-0 text-sm font-medium tabular-nums', i.type === 'service' ? 'text-slate-400' : low ? 'text-rose-600' : i.stock < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                      {i.type === 'service' ? '—' : `${qty(i.stock)}`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{plural(list.length, 'item')}</p>
        </Card>
        <div className={cn('min-w-0', !mobileDetail && 'hidden lg:block')}>
          {selected ? (
            <ItemDetailPane key={selected} itemId={selected} onBack={() => setMobileDetail(false)} onEdit={onEdit} onDeleted={() => set({ item: null })} />
          ) : (
            <Card>
              <EmptyState title="Select an item" description="Pick an item on the left to see its stock and history." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Categories tab                                                      */
/* ------------------------------------------------------------------ */

function NameModal({ open, onOpenChange, title, initial, onSave, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: string; onSave: (name: string) => void; loading?: boolean }) {
  const [name, setName] = useState(initial ?? '');
  useResetOn(open, () => open && setName(initial ?? ''));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      footer={
        <Button onClick={() => onSave(name.trim())} disabled={!name.trim()} loading={loading}>
          Save
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function AssignModal({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category: CategoryRow }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const items = useItems(open);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  useResetOn(open, () => {
    if (!open) return;
    setPicked([]);
    setSearch('');
  });
  const rows = (items.data ?? []).filter((i) => (i.category && typeof i.category === 'object' ? i.category._id : i.category) !== category._id && i.name.toLowerCase().includes(search.toLowerCase()));
  const save = useMutation({
    mutationFn: () => api.post(`/items/categories/${category._id}/assign`, { items: picked }),
    onSuccess: () => {
      toast.success(`${picked.length} item${picked.length > 1 ? 's' : ''} moved to ${category.name}`);
      invalidateCompany(qc, cid);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Move items to ${category.name}`}
      footer={
        <Button onClick={() => save.mutate()} disabled={!picked.length} loading={save.isPending}>
          Move {picked.length || ''} item{picked.length === 1 ? '' : 's'}
        </Button>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Search items" className="mb-3" />
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {rows.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No other items</p>}
        {rows.map((i) => (
          <label key={i._id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
            <Checkbox checked={picked.includes(i._id)} onChange={(v) => setPicked((p) => (v ? [...p, i._id] : p.filter((x) => x !== i._id)))} />
            <span className="flex-1 truncate">{i.name}</span>
            <span className="text-xs text-slate-500">{i.category && typeof i.category === 'object' ? i.category.name : 'Uncategorised'}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function CategoriesTab() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { set } = useQueryState();
  const cats = useCategories();
  const [picked, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [nameModal, setNameModal] = useState<{ open: boolean; cat?: CategoryRow | null }>({ open: false });
  const [assign, setAssign] = useState(false);
  const debounced = useDebounce(search);

  const list = useMemo(() => {
    const u = cats.data?.uncategorised;
    return [...(cats.data?.categories ?? []), ...(u ? [{ _id: 'none', name: 'Uncategorised', items: u.items, stockValue: u.stockValue }] : [])];
  }, [cats.data]);
  const selected = picked || (list[0]?._id ?? '');
  const current = list.find((c) => c._id === selected);

  const items = useQuery({
    queryKey: [cid, 'items', 'list', 'category', selected, debounced],
    queryFn: async () => (await api.get<Item[]>('/items', { category: selected, search: debounced, limit: 5000, active: 'all' })).data,
    enabled: !!selected,
  });
  const save = useMutation({
    mutationFn: async (name: string) => (nameModal.cat ? await api.put<CategoryRow>(`/items/categories/${nameModal.cat._id}`, { name }) : await api.post<CategoryRow>('/items/categories', { name })).data,
    onSuccess: (c) => {
      toast.success(nameModal.cat ? 'Category renamed' : `Category "${c.name}" added`);
      qc.invalidateQueries({ queryKey: [cid, 'items'] });
      setSelected(c._id);
      setNameModal({ open: false });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/items/categories/${id}`),
    onSuccess: (res) => {
      if (reportWrite(res, 'Category deleted. Its items are now uncategorised.')) setSelected('');
      invalidateCompany(qc, cid);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="h-fit">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">Categories</p>
          {can('items.create') && (
            <Button size="sm" onClick={() => setNameModal({ open: true, cat: null })}>
              <Plus className="h-4 w-4" /> Add category
            </Button>
          )}
        </div>
        {cats.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, k) => (
              <Skeleton key={k} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((c) => (
              <button key={c._id} onClick={() => setSelected(c._id)} className={cn('flex w-full items-center justify-between gap-2 border-l-[3px] px-4 py-2.5 text-left', selected === c._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
                <span className={cn('truncate text-sm font-medium', c._id === 'none' ? 'text-slate-500 italic' : 'text-slate-800')}>{c.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 text-xs text-slate-600">{c.items}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div>
            <p className="font-semibold text-slate-900">{current?.name ?? 'Category'}</p>
            <p className="text-xs text-slate-500">
              {plural(current?.items ?? 0, 'item')} · stock value {money(current?.stockValue)}
            </p>
          </div>
          <div className="flex-1" />
          <SearchInput value={search} onChange={setSearch} placeholder="Search items" className="w-full sm:w-56" />
          {current && current._id !== 'none' && can('items.edit') && (
            <Button size="sm" variant="outline" onClick={() => setAssign(true)}>
              <FolderInput className="h-4 w-4" /> Move items here
            </Button>
          )}
          {current && current._id !== 'none' && (can('items.edit') || can('items.delete')) && (
            <Dropdown>
              <DropdownTrigger asChild>
                <Button size="icon" variant="outline" aria-label="Category actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                {can('items.edit') && (
                  <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setNameModal({ open: true, cat: current })}>
                    Rename
                  </DropdownItem>
                )}
                {can('items.delete') && (
                  <DropdownItem
                    danger
                    icon={<Trash2 className="h-4 w-4" />}
                    onSelect={async () => {
                      if (await confirm({ title: `Delete category "${current.name}"?`, message: 'Items are kept and become uncategorised.', danger: true, confirmText: 'Delete' })) del.mutate(current._id);
                    }}
                  >
                    Delete category
                  </DropdownItem>
                )}
              </DropdownContent>
            </Dropdown>
          )}
        </div>
        {items.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : !items.data?.length ? (
          <EmptyState title="No items in this category" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Stock value</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sale price</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.data.map((i) => (
                  <tr key={i._id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium">{i.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{i.type === 'service' ? '—' : `${qty(i.stock)} ${unitOf(i)}`}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(i.stockValue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(i.salePrice)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button className="text-xs font-medium text-blue-600 hover:underline" onClick={() => set({ tab: null, item: i._id })}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <NameModal open={nameModal.open} onOpenChange={(o) => setNameModal((m) => ({ ...m, open: o }))} title={nameModal.cat ? 'Rename category' : 'Add category'} initial={nameModal.cat?.name} onSave={(n) => save.mutate(n)} loading={save.isPending} />
      {current && current._id !== 'none' && <AssignModal open={assign} onOpenChange={setAssign} category={current} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Units tab                                                           */
/* ------------------------------------------------------------------ */

function UnitsTab() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const units = useUnits();
  const [picked, setSelected] = useState('');
  const [unitModal, setUnitModal] = useState<{ open: boolean; unit?: Unit | null }>({ open: false });
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [conv, setConv] = useState<{ open: boolean; base: string; rate: number; secondary: string }>({ open: false, base: '', rate: 1, secondary: '' });
  const list = units.data?.units ?? [];
  const selected = picked || (list[0]?._id ?? '');
  const openUnit = (unit: Unit | null) => {
    setName(unit?.name ?? '');
    setShort(unit?.shortName ?? '');
    setUnitModal({ open: true, unit });
  };
  const current = list.find((u) => u._id === selected);
  const conversions = (units.data?.conversions ?? []).filter((c) => c.baseUnit?._id === selected || c.secondaryUnit?._id === selected);
  const refresh = () => qc.invalidateQueries({ queryKey: [cid, 'items'] });

  const saveUnit = useMutation({
    mutationFn: async () => (unitModal.unit ? await api.put<Unit>(`/items/units/${unitModal.unit._id}`, { name, shortName: short }) : await api.post<Unit>('/items/units', { name, shortName: short })).data,
    onSuccess: (u) => {
      toast.success(unitModal.unit ? 'Unit updated' : `Unit ${u.name} added`);
      refresh();
      setSelected(u._id);
      setUnitModal({ open: false });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delUnit = useMutation({
    mutationFn: (id: string) => api.del(`/items/units/${id}`),
    onSuccess: (res) => {
      if (reportWrite(res, 'Unit deleted')) setSelected('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveConv = useMutation({
    mutationFn: () => api.post('/items/unit-conversions', { baseUnit: conv.base, secondaryUnit: conv.secondary, rate: conv.rate }),
    onSuccess: () => {
      toast.success('Conversion saved');
      refresh();
      setConv((c) => ({ ...c, open: false }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delConv = useMutation({
    mutationFn: (id: string) => api.del(`/items/unit-conversions/${id}`),
    onSuccess: (res) => {
      reportWrite(res, 'Conversion removed');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="h-fit">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">Units</p>
          {can('items.create') && (
            <Button size="sm" onClick={() => openUnit(null)}>
              <Plus className="h-4 w-4" /> Add unit
            </Button>
          )}
        </div>
        {units.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, k) => (
              <Skeleton key={k} className="h-9" />
            ))}
          </div>
        ) : (
          <div className="scroll-thin max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {list.map((u) => (
              <button key={u._id} onClick={() => setSelected(u._id)} className={cn('flex w-full items-center justify-between border-l-[3px] px-4 py-2.5 text-left text-sm', selected === u._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
                <span className="font-medium text-slate-800">{u.name}</span>
                <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{u.shortName}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div>
            <p className="font-semibold text-slate-900">{current ? `${current.name} (${current.shortName})` : 'Unit'}</p>
            <p className="text-xs text-slate-500">Conversions let you buy in one unit and sell in another, e.g. 1 BOX = 12 PCS.</p>
          </div>
          <div className="flex-1" />
          {current && can('items.create') && (
            <Button size="sm" onClick={() => setConv({ open: true, base: current._id, rate: 1, secondary: '' })}>
              <Ruler className="h-4 w-4" /> Add conversion
            </Button>
          )}
          {current && (can('items.edit') || can('items.delete')) && (
            <Dropdown>
              <DropdownTrigger asChild>
                <Button size="icon" variant="outline" aria-label="Unit actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                {can('items.edit') && (
                  <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => current && openUnit(current)}>
                    Edit unit
                  </DropdownItem>
                )}
                {can('items.delete') && (
                  <DropdownItem
                    danger
                    icon={<Trash2 className="h-4 w-4" />}
                    onSelect={async () => {
                      if (await confirm({ title: `Delete unit ${current.name}?`, message: 'Units used by items cannot be deleted.', danger: true, confirmText: 'Delete' })) delUnit.mutate(current._id);
                    }}
                  >
                    Delete unit
                  </DropdownItem>
                )}
              </DropdownContent>
            </Dropdown>
          )}
        </div>
        {!conversions.length ? (
          <EmptyState icon={<Ruler className="h-6 w-6" />} title="No conversions" description="Add a conversion to use this unit as a secondary unit on items." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Conversion</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {conversions.map((c) => (
                <tr key={c._id}>
                  <td className="px-5 py-3">
                    1 <b>{c.baseUnit?.name}</b> = {c.rate} <b>{c.secondaryUnit?.name}</b>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {can('items.delete') && (
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Delete conversion"
                        onClick={async () => {
                          if (await confirm({ title: 'Delete this conversion?', danger: true, confirmText: 'Delete' })) delConv.mutate(c._id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal
        open={unitModal.open}
        onOpenChange={(o) => setUnitModal((m) => ({ ...m, open: o }))}
        size="sm"
        title={unitModal.unit ? 'Edit unit' : 'Add unit'}
        footer={
          <Button onClick={() => saveUnit.mutate()} disabled={!name.trim() || !short.trim()} loading={saveUnit.isPending}>
            Save
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dozen" />
          </Field>
          <Field label="Short name" required>
            <Input value={short} onChange={(e) => setShort(e.target.value.toUpperCase())} placeholder="DZN" maxLength={10} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={conv.open}
        onOpenChange={(o) => setConv((c) => ({ ...c, open: o }))}
        size="sm"
        title="Add conversion"
        footer={
          <Button onClick={() => saveConv.mutate()} disabled={!conv.base || !conv.secondary || !(conv.rate > 0) || conv.base === conv.secondary} loading={saveConv.isPending}>
            Save
          </Button>
        }
      >
        <div className="grid grid-cols-[1fr_auto_100px_1fr] items-end gap-2">
          <Field label="Base unit">
            <Select value={conv.base} onChange={(e) => setConv((c) => ({ ...c, base: e.target.value }))}>
              <option value="">Select</option>
              {list.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.shortName}
                </option>
              ))}
            </Select>
          </Field>
          <span className="pb-2 text-sm text-slate-500">1 =</span>
          <Field label="Rate">
            <NumberInput value={conv.rate} min={0} onValueChange={(v) => setConv((c) => ({ ...c, rate: v }))} />
          </Field>
          <Field label="Secondary unit">
            <Select value={conv.secondary} onChange={(e) => setConv((c) => ({ ...c, secondary: e.target.value }))}>
              <option value="">Select</option>
              {list
                .filter((u) => u._id !== conv.base)
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.shortName}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ItemsPage() {
  const { can, href, settings } = useCompany();
  const router = useRouter();
  const { params, set } = useQueryState();
  const [exporting, setExporting] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; item?: Item | null }>({ open: false });
  const tab = (params.get('tab') as 'products' | 'categories' | 'units' | null) ?? 'products';
  const addItem = () => setModal({ open: true, item: null });
  useUrlFlag('new', can('items.create'), addItem);
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await api.download('/items/export', undefined, 'items.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };
  return (
    <div>
      <PageHeader
        title="Items"
        description="Products and services with stock, prices and complete history"
        actions={
          <>
            {can('items.import') && (
              <Link href={href('/items/import')} className={buttonClass({ variant: 'outline' })}>
                <Upload className="h-4 w-4" /> Import items
              </Link>
            )}
            <Button variant="outline" onClick={exportXlsx} loading={exporting}>
              {!exporting && <Download className="h-4 w-4" />} Export Excel
            </Button>
            {(can('items.edit') || settings?.items.enableItemCode !== false) && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="outline">
                    <Wrench className="h-4 w-4" /> More tools
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  {can('items.edit') && (
                    <DropdownItem icon={<SlidersHorizontal className="h-4 w-4" />} onSelect={() => router.push(href('/items/bulk-update'))}>
                      Update items in bulk
                    </DropdownItem>
                  )}
                  {settings?.items.enableItemCode !== false && (
                    <DropdownItem icon={<Barcode className="h-4 w-4" />} onSelect={() => router.push(href('/print/barcodes'))}>
                      Print barcode labels
                    </DropdownItem>
                  )}
                </DropdownContent>
              </Dropdown>
            )}
            {can('items.create') && (
              <Button onClick={addItem}>
                <PackagePlus className="h-4 w-4" /> Add item
              </Button>
            )}
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => set({ tab: v === 'products' ? null : v })}
        tabs={[
          { value: 'products', label: <span className="flex items-center gap-1.5"><Boxes className="h-4 w-4" /> Products</span> },
          ...(settings?.items.enableCategories !== false ? [{ value: 'categories' as const, label: <span className="flex items-center gap-1.5"><Tags className="h-4 w-4" /> Category</span> }] : []),
          ...(settings?.items.enableUnits !== false ? [{ value: 'units' as const, label: <span className="flex items-center gap-1.5"><Ruler className="h-4 w-4" /> Units</span> }] : []),
        ]}
      />
      {tab === 'categories' ? <CategoriesTab /> : tab === 'units' ? <UnitsTab /> : <ProductsTab onAdd={addItem} onEdit={(item) => setModal({ open: true, item })} />}
      <ItemModal
        open={modal.open}
        item={modal.item}
        onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))}
        onSaved={(i) => !modal.item && set({ tab: null, item: i._id })}
      />
    </div>
  );
}
