'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, money, today } from '@/lib/utils';
import { useAccountOptions } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';

export type EntryKind = 'add' | 'reduce' | 'transfer';

const KINDS: { value: EntryKind; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'add', label: 'Add money', icon: <ArrowDownLeft className="h-4 w-4" />, hint: 'Capital introduced, interest received, cash found…' },
  { value: 'reduce', label: 'Reduce money', icon: <ArrowUpRight className="h-4 w-4" />, hint: 'Owner withdrawal, bank charges, cash short…' },
  { value: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className="h-4 w-4" />, hint: 'Cash deposited in bank, ATM withdrawal, bank to bank…' },
];

/** Adjust an account balance or move money between two accounts. */
export function EntryModal({ open, onOpenChange, kind: initialKind = 'add', account: initialAccount, balances }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind?: EntryKind;
  account?: string | null;
  balances?: Record<string, number>;
}) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const accounts = useAccountOptions();
  const [kind, setKind] = useState<EntryKind>(initialKind);
  // null until the user picks one, so the defaults follow the accounts once they load
  const [pickedFrom, setAccount] = useState<string | null>(null);
  const [pickedTo, setToAccount] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const list = accounts.data ?? [];
  const account = pickedFrom ?? initialAccount ?? list[0]?._id ?? '';
  const toAccount = pickedTo ?? list.find((a) => a._id !== account)?._id ?? '';

  useResetOn(open ? `${initialKind}|${initialAccount ?? ''}` : null, () => {
    if (!open) return;
    setKind(initialKind);
    setAccount(null);
    setToAccount(null);
    setAmount(0);
    setDate(today());
    setDescription('');
  });

  const save = useMutation({
    mutationFn: () => api.post('/finance/entries', { kind, account, toAccount: kind === 'transfer' ? toAccount : undefined, amount, date, description: description || undefined }),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success(kind === 'transfer' ? 'Transfer recorded' : kind === 'add' ? 'Money added' : 'Money reduced');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const valid = !!account && amount > 0 && (kind !== 'transfer' || (!!toAccount && toAccount !== account));
  const bal = (id: string) => (balances && id in balances ? ` (${money(balances[id])})` : '');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Bank / cash adjustment"
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
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn('flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium', kind === k.value ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
            >
              {k.icon}
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{KINDS.find((k) => k.value === kind)?.hint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === 'transfer' ? 'From account' : 'Account'} required>
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {list.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                  {bal(a._id)}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'transfer' && (
            <Field label="To account" required error={toAccount && toAccount === account ? 'Choose a different account' : undefined}>
              <Select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                {list.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                    {bal(a._id)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Amount" required>
            <NumberInput value={amount} min={0} onValueChange={setAmount} className="text-base font-semibold" />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Cash deposited at branch" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
