'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { money, today } from '@/lib/utils';
import { useAccountOptions } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';

export interface PayInput {
  paymentAccount: string;
  date: string;
}

/** Asks which cash/bank account pays out (salary, advance) and on which date. Booked as a Salary expense. */
export function PayModal({
  open, onOpenChange, title, description, amount, onConfirm, loading, confirmText = 'Pay now', children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  amount: number;
  onConfirm: (v: PayInput) => void;
  loading?: boolean;
  confirmText?: string;
  children?: ReactNode;
}) {
  const accounts = useAccountOptions();
  const [picked, setAccount] = useState('');
  const [date, setDate] = useState(today());
  const account = picked || (accounts.data?.find((a) => a.isDefault) ?? accounts.data?.[0])?._id || '';
  useResetOn(open, () => open && setDate(today()));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => onConfirm({ paymentAccount: account, date })} loading={loading} disabled={!account || !date}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
          <p className="text-xs font-medium text-emerald-700">Amount to pay</p>
          <p className="text-2xl font-semibold text-emerald-800">{money(amount)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid from" required>
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {(accounts.data ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {children}
        <p className="text-xs text-slate-500">This is recorded as a Salary expense and reduces the selected account balance.</p>
      </div>
    </Modal>
  );
}
