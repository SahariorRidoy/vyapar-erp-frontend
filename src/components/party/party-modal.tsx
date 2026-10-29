'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { Party } from '@/lib/types';
import { BD_DIVISIONS, BIN_RE, VAT_TYPES } from '@/lib/constants';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { isoDate, today } from '@/lib/utils';
import { usePartyGroups } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { useCompany } from '@/providers/company';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, NumberInput, Select, Switch, Textarea } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Tabs } from '@/components/ui/misc';

interface PartyForm {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  gstType: string;
  state: string;
  billingAddress: string;
  shippingAddress: string;
  sameShipping: boolean;
  group: string | null;
  partyType: 'customer' | 'supplier' | 'both';
  openingBalance: number;
  openingType: 'receive' | 'pay';
  openingBalanceDate: string;
  creditLimit: number | '';
  notes: string;
  isActive: boolean;
}

const blank = (name = '', type: PartyForm['partyType'] = 'both'): PartyForm => ({
  name, phone: '', email: '', gstin: '', gstType: 'unregistered', state: '', billingAddress: '', shippingAddress: '', sameShipping: true,
  group: null, partyType: type, openingBalance: 0, openingType: type === 'supplier' ? 'pay' : 'receive', openingBalanceDate: today(), creditLimit: '', notes: '', isActive: true,
});

function fromParty(p: Party): PartyForm {
  const g = p.group && typeof p.group === 'object' ? p.group._id : (p.group as string | null | undefined);
  return {
    name: p.name, phone: p.phone ?? '', email: p.email ?? '', gstin: p.gstin ?? '', gstType: p.gstType ?? 'unregistered', state: p.state ?? '',
    billingAddress: p.billingAddress ?? '', shippingAddress: p.shippingAddress ?? '', sameShipping: !p.shippingAddress || p.shippingAddress === p.billingAddress,
    group: g ?? null, partyType: p.partyType ?? 'both', openingBalance: Math.abs(p.openingBalance ?? 0), openingType: (p.openingBalance ?? 0) < 0 ? 'pay' : 'receive',
    openingBalanceDate: isoDate(p.openingBalanceDate) || today(), creditLimit: p.creditLimit ?? '', notes: p.notes ?? '', isActive: p.isActive !== false,
  };
}

export function PartyModal({
  open, onOpenChange, party, initialName, defaultType, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  party?: Party | null;
  initialName?: string;
  defaultType?: PartyForm['partyType'];
  onSaved?: (p: Party) => void;
}) {
  const { cid, settings, can } = useCompany();
  const qc = useQueryClient();
  const groups = usePartyGroups(open);
  const [tab, setTab] = useState<'address' | 'credit' | 'more'>('address');
  const initial = () => (party ? fromParty(party) : blank(initialName ?? '', defaultType));
  const [f, setF] = useState<PartyForm>(initial);
  const [error, setError] = useState('');
  const ps = settings?.parties;
  useResetOn(open ? (party?._id ?? `new:${defaultType ?? ''}:${initialName ?? ''}`) : null, () => {
    if (!open) return;
    setTab('address');
    setError('');
    setF(initial());
  });

  const set = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const createGroup = useMutation({
    mutationFn: async (name: string) => (await api.post<{ _id: string; name: string }>('/parties/groups', { name })).data,
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: [cid, 'parties', 'groups'] });
      set('group', g._id);
      toast.success(`Group "${g.name}" created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: async (andNew: boolean) => {
      const body = {
        name: f.name.trim(), phone: f.phone, email: f.email, gstin: f.gstin.trim(), gstType: f.gstType, state: f.state,
        billingAddress: f.billingAddress, shippingAddress: f.sameShipping ? f.billingAddress : f.shippingAddress,
        group: f.group, partyType: f.partyType, openingBalance: f.openingBalance, openingType: f.openingType, openingBalanceDate: f.openingBalanceDate,
        creditLimit: f.creditLimit === '' ? null : f.creditLimit, notes: f.notes, isActive: f.isActive,
      };
      const res = party ? await api.put<Party>(`/parties/${party._id}`, body) : await api.post<Party>('/parties', body);
      return { res, saved: res.data, andNew };
    },
    onSuccess: ({ res, saved, andNew }) => {
      invalidateCompany(qc, cid);
      if (!reportWrite(res, party ? 'Party updated' : `${saved.name} added`)) return onOpenChange(false);
      onSaved?.(saved);
      if (andNew) {
        setF(blank('', defaultType));
        setTab('address');
      } else onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (andNew = false) => {
    if (!f.name.trim()) return setError('Party name is required');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address');
    if (f.gstin && !BIN_RE.test(f.gstin.trim())) return setError('BIN must be 9 digits, optionally with a branch suffix (000123456-0101)');
    setError('');
    save.mutate(andNew);
  };

  const groupOptions = (groups.data?.groups ?? []).map((g) => ({ value: g._id, label: g.name, right: `${g.parties}` }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={party ? `Edit party · ${party.name}` : 'Add party'}
      footer={
        <>
          {error && <p className="mr-auto text-sm text-rose-600">{error}</p>}
          {!party && (
            <Button variant="outline" onClick={() => submit(true)} loading={save.isPending && save.variables}>
              Save & New
            </Button>
          )}
          <Button onClick={() => submit(false)} loading={save.isPending && !save.variables}>
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Party name" required className="sm:col-span-1">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Customer or supplier name" />
          </Field>
          <Field label="Phone number">
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Party type">
            <Select value={f.partyType} onChange={(e) => set('partyType', e.target.value as PartyForm['partyType'])}>
              <option value="both">Customer & supplier</option>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
            </Select>
          </Field>
          {ps?.enableGstin !== false && (
            <Field label="BIN">
              <Input value={f.gstin} onChange={(e) => set('gstin', e.target.value.replace(/[^\d-]/g, ''))} maxLength={14} inputMode="numeric" placeholder="000123456-0101" />
            </Field>
          )}
          {ps?.enableGroups !== false && (
            <Field label="Party group">
              <Combobox
                value={f.group}
                onChange={(v) => set('group', v)}
                options={groupOptions}
                placeholder="No group"
                clearable
                onCreate={can('parties.create') ? (name) => (name ? createGroup.mutate(name) : toast.info('Type a group name in the search box first')) : undefined}
                createLabel="Create group"
              />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>

        <Tabs
          className="mt-5"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'address', label: 'VAT & Address' },
            { value: 'credit', label: 'Credit & Balance' },
            { value: 'more', label: 'Additional' },
          ]}
        />
        <div className="pt-4">
          {tab === 'address' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="VAT type">
                <Select value={f.gstType} onChange={(e) => set('gstType', e.target.value)}>
                  {VAT_TYPES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Division">
                <Select value={f.state} onChange={(e) => set('state', e.target.value)}>
                  <option value="">Select division</option>
                  {BD_DIVISIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Billing address">
                <Textarea value={f.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} rows={3} />
              </Field>
              {ps?.enableShippingAddress !== false && (
                <Field label={<span className="flex items-center justify-between gap-2">Shipping address <Checkbox checked={f.sameShipping} onChange={(v) => set('sameShipping', v)} label={<span className="text-xs">Same as billing</span>} /></span>}>
                  <Textarea value={f.sameShipping ? f.billingAddress : f.shippingAddress} disabled={f.sameShipping} onChange={(e) => set('shippingAddress', e.target.value)} rows={3} />
                </Field>
              )}
            </div>
          )}
          {tab === 'credit' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Opening balance" hint="Amount pending from before you started using the app">
                <NumberInput value={f.openingBalance} min={0} onValueChange={(v) => set('openingBalance', v)} />
              </Field>
              <Field label="Balance type">
                <div className="flex h-9 overflow-hidden rounded-lg border border-slate-300 text-sm">
                  {(['receive', 'pay'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('openingType', t)}
                      className={`flex-1 ${f.openingType === t ? (t === 'receive' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {t === 'receive' ? 'To receive' : 'To pay'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="As of date">
                <Input type="date" value={f.openingBalanceDate} onChange={(e) => set('openingBalanceDate', e.target.value)} />
              </Field>
              {ps?.enableCreditLimit !== false && (
                <Field label="Credit limit" hint="Leave empty for no limit">
                  <NumberInput value={f.creditLimit} min={0} onValueChange={(v) => set('creditLimit', v)} placeholder="No limit" />
                </Field>
              )}
            </div>
          )}
          {tab === 'more' && (
            <div className="space-y-4">
              <Field label="Notes">
                <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Anything your team should know about this party" />
              </Field>
              <Switch checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} label="Active" description="Inactive parties are hidden from pickers but keep their history." />
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
