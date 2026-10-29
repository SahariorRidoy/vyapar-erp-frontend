'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Item, Unit } from '@/lib/types';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { cn, isoDate, today } from '@/lib/utils';
import { useCategories, useUnits } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { useCompany } from '@/providers/company';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Select, Switch, Textarea } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { FileUpload, type FileRef } from '@/components/ui/file-upload';
import { Tabs } from '@/components/ui/misc';

interface ItemForm {
  type: 'product' | 'service';
  name: string;
  code: string;
  hsn: string;
  category: string | null;
  baseUnit: string;
  secondaryUnit: string;
  conversionRate: number;
  salePrice: number;
  saleTaxInclusive: boolean;
  wholesalePrice: number;
  minWholesaleQty: number;
  purchasePrice: number;
  purchaseTaxInclusive: boolean;
  mrp: number | '';
  taxRate: number;
  openingQty: number;
  openingPrice: number;
  openingDate: string;
  minStock: number;
  location: string;
  description: string;
  images: FileRef[];
  isActive: boolean;
}

const blank = (name = '', taxRate = 0): ItemForm => ({
  type: 'product', name, code: '', hsn: '', category: null, baseUnit: '', secondaryUnit: '', conversionRate: 1, salePrice: 0, saleTaxInclusive: false,
  wholesalePrice: 0, minWholesaleQty: 0, purchasePrice: 0, purchaseTaxInclusive: false, mrp: '', taxRate, openingQty: 0, openingPrice: 0, openingDate: today(),
  minStock: 0, location: '', description: '', images: [], isActive: true,
});

const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { _id: string })._id : ((v as string) ?? ''));

function fromItem(i: Item): ItemForm {
  return {
    type: i.type, name: i.name, code: i.code ?? '', hsn: i.hsn ?? '', category: idOf(i.category) || null, baseUnit: idOf(i.baseUnit), secondaryUnit: idOf(i.secondaryUnit),
    conversionRate: i.conversionRate || 1, salePrice: i.salePrice, saleTaxInclusive: !!i.saleTaxInclusive, wholesalePrice: i.wholesalePrice, minWholesaleQty: i.minWholesaleQty,
    purchasePrice: i.purchasePrice, purchaseTaxInclusive: !!i.purchaseTaxInclusive, mrp: i.mrp ?? '', taxRate: i.taxRate, openingQty: i.openingQty, openingPrice: i.openingPrice,
    openingDate: isoDate(i.openingDate) || today(), minStock: i.minStock, location: i.location ?? '', description: i.description ?? '',
    images: (i.images ?? []).filter((x): x is { _id: string } => typeof x === 'object').map((x) => ({ _id: x._id, originalName: (x as FileRef).originalName ?? 'Image', mime: (x as FileRef).mime ?? 'image/*' })),
    isActive: i.isActive !== false,
  };
}

function UnitQuickAdd({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: (u: Unit) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  useResetOn(open, () => {
    if (!open) return;
    setName('');
    setShort('');
  });
  const save = useMutation({
    mutationFn: async () => (await api.post<Unit>('/items/units', { name, shortName: short || name.slice(0, 6) })).data,
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: [cid, 'items', 'units'] });
      toast.success(`Unit ${u.name} added`);
      onSaved(u);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Add unit"
      footer={
        <Button onClick={() => save.mutate()} disabled={!name.trim()} loading={save.isPending}>
          Save unit
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Box" />
        </Field>
        <Field label="Short name" required>
          <Input value={short} onChange={(e) => setShort(e.target.value.toUpperCase())} placeholder="BOX" maxLength={10} />
        </Field>
      </div>
    </Modal>
  );
}

export function ItemModal({ open, onOpenChange, item, initialName, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Item | null; initialName?: string; onSaved?: (i: Item) => void }) {
  const { cid, settings, can } = useCompany();
  const qc = useQueryClient();
  const cats = useCategories(open);
  const units = useUnits(open);
  const is = settings?.items;
  const taxes = settings?.taxes;
  const initial = () => (item ? fromItem(item) : blank(initialName ?? '', is?.defaultTaxRate ?? 0));
  const [f, setF] = useState<ItemForm>(initial);
  const [tab, setTab] = useState<'pricing' | 'stock' | 'more'>('pricing');
  const [error, setError] = useState('');
  const [unitModal, setUnitModal] = useState<null | 'baseUnit' | 'secondaryUnit'>(null);
  useResetOn(open ? (item?._id ?? `new:${initialName ?? ''}`) : null, () => {
    if (!open) return;
    setError('');
    setTab('pricing');
    setF(initial());
  });

  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((x) => ({ ...x, [k]: v }));
  // Picking a unit pair fills in the conversion rate saved for that pair (Units tab).
  const setUnit = (k: 'baseUnit' | 'secondaryUnit', v: string) =>
    setF((x) => {
      const next = { ...x, [k]: v };
      const saved = units.data?.conversions.find((c) => c.baseUnit?._id === next.baseUnit && c.secondaryUnit?._id === next.secondaryUnit);
      return saved ? { ...next, conversionRate: saved.rate } : next;
    });

  const genCode = useMutation({
    mutationFn: async () => (await api.get<{ code: string }>('/items/next-code')).data.code,
    onSuccess: (code) => set('code', code),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const createCat = useMutation({
    mutationFn: async (name: string) => (await api.post<{ _id: string; name: string }>('/items/categories', { name })).data,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: [cid, 'items', 'categories'] });
      set('category', c._id);
      toast.success(`Category "${c.name}" created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: async (andNew: boolean) => {
      const body = {
        ...f,
        name: f.name.trim(),
        category: f.category || null,
        baseUnit: f.baseUnit || null,
        secondaryUnit: f.secondaryUnit || null,
        conversionRate: f.secondaryUnit ? f.conversionRate || 1 : 1,
        mrp: f.mrp === '' ? null : f.mrp,
        images: f.images.map((i) => i._id),
        ...(f.type === 'service' ? { openingQty: 0, openingPrice: 0, minStock: 0 } : {}),
      };
      const res = item ? await api.put<Item>(`/items/${item._id}`, body) : await api.post<Item>('/items', body);
      return { res, saved: res.data, andNew };
    },
    onSuccess: ({ res, saved, andNew }) => {
      invalidateCompany(qc, cid);
      if (!reportWrite(res, item ? 'Item updated' : `${saved.name} added`)) return onOpenChange(false);
      onSaved?.(saved);
      if (andNew) {
        setF(blank('', is?.defaultTaxRate ?? 0));
        setTab('pricing');
      } else onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (andNew = false) => {
    if (!f.name.trim()) return setError('Item name is required');
    if (f.secondaryUnit && f.secondaryUnit === f.baseUnit) return setError('Secondary unit must be different from the base unit');
    if (f.secondaryUnit && !(f.conversionRate > 0)) return setError('Enter the conversion rate');
    setError('');
    save.mutate(andNew);
  };

  const unitOptions = units.data?.units ?? [];
  const unitName = (id: string) => unitOptions.find((u) => u._id === id)?.shortName ?? '';
  const catOptions = (cats.data?.categories ?? []).map((c) => ({ value: c._id, label: c.name, right: String(c.items) }));

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        title={item ? `Edit item · ${item.name}` : 'Add item'}
        footer={
          <>
            {error && <p className="mr-auto text-sm text-rose-600">{error}</p>}
            {!item && (
              <Button variant="outline" onClick={() => submit(true)} loading={save.isPending && save.variables === true}>
                Save & New
              </Button>
            )}
            <Button onClick={() => submit(false)} loading={save.isPending && save.variables === false}>
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              {(['product', 'service'] as const).map((t) => (
                <button key={t} type="button" onClick={() => set('type', t)} className={cn('px-4 py-1.5 capitalize', f.type === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                  {t}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">{f.type === 'service' ? 'Services have no stock.' : 'Products track stock quantity and value.'}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Item name" required className="md:col-span-2">
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Basmati Rice 5kg" />
            </Field>
            {is?.enableCategories !== false && (
              <Field label="Category">
                <Combobox
                  value={f.category}
                  onChange={(v) => set('category', v)}
                  options={catOptions}
                  placeholder="Select category"
                  clearable
                  onCreate={can('items.create') ? (name) => (name ? createCat.mutate(name) : toast.info('Type the new category name in the search box')) : undefined}
                  createLabel="Create category"
                />
              </Field>
            )}
            {is?.enableItemCode !== false && (
              <Field label="Item code">
                <div className="flex gap-1.5">
                  <Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="Auto if empty" />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => genCode.mutate()} loading={genCode.isPending} title="Assign code">
                    {!genCode.isPending && <Wand2 className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>
            )}
            {is?.enableHsn !== false && (
              <Field label={f.type === 'service' ? 'Service code' : 'HS code'}>
                <Input value={f.hsn} onChange={(e) => set('hsn', e.target.value)} />
              </Field>
            )}
            {is?.enableUnits !== false && (
              <>
                <Field label={<span className="flex justify-between">Base unit <button type="button" className="text-blue-600 hover:underline" onClick={() => setUnitModal('baseUnit')}>+ New</button></span>}>
                  <Select value={f.baseUnit} onChange={(e) => setUnit('baseUnit', e.target.value)}>
                    <option value="">None</option>
                    {unitOptions.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.shortName})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={<span className="flex justify-between">Secondary unit <button type="button" className="text-blue-600 hover:underline" onClick={() => setUnitModal('secondaryUnit')}>+ New</button></span>}>
                  <Select value={f.secondaryUnit} onChange={(e) => setUnit('secondaryUnit', e.target.value)} disabled={!f.baseUnit}>
                    <option value="">None</option>
                    {unitOptions
                      .filter((u) => u._id !== f.baseUnit)
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name} ({u.shortName})
                        </option>
                      ))}
                  </Select>
                </Field>
                {f.secondaryUnit ? (
                  <Field label="Conversion" hint="Used when you bill in the secondary unit">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="whitespace-nowrap">1 {unitName(f.baseUnit)} =</span>
                      <NumberInput value={f.conversionRate} min={0} onValueChange={(v) => set('conversionRate', v)} className="w-24" />
                      <span>{unitName(f.secondaryUnit)}</span>
                    </div>
                  </Field>
                ) : (
                  <div className="hidden md:block" />
                )}
              </>
            )}
          </div>

          <Tabs
            className="mt-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'pricing', label: 'Pricing' },
              ...(f.type === 'product' && is?.enableStock !== false ? [{ value: 'stock' as const, label: 'Stock' }] : []),
              { value: 'more', label: 'Other details' },
            ]}
          />
          <div className="pt-4">
            {tab === 'pricing' && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Sale price">
                    <NumberInput value={f.salePrice} min={0} onValueChange={(v) => set('salePrice', v)} />
                  </Field>
                  <Field label="Sale price is">
                    <Select value={f.saleTaxInclusive ? 'with' : 'without'} onChange={(e) => set('saleTaxInclusive', e.target.value === 'with')}>
                      <option value="without">Without tax</option>
                      <option value="with">With tax</option>
                    </Select>
                  </Field>
                  {is?.enableWholesalePrice !== false && (
                    <>
                      <Field label="Wholesale price">
                        <NumberInput value={f.wholesalePrice} min={0} onValueChange={(v) => set('wholesalePrice', v)} />
                      </Field>
                      <Field label="Min. wholesale qty" hint="Wholesale price applies from this quantity">
                        <NumberInput value={f.minWholesaleQty} min={0} onValueChange={(v) => set('minWholesaleQty', v)} />
                      </Field>
                    </>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Purchase price">
                    <NumberInput value={f.purchasePrice} min={0} onValueChange={(v) => set('purchasePrice', v)} />
                  </Field>
                  <Field label="Purchase price is">
                    <Select value={f.purchaseTaxInclusive ? 'with' : 'without'} onChange={(e) => set('purchaseTaxInclusive', e.target.value === 'with')}>
                      <option value="without">Without tax</option>
                      <option value="with">With tax</option>
                    </Select>
                  </Field>
                  {taxes?.enableGst !== false && (
                    <Field label="Tax rate">
                      <Select value={String(f.taxRate)} onChange={(e) => set('taxRate', Number(e.target.value))}>
                        {[...new Map((taxes?.rates ?? [{ name: 'None', rate: 0 }]).map((r) => [r.rate, r])).values()].map((r) => (
                          <option key={r.rate} value={r.rate}>
                            {r.name} ({r.rate}%)
                          </option>
                        ))}
                        {!(taxes?.rates ?? []).some((r) => r.rate === f.taxRate) && <option value={f.taxRate}>{f.taxRate}%</option>}
                      </Select>
                    </Field>
                  )}
                  {is?.enableMrp && (
                    <Field label="MRP">
                      <NumberInput value={f.mrp} min={0} onValueChange={(v) => set('mrp', v)} />
                    </Field>
                  )}
                </div>
              </div>
            )}
            {tab === 'stock' && (
              <div className="grid gap-4 md:grid-cols-4">
                <Field label={`Opening quantity${unitName(f.baseUnit) ? ` (${unitName(f.baseUnit)})` : ''}`}>
                  <NumberInput value={f.openingQty} onValueChange={(v) => set('openingQty', v)} />
                </Field>
                <Field label="At price (per unit)">
                  <NumberInput value={f.openingPrice} min={0} onValueChange={(v) => set('openingPrice', v)} />
                </Field>
                <Field label="As of date">
                  <Input type="date" value={f.openingDate} onChange={(e) => set('openingDate', e.target.value)} />
                </Field>
                <Field label="Minimum stock" hint="Shows a low stock alert at or below this">
                  <NumberInput value={f.minStock} min={0} onValueChange={(v) => set('minStock', v)} />
                </Field>
                <Field label="Location" className="md:col-span-2">
                  <Input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Rack / shelf / godown" />
                </Field>
              </div>
            )}
            {tab === 'more' && (
              <div className="space-y-4">
                <Field label="Description">
                  <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} />
                </Field>
                <Field label="Images">
                  <FileUpload value={f.images} onChange={(v) => set('images', v)} accept="image/*" context="item" label="Add image" max={5} />
                </Field>
                <Switch checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} label="Active" description="Inactive items are hidden from invoice item pickers." />
              </div>
            )}
          </div>
          <button type="submit" hidden />
        </form>
      </Modal>
      <UnitQuickAdd open={!!unitModal} onOpenChange={(o) => !o && setUnitModal(null)} onSaved={(u) => unitModal && setUnit(unitModal, u._id)} />
    </>
  );
}
