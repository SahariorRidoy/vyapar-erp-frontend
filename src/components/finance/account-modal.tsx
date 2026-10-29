'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { BankAccount } from '@/lib/types';
import { invalidateCompany } from '@/lib/query';
import { isoDate, today } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Select, Switch } from '@/components/ui/input';

type Kind = BankAccount['kind'];
interface FormState {
  name: string;
  kind: Kind;
  bankName: string;
  accountNumber: string;
  holderName: string;
  ifsc: string;
  upiId: string;
  openingBalance: number;
  openingDate: string;
  printOnInvoice: boolean;
}

const formOf = (account?: BankAccount | null): FormState =>
  account
    ? {
        name: account.name, kind: account.kind, bankName: account.bankName ?? '', accountNumber: account.accountNumber ?? '', holderName: account.holderName ?? '', ifsc: account.ifsc ?? '',
        upiId: account.upiId ?? '', openingBalance: account.openingBalance ?? 0, openingDate: isoDate(account.openingDate) || today(), printOnInvoice: !!account.printOnInvoice,
      }
    : { name: '', kind: 'bank', bankName: '', accountNumber: '', holderName: '', ifsc: '', upiId: '', openingBalance: 0, openingDate: today(), printOnInvoice: false };

/** Create or edit a cash, bank or mobile wallet (bKash / Nagad / Rocket) account. */
export function AccountModal({ open, onOpenChange, account, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; account?: BankAccount | null; onSaved?: (a: BankAccount) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [f, setF] = useState(() => formOf(account));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  useResetOn(open ? (account?._id ?? 'new') : null, () => open && setF(formOf(account)));

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, name: f.name.trim(), ifsc: f.ifsc.trim(), upiId: f.upiId.trim() };
      return (account ? await api.put<BankAccount>(`/finance/accounts/${account._id}`, body) : await api.post<BankAccount>('/finance/accounts', body)).data;
    },
    onSuccess: (a) => {
      invalidateCompany(qc, cid);
      toast.success(account ? 'Account updated' : `Account "${a.name}" added`);
      onSaved?.(a);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const isBank = f.kind === 'bank';
  const locked = !!account?.isDefault;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={account ? `Edit ${account.name}` : 'Add bank / cash account'}
      description="Payments received and made through this account update its balance automatically."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!f.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.name.trim()) save.mutate();
        }}
      >
        <Field label="Account display name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. DBBL Current A/c or bKash Merchant" />
        </Field>
        <Field label="Account type">
          <Select value={f.kind} onChange={(e) => set('kind', e.target.value as Kind)} disabled={locked}>
            <option value="bank">Bank account</option>
            <option value="cash">Cash</option>
            <option value="wallet">Mobile wallet (bKash / Nagad)</option>
          </Select>
        </Field>
        <Field label="Opening balance" hint="Money in this account on the date below">
          <NumberInput value={f.openingBalance} onValueChange={(v) => set('openingBalance', v)} />
        </Field>
        <Field label="As of date">
          <Input type="date" value={f.openingDate} onChange={(e) => set('openingDate', e.target.value)} />
        </Field>
        {isBank && (
          <>
            <Field label="Bank name">
              <Input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Dutch-Bangla Bank" />
            </Field>
            <Field label="Account number">
              <Input value={f.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Routing number" hint="9 digit branch routing number">
              <Input value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.replace(/\D/g, ''))} maxLength={9} inputMode="numeric" />
            </Field>
            <Field label="Account holder name">
              <Input value={f.holderName} onChange={(e) => set('holderName', e.target.value)} />
            </Field>
          </>
        )}
        {f.kind !== 'cash' && (
          <Field label="bKash / Nagad number">
            <Input value={f.upiId} onChange={(e) => set('upiId', e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" />
          </Field>
        )}
        {isBank && (
          <div className="sm:col-span-2">
            <Switch checked={f.printOnInvoice} onCheckedChange={(v) => set('printOnInvoice', v)} label="Print these bank details on invoices" description="Shown in the bank details box of invoice templates" />
          </div>
        )}
      </form>
    </Modal>
  );
}
