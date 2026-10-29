'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { LoanAccount, LoanEntryKind, LoanStatementRow } from '@/lib/types';
import { invalidateCompany } from '@/lib/query';
import { fmtDate, isoDate, money, round2, today } from '@/lib/utils';
import { useAccountOptions } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { useCompany } from '@/providers/company';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';

/** Cheques, EMIs and loans usually go through a bank, so the first bank account is the default everywhere. */
function useDefaultAccount() {
  const accounts = useAccountOptions();
  const list = accounts.data ?? [];
  return { list, fallback: (list.find((a) => a.kind === 'bank') ?? list[0])?._id ?? '' };
}

interface LoanForm {
  name: string;
  lender: string;
  accountNumber: string;
  description: string;
  interestRate: number;
  termMonths: number;
  openingBalance: number;
  openingDate: string;
  /** null until picked (follows the default account); '' = the money did not come into any account */
  receivedIn: string | null;
  processingFee: number;
  feePaidFrom: string | null;
}

const formOf = (l?: LoanAccount | null): LoanForm =>
  l
    ? {
        name: l.name, lender: l.lender ?? '', accountNumber: l.accountNumber ?? '', description: l.description ?? '', interestRate: l.interestRate ?? 0, termMonths: l.termMonths ?? 0,
        openingBalance: l.openingBalance, openingDate: isoDate(l.openingDate) || today(), receivedIn: l.receivedIn?._id ?? '', processingFee: l.processingFee ?? 0, feePaidFrom: l.feePaidFrom?._id ?? null,
      }
    : { name: '', lender: '', accountNumber: '', description: '', interestRate: 0, termMonths: 0, openingBalance: 0, openingDate: today(), receivedIn: null, processingFee: 0, feePaidFrom: null };

/** Add a loan, or edit its details, amount, start date and processing fee. */
export function LoanModal({ open, onOpenChange, loan, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; loan?: LoanAccount | null; onSaved?: (id: string) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const { list, fallback } = useDefaultAccount();
  const [f, setF] = useState(() => formOf(loan));
  const set = <K extends keyof LoanForm>(k: K, v: LoanForm[K]) => setF((x) => ({ ...x, [k]: v }));
  useResetOn(open ? (loan?._id ?? 'new') : null, () => open && setF(formOf(loan)));

  const receivedIn = f.receivedIn ?? fallback;
  const feePaidFrom = f.feePaidFrom ?? (receivedIn || fallback);
  const valid = !!f.name.trim() && f.openingBalance > 0 && !!f.openingDate && (!f.processingFee || !!feePaidFrom);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: f.name.trim(), lender: f.lender.trim(), accountNumber: f.accountNumber.trim(), description: f.description.trim(), interestRate: f.interestRate, termMonths: Math.round(f.termMonths),
        openingBalance: f.openingBalance, openingDate: f.openingDate, receivedIn: receivedIn || null, processingFee: f.processingFee, feePaidFrom: f.processingFee > 0 ? feePaidFrom : null,
      };
      return (loan ? await api.put<{ _id: string }>(`/finance/loans/${loan._id}`, body) : await api.post<{ _id: string }>('/finance/loans', body)).data;
    },
    onSuccess: (saved) => {
      invalidateCompany(qc, cid);
      toast.success(loan ? 'Loan updated' : `Loan "${f.name.trim()}" added`);
      onSaved?.(saved._id);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={loan ? `Edit ${loan.name}` : 'Add loan account'}
      description="Interest and charges count as business expenses; what is still owed shows as a liability in the balance sheet."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label="Loan name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. DBBL SME Loan" autoFocus={!loan} />
        </Field>
        <Field label="Lender">
          <Input value={f.lender} onChange={(e) => set('lender', e.target.value)} placeholder="Bank, NBFC or person" />
        </Field>
        <Field label="Loan account number">
          <Input value={f.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} />
        </Field>
        <Field label="Loan amount" required hint="What you borrowed, or what is still owed if the loan began before you started using this app">
          <NumberInput value={f.openingBalance || ''} min={0} onValueChange={(v) => set('openingBalance', v)} className="font-semibold" />
        </Field>
        <Field label="Loan date" required hint="When the loan was taken, or the date of the amount above">
          <Input type="date" value={f.openingDate} onChange={(e) => set('openingDate', e.target.value)} />
        </Field>
        <Field label="Loan received in" className="sm:col-span-2" hint={receivedIn ? 'The loan amount is added to this account on the loan date' : 'No account changes: use this for a loan you already had before'}>
          <Select value={receivedIn} onChange={(e) => set('receivedIn', e.target.value)}>
            {list.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
            <option value="">Not received in an account (opening balance only)</option>
          </Select>
        </Field>
        <Field label="Interest rate (% a year)">
          <NumberInput value={f.interestRate || ''} min={0} max={100} onValueChange={(v) => set('interestRate', v)} />
        </Field>
        <Field label="Term (months)" hint="Used to suggest the EMI split">
          <NumberInput value={f.termMonths || ''} min={0} step={1} onValueChange={(v) => set('termMonths', v)} />
        </Field>
        <Field label="Processing fee">
          <NumberInput value={f.processingFee || ''} min={0} onValueChange={(v) => set('processingFee', v)} />
        </Field>
        {f.processingFee > 0 && (
          <Field label="Fee paid from" required>
            <Select value={feePaidFrom} onChange={(e) => set('feePaidFrom', e.target.value)}>
              {list.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="e.g. Working capital for the new outlet" />
        </Field>
      </form>
    </Modal>
  );
}

/**
 * A suggested EMI split: one month of interest on what is still owed, and the rest of a standard
 * (reducing balance) EMI as principal. Banks round differently, so the user can change both.
 */
export function suggestEmi(loan: Pick<LoanAccount, 'interestRate' | 'termMonths'>, owed: number, taken: number) {
  const r = (loan.interestRate || 0) / 1200;
  const n = loan.termMonths || 0;
  const interest = round2(owed * r);
  const emi = n > 0 && taken > 0 ? Math.round(r > 0 ? (taken * r * (1 + r) ** n) / ((1 + r) ** n - 1) : taken / n) : 0;
  const principal = emi ? round2(Math.min(Math.max(emi - interest, 0), owed)) : 0;
  return { emi, interest, principal };
}

const TITLES: Record<LoanEntryKind, [string, string]> = {
  payment: ['Pay EMI', 'Edit EMI'],
  increase: ['Take more loan', 'Edit extra loan'],
  charge: ['Record loan charges', 'Edit loan charges'],
};
const NOTES: Record<LoanEntryKind, string> = {
  payment: 'e.g. EMI for October',
  increase: 'e.g. Top-up for the new machine',
  charge: 'e.g. Late payment or foreclosure charges',
};

/** Record or edit an EMI (principal + interest), extra loan taken, or charges paid on a loan. */
export function LoanEntryModal({ open, onOpenChange, loan, kind, entry, owed, taken }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan: LoanAccount | null;
  kind: LoanEntryKind;
  entry?: LoanStatementRow | null;
  /** What is still owed on the loan now */
  owed: number;
  /** Everything borrowed on the loan (the amount plus extra loan) */
  taken: number;
}) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const { list } = useDefaultAccount();
  const [date, setDate] = useState(today());
  const [picked, setPicked] = useState<string | null>(null);
  const [principal, setPrincipal] = useState(0);
  const [interest, setInterest] = useState(0);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const suggestion = loan && kind === 'payment' && !entry ? suggestEmi(loan, owed, taken) : null;

  useResetOn(open && loan ? `${loan._id}|${kind}|${entry?._id ?? 'new'}` : null, () => {
    if (!open || !loan) return;
    setDate(entry ? isoDate(entry.date) : today());
    setPicked(entry?.account?._id ?? null);
    setPrincipal(entry ? entry.principal : (suggestion?.principal ?? 0));
    setInterest(entry ? entry.interest : (suggestion?.interest ?? 0));
    setAmount(entry ? entry.amount : 0);
    setDescription(entry?.description ?? '');
  });

  const fallback = loan?.receivedIn?._id && list.some((a) => a._id === loan.receivedIn?._id) ? loan.receivedIn._id : ((list.find((a) => a.kind === 'bank') ?? list[0])?._id ?? '');
  const account = picked ?? fallback;
  const earliest = loan ? isoDate(loan.openingDate) : '';
  const tooEarly = !!date && !!earliest && date < earliest;
  // Editing an EMI frees up its own principal again
  const room = round2(owed + (entry?.kind === 'payment' ? entry.principal : 0));
  const tooMuch = kind === 'payment' && principal > room + 0.001;
  const total = kind === 'payment' ? round2(principal + interest) : amount;
  const valid = !!loan && !!account && !!date && !tooEarly && !tooMuch && total > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = { kind, principal, interest, amount: total, account, date, description: description.trim() || undefined };
      return entry ? api.put(`/finance/loans/entries/${entry._id}`, body) : api.post(`/finance/loans/${loan!._id}/entries`, body);
    },
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success(entry ? 'Entry updated' : kind === 'payment' ? `EMI of ${money(total)} recorded` : kind === 'increase' ? `${money(total)} added to the loan` : `Charges of ${money(total)} recorded`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const accountLabel = kind === 'increase' ? 'Received in' : 'Paid from';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={TITLES[kind][entry ? 1 : 0]}
      description={
        loan ? (
          <>
            {loan.name} · <span className="whitespace-nowrap">{money(owed)}</span> still owed
          </>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
            Save{total > 0 ? ` ${money(total)}` : ''}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label="Date" required error={tooEarly ? `The loan starts on ${fmtDate(earliest)}` : undefined}>
          <Input type="date" value={date} min={earliest} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={accountLabel} required>
          <Select value={account} onChange={(e) => setPicked(e.target.value)}>
            {list.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'payment' ? (
          <>
            <Field label="Principal" error={tooMuch ? `Only ${money(room)} is still owed` : undefined}>
              <NumberInput value={principal || ''} min={0} onValueChange={setPrincipal} />
            </Field>
            <Field label="Interest">
              <NumberInput value={interest || ''} min={0} onValueChange={setInterest} />
            </Field>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm sm:col-span-2">
              <span className="text-slate-600">Total paid</span>
              <span className="text-base font-semibold text-slate-900 tabular-nums">{money(total)}</span>
            </div>
            {suggestion && (suggestion.emi > 0 || suggestion.interest > 0) && (
              <p className="text-xs text-slate-500 sm:col-span-2">
                {suggestion.emi > 0 ? `Suggested from an EMI of ${money(suggestion.emi)} at ${loan?.interestRate}% a year over ${loan?.termMonths} months. ` : `Suggested interest: one month at ${loan?.interestRate}% a year. `}
                Match it to your bank statement if the bank split it differently.
              </p>
            )}
          </>
        ) : (
          <Field label={kind === 'increase' ? 'Extra loan amount' : 'Charges paid'} required className="sm:col-span-2">
            <NumberInput value={amount || ''} min={0} onValueChange={setAmount} className="text-base font-semibold" />
          </Field>
        )}
        <Field label="Note" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={NOTES[kind]} />
        </Field>
      </form>
    </Modal>
  );
}
