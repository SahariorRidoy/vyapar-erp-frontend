'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, HandCoins } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, today } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useEmployees } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, Input, NumberInput, Textarea } from '@/components/ui/input';
import { leaveDays, type HrRequestRow } from './shared';

type Kind = 'leave' | 'salary_advance';

/**
 * Leave or salary advance request. Staff raise it for themselves; HR managers can raise it for any employee.
 * Every request goes to the approval queue.
 */
export function RequestModal({ open, onOpenChange, self = false, employeeId, initialKind = 'leave' }: { open: boolean; onOpenChange: (o: boolean) => void; self?: boolean; employeeId?: string | null; initialKind?: Kind }) {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const onBehalf = !self && can('hr_requests.manage');
  const employees = useEmployees(open && onBehalf);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [employee, setEmployee] = useState<string | null>(employeeId ?? null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useResetOn(open ? `${initialKind}|${employeeId ?? ''}` : null, () => {
    if (!open) return;
    setKind(initialKind);
    setEmployee(employeeId ?? null);
    setFrom(today());
    setTo(today());
    setAmount(0);
    setReason('');
    setTouched(false);
  });

  const options = useMemo(() => (employees.data ?? []).filter((e) => e.status === 'active').map((e) => ({ value: e._id, label: e.name, hint: [e.code, e.designation].filter(Boolean).join(' · ') })), [employees.data]);
  const days = leaveDays(from, to);
  const errors = {
    employee: onBehalf && !employee ? 'Choose the employee' : undefined,
    to: kind === 'leave' && (!from || !to || to < from) ? 'End date must be on or after the start date' : undefined,
    amount: kind === 'salary_advance' && !(amount > 0) ? 'Enter the advance amount' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<HrRequestRow>('/hr/requests', {
          kind,
          employee: onBehalf ? employee : undefined,
          amount: kind === 'salary_advance' ? amount : undefined,
          fromDate: kind === 'leave' ? from : undefined,
          toDate: kind === 'leave' ? to : undefined,
          reason: reason.trim(),
        })
      ).data,
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Request sent for approval', { description: 'You will be notified once it is approved or declined.' });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    setTouched(true);
    if (!invalid) save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={self ? 'New request' : 'New salary or leave request'}
      description="The request is sent to your company's approvers."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { k: 'leave', label: 'Leave', hint: 'Days off from work', icon: CalendarDays },
              { k: 'salary_advance', label: 'Salary advance', hint: 'Deducted from next salary', icon: HandCoins },
            ] as const
          ).map(({ k, label, hint, icon: Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn('flex items-start gap-3 rounded-xl border p-3 text-left transition', kind === k ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50')}
            >
              <Icon className={cn('mt-0.5 h-5 w-5', kind === k ? 'text-blue-600' : 'text-slate-400')} />
              <span>
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        {onBehalf && (
          <Field label="Employee" required error={touched ? errors.employee : undefined}>
            <Combobox value={employee} onChange={setEmployee} options={options} placeholder="Choose employee" searchPlaceholder="Search employees" invalid={touched && !!errors.employee} />
          </Field>
        )}

        {kind === 'leave' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" required error={touched ? errors.to : undefined} hint={days > 0 ? `${days} day${days === 1 ? '' : 's'}` : undefined}>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-invalid={touched && !!errors.to} />
            </Field>
          </div>
        ) : (
          <Field label="Amount" required error={touched ? errors.amount : undefined} hint="Paid from cash or bank once approved, then deducted when salary is paid.">
            <NumberInput value={amount} onValueChange={setAmount} min={0} aria-invalid={touched && !!errors.amount} />
          </Field>
        )}

        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={kind === 'leave' ? 'e.g. Family function in village' : 'e.g. Medical expenses'} />
        </Field>
      </div>
    </Modal>
  );
}
