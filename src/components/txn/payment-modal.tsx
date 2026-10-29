'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Party, Txn } from '@/lib/types';
import { TXN, printHref } from '@/lib/txn';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { cn, fmtDate, isoDate, money, round2, today } from '@/lib/utils';
import { useAccountOptions, useParties } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { FileUpload, type FileRef } from '@/components/ui/file-upload';
import { Spinner } from '@/components/ui/misc';
import { PartyModal } from '@/components/party/party-modal';

export type PaymentType = 'PAYMENT_IN' | 'PAYMENT_OUT';

/** Payment type value for "Cheque": the money reaches an account when the cheque is deposited or withdrawn. */
const CHEQUE = 'cheque';

interface OpenDoc {
  _id: string;
  number: string;
  date: string;
  dueDate?: string;
  total: number;
  outstanding: number;
  status: string;
}

export interface PaymentModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: PaymentType;
  /** Edit an existing payment */
  id?: string | null;
  /** Copy an existing payment into a new one */
  duplicateOf?: string | null;
  initialParty?: string | null;
  /** Pre-link one invoice / bill (Receive payment from an invoice row) */
  initialAllocation?: { transaction: string; amount: number } | null;
  onSaved?: (txn: Txn) => void;
}

export function PaymentModal({ open, onOpenChange, type, id, duplicateOf, initialParty, initialAllocation, onSaved }: PaymentModalProps) {
  const { cid, href, can } = useCompany();
  const qc = useQueryClient();
  const meta = TXN[type];
  const isIn = type === 'PAYMENT_IN';
  const parties = useParties(open);
  const accounts = useAccountOptions();

  const [party, setParty] = useState<string | null>(initialParty ?? null);
  const [typedNumber, setNumber] = useState('');
  const [numberTouched, setNumberTouched] = useState(false);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState<number>(initialAllocation?.amount ?? 0);
  const [pickedAccount, setAccount] = useState('');
  const [ref, setRef] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<FileRef[]>([]);
  const [mode, setMode] = useState<'auto' | 'manual'>(initialAllocation ? 'manual' : 'auto');
  const [alloc, setAlloc] = useState<Record<string, number>>(initialAllocation ? { [initialAllocation.transaction]: initialAllocation.amount } : {});
  const [partyModal, setPartyModal] = useState<{ open: boolean; name?: string }>({ open: false });
  const [error, setError] = useState('');

  const loadId = id ?? duplicateOf ?? null;
  const existing = useQuery({
    queryKey: [cid, 'transactions', 'detail', loadId],
    queryFn: async () => (await api.get<Txn>(`/transactions/${loadId}`)).data,
    enabled: open && !!loadId,
  });
  const nextNo = useQuery({
    queryKey: [cid, 'transactions', 'next-number', type],
    queryFn: async () => (await api.get<{ number: string }>('/transactions/next-number', { type })).data.number,
    enabled: open && !id,
    staleTime: 0,
  });

  // Reset each time the modal opens for another payment
  useResetOn(open ? `${loadId ?? 'new'}|${initialParty ?? ''}|${initialAllocation?.transaction ?? ''}|${initialAllocation?.amount ?? ''}` : null, () => {
    if (!open) return;
    setError('');
    setNumber('');
    setNumberTouched(false);
    setDate(today());
    setAccount('');
    setRef('');
    setDescription('');
    setAttachments([]);
    setParty(initialParty ?? null);
    setAmount(initialAllocation?.amount ?? 0);
    setMode(initialAllocation ? 'manual' : 'auto');
    setAlloc(initialAllocation ? { [initialAllocation.transaction]: initialAllocation.amount } : {});
  });

  // Fill from the loaded payment (edit or duplicate) once it arrives
  const loaded = open ? existing.data : undefined;
  useResetOn(loaded, () => {
    const t = loaded;
    if (!t) return;
    const pid = t.party && typeof t.party === 'object' ? t.party._id : (t.party as string | null);
    setParty(pid ?? null);
    setAmount(t.total);
    setAccount(t.cheque?.status ? CHEQUE : typeof t.paymentAccount === 'object' && t.paymentAccount ? t.paymentAccount._id : ((t.paymentAccount as string) ?? ''));
    setRef(t.paymentRef ?? '');
    setDescription(t.description ?? '');
    if (id) {
      setNumber(t.number);
      setDate(isoDate(t.date));
      setAttachments((t.attachments ?? []).filter((a): a is { _id: string; originalName: string; mime: string; size: number } => typeof a === 'object'));
      setMode('manual');
      setAlloc(Object.fromEntries(t.allocations.map((a) => [a.transaction, a.amount])));
    }
  });

  // A new payment shows the next number until the user types their own.
  const number = id || numberTouched ? typedNumber : (nextNo.data ?? '');
  const account = pickedAccount || ((accounts.data?.find((a) => a.isDefault) ?? accounts.data?.[0])?._id ?? '');
  // A cheque that has cleared keeps its amount and payment type until it is reopened
  const chequeInfo = id ? existing.data?.cheque : null;
  const chequeCleared = chequeInfo?.status === 'CLOSED';
  const cleared = chequeCleared ? { account: chequeInfo.account && typeof chequeInfo.account === 'object' ? chequeInfo.account.name : 'the bank', on: chequeInfo.closedOn } : null;

  const docs = useQuery({
    queryKey: [cid, 'transactions', 'open-documents', party, type, id ?? ''],
    queryFn: async () => (await api.get<OpenDoc[]>('/transactions/open-documents', { party, paymentType: type, exclude: id ?? undefined })).data,
    enabled: open && !!party && can(isIn ? 'sale_invoice.view' : 'purchase_bill.view'),
  });

  const selectedParty = parties.data?.find((p) => p._id === party);
  const partyOptions = useMemo(() => {
    const list = (parties.data ?? []).filter((p) => p.isActive !== false || p._id === party);
    const due = (p: Party) => (isIn ? p.balance : -p.balance);
    return [...list]
      .sort((a, b) => Number(due(b) > 0) - Number(due(a) > 0) || a.name.localeCompare(b.name))
      .map((p) => {
        const d = due(p);
        return {
          value: p._id,
          label: p.name,
          hint: p.phone,
          keywords: p.phone,
          right: d > 0 ? <span className={isIn ? 'text-emerald-600' : 'text-rose-600'}>{money(d)}</span> : <span className="text-slate-400">{money(0)}</span>,
        };
      });
  }, [parties.data, party, isIn]);

  const due = selectedParty ? (isIn ? selectedParty.balance : -selectedParty.balance) : 0;
  const openDocs = docs.data ?? [];
  const openDue = round2(openDocs.reduce((s, d) => s + d.outstanding, 0));
  const linked = round2(Object.values(alloc).reduce((s, v) => s + (v || 0), 0));
  const autoPreview = useMemo(() => {
    if (mode !== 'auto') return {};
    let left = amount;
    const out: Record<string, number> = {};
    for (const d of docs.data ?? []) {
      if (left <= 0) break;
      const a = round2(Math.min(d.outstanding, left));
      out[d._id] = a;
      left = round2(left - a);
    }
    return out;
  }, [mode, amount, docs.data]);
  const effectiveLinked = mode === 'auto' ? round2(Object.values(autoPreview).reduce((s, v) => s + v, 0)) : linked;

  const toggleDoc = (d: OpenDoc, on: boolean) => {
    setAlloc((a) => {
      const next = { ...a };
      if (on) {
        const free = round2(amount - linked);
        next[d._id] = round2(Math.max(0, Math.min(d.outstanding, free > 0 ? free : d.outstanding)));
      } else delete next[d._id];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async (print: boolean) => {
      const body = {
        type,
        number,
        autoNumber: !numberTouched,
        date,
        party,
        amount,
        paymentMode: account === CHEQUE ? 'cheque' : 'account',
        paymentAccount: account && account !== CHEQUE ? account : undefined,
        paymentRef: ref,
        description,
        attachments: attachments.map((a) => a._id),
        allocations: mode === 'manual' ? Object.entries(alloc).filter(([, v]) => v > 0).map(([transaction, v]) => ({ transaction, amount: v })) : [],
        autoAllocate: mode === 'auto',
      };
      const res = id ? await api.put<Txn>(`/transactions/${id}`, body) : await api.post<Txn>('/transactions', body);
      return { res, print };
    },
    onSuccess: ({ res, print }) => {
      invalidateCompany(qc, cid);
      const applied = reportWrite(res, id ? `${meta.label} updated` : `${meta.label} ${res.data.number} saved`);
      if (applied) {
        onSaved?.(res.data);
        if (print) window.open(href(printHref(res.data._id, { autoprint: true })), '_blank');
      }
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (print = false) => {
    if (!party) return setError('Select a party');
    if (!(amount > 0)) return setError('Enter the amount');
    if (mode === 'manual') {
      if (linked > amount + 0.001) return setError(`Linked amount (${money(linked)}) is more than the payment amount`);
      for (const d of docs.data ?? []) if ((alloc[d._id] ?? 0) > d.outstanding + 0.001) return setError(`${d.number}: only ${money(d.outstanding)} is outstanding`);
    }
    setError('');
    save.mutate(print);
  };

  const loading = (!!loadId && existing.isLoading) || parties.isLoading;
  const pending = existing.data?.pendingApprovals?.length ? existing.data.pendingApprovals : null;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <Wallet className={cn('h-5 w-5', isIn ? 'text-emerald-600' : 'text-rose-600')} />
            {id ? `Edit ${meta.label}` : meta.label}
          </span>
        }
        description={isIn ? 'Money received from a customer. It is linked to their unpaid sale invoices.' : 'Money paid to a supplier. It is linked to their unpaid purchase bills.'}
        footer={
          <>
            {error && <p className="mr-auto max-w-md text-sm text-rose-600">{error}</p>}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => submit(true)} loading={save.isPending && save.variables === true}>
              Save & Print
            </Button>
            <Button onClick={() => submit(false)} loading={save.isPending && save.variables === false}>
              Save
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            className="space-y-5"
          >
            {pending && (
              <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Waiting for approval: {pending.map((p) => p.label).join(', ')}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Party" required className="sm:col-span-2">
                <Combobox
                  value={party}
                  onChange={(v) => {
                    setParty(v);
                    setAlloc({});
                    if (!id) setMode('auto');
                  }}
                  options={partyOptions}
                  placeholder="Search party by name or phone"
                  onCreate={can('parties.create') ? (name) => setPartyModal({ open: true, name }) : undefined}
                  createLabel="Add new party"
                />
                {selectedParty && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {docs.isLoading ? (
                      <span className="text-slate-400">Checking dues…</span>
                    ) : openDue > 0 ? (
                      <span className={isIn ? 'text-emerald-700' : 'text-rose-700'}>
                        Unpaid {isIn ? 'sale invoices' : 'purchase bills'}: <b>{money(openDue)}</b> ({openDocs.length})
                      </span>
                    ) : due > 0 ? (
                      <span className={isIn ? 'text-emerald-700' : 'text-rose-700'}>
                        {isIn ? 'Receivable' : 'Payable'} (opening balance): <b>{money(due)}</b>
                      </span>
                    ) : (
                      <span className="text-slate-500">Nothing due. The amount is kept as an advance.</span>
                    )}
                    {openDue > 0 && Math.abs(due - openDue) > 0.005 && (
                      <span className="text-slate-500">
                        Net party balance: {money(Math.abs(selectedParty.balance))} {selectedParty.balance >= 0 ? 'to receive' : 'to pay'}
                      </span>
                    )}
                  </p>
                )}
              </Field>
              <Field label={isIn ? 'Receipt no.' : 'Voucher no.'}>
                <Input
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    setNumberTouched(true);
                  }}
                />
              </Field>
              <Field label="Date" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Payment type">
                <Select value={account} onChange={(e) => setAccount(e.target.value)} disabled={chequeCleared}>
                  {(accounts.data ?? []).map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                      {a.kind !== 'cash' ? ` (${a.kind})` : ''}
                    </option>
                  ))}
                  <option value={CHEQUE}>Cheque</option>
                </Select>
              </Field>
              {account === CHEQUE ? (
                <Field label="Cheque no." hint={chequeCleared ? undefined : `Counts against the party now; reaches the bank when you ${isIn ? 'deposit' : 'withdraw'} it in Cash & Bank ▸ Cheques`}>
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 004512" />
                </Field>
              ) : (
                <Field label="Reference no." hint="UTR / transaction id">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} />
                </Field>
              )}
            </div>
            {chequeCleared && cleared && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                This cheque was {isIn ? 'deposited into' : 'withdrawn from'} {cleared.account} {cleared.on ? `on ${fmtDate(cleared.on)}` : ''}. Its amount and payment type stay as they are until you reopen it in
                Cash &amp; Bank ▸ Cheques.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={isIn ? 'Received amount' : 'Paid amount'} required>
                <div className="flex gap-2">
                  <NumberInput value={amount} min={0} onValueChange={setAmount} disabled={chequeCleared} className="h-11 text-lg font-semibold" />
                </div>
                {due > 0 && amount !== due && (
                  <button type="button" onClick={() => setAmount(round2(due))} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
                    Use full balance {money(due)}
                  </button>
                )}
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional note printed on the receipt" />
              </Field>
            </div>

            <Field label="Attach photo / document">
              <FileUpload value={attachments} onChange={setAttachments} context="payment" label="Add image or PDF" max={5} />
            </Field>

            {party && (
              <div className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Link2 className="h-4 w-4 text-blue-600" /> Link to {isIn ? 'sale invoices' : 'purchase bills'}
                  </p>
                  <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
                    {(['auto', 'manual'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          if (m === 'manual' && !Object.keys(alloc).length) setAlloc(autoPreview);
                        }}
                        className={cn('px-3 py-1.5', mode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                      >
                        {m === 'auto' ? 'Auto (oldest first)' : 'Choose manually'}
                      </button>
                    ))}
                  </div>
                </div>
                {docs.isLoading ? (
                  <div className="flex h-20 items-center justify-center">
                    <Spinner />
                  </div>
                ) : !docs.data?.length ? (
                  <p className="px-4 py-5 text-center text-sm text-slate-500">No unpaid {isIn ? 'invoices' : 'bills'} for this party. The whole amount is saved as an advance.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="w-10 px-4 py-2" />
                          <th className="px-2 py-2 font-medium">Number</th>
                          <th className="px-2 py-2 font-medium">Date</th>
                          <th className="px-2 py-2 text-right font-medium">Total</th>
                          <th className="px-2 py-2 text-right font-medium">Outstanding</th>
                          <th className="px-4 py-2 text-right font-medium">Linked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {docs.data.map((d) => {
                          const on = mode === 'auto' ? (autoPreview[d._id] ?? 0) > 0 : d._id in alloc;
                          const val = mode === 'auto' ? (autoPreview[d._id] ?? 0) : (alloc[d._id] ?? 0);
                          return (
                            <tr key={d._id} className={on ? 'bg-blue-50/40' : ''}>
                              <td className="px-4 py-2">
                                <Checkbox checked={on} disabled={mode === 'auto'} onChange={(v) => toggleDoc(d, v)} />
                              </td>
                              <td className="px-2 py-2 font-medium">{d.number}</td>
                              <td className="px-2 py-2 text-slate-600">
                                {fmtDate(d.date)}
                                {d.dueDate && new Date(d.dueDate) < new Date() && <span className="ml-1 text-xs text-rose-600">overdue</span>}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">{money(d.total)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{money(d.outstanding)}</td>
                              <td className="w-36 px-4 py-1.5 text-right">
                                {mode === 'manual' && on ? (
                                  <NumberInput value={val} min={0} onValueChange={(v) => setAlloc((a) => ({ ...a, [d._id]: v }))} className="h-8" />
                                ) : (
                                  <span className="tabular-nums">{val ? money(val) : '—'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-600">
                  <span>
                    Linked: <b className="tabular-nums">{money(effectiveLinked)}</b>
                  </span>
                  <span>
                    Unlinked (advance): <b className="tabular-nums">{money(Math.max(0, round2(amount - effectiveLinked)))}</b>
                  </span>
                </div>
              </div>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
      <PartyModal
        open={partyModal.open}
        initialName={partyModal.name}
        defaultType={isIn ? 'customer' : 'supplier'}
        onOpenChange={(o) => setPartyModal((p) => ({ ...p, open: o }))}
        onSaved={(p) => {
          qc.invalidateQueries({ queryKey: [cid, 'parties'] });
          setParty(p._id);
        }}
      />
    </>
  );
}
