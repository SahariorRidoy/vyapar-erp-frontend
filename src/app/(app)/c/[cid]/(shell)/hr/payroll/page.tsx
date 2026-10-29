'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Calculator, CheckCircle2, Clock, FileSpreadsheet, HandCoins, Info, MoreVertical, Pencil, Printer, RotateCcw, Trash2, Users, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { fmtDate, money, round2 } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useQueryState } from '@/hooks/use-query-state';
import { useResetOn } from '@/hooks/use-reset-on';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, NumberInput, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, NoAccess, PageHeader, Skeleton } from '@/components/ui/misc';
import { PayModal, type PayInput } from '@/components/hr/pay-modal';
import { MonthPicker, isMonth, monthLabel, thisMonth, type PayrollRow } from '@/components/hr/shared';

export default function PayrollPage() {
  const { cid, can, href, settings } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const { params, set } = useQueryState();
  const month = isMonth(params.get('month')) ? params.get('month')! : thisMonth();
  const manage = can('payroll.manage');
  const [edit, setEdit] = useState<PayrollRow | null>(null);
  const [pay, setPay] = useState<{ rows: PayrollRow[] } | null>(null);

  const q = useQuery({
    queryKey: [cid, 'hr', 'payroll', month],
    queryFn: async () => api.get<PayrollRow[]>('/hr/payroll', { month }),
    enabled: can('payroll.view', 'payroll.manage'),
    placeholderData: (prev) => prev,
  });
  const rows = q.data?.data ?? [];
  const totals = (q.data?.meta?.totals ?? { net: 0, paid: 0, pending: 0 }) as { net: number; paid: number; pending: number };
  const drafts = rows.filter((r) => r.status === 'draft' && r.net > 0);

  const generate = useMutation({
    mutationFn: async () => (await api.post<{ generated: number }>('/hr/payroll/generate', { month })).data,
    onSuccess: (r) => {
      invalidateCompany(qc, cid);
      toast.success(r.generated ? `Payroll calculated for ${r.generated} employee${r.generated === 1 ? '' : 's'}` : 'Nothing to calculate', {
        description: r.generated ? `${monthLabel(month)} · based on attendance` : 'All salaries of this month are already paid, or there are no active employees.',
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const payMany = useMutation({
    mutationFn: async ({ list, input }: { list: PayrollRow[]; input: PayInput }) => {
      let paid = 0;
      const failed: string[] = [];
      for (const r of list) {
        try {
          await api.post(`/hr/payroll/${r._id}/pay`, input);
          paid++;
        } catch (e) {
          failed.push(`${r.employee?.name ?? 'Employee'}: ${errorMessage(e)}`);
        }
      }
      return { paid, failed };
    },
    onSuccess: ({ paid, failed }) => {
      invalidateCompany(qc, cid);
      setPay(null);
      if (paid) toast.success(`Salary paid to ${paid} employee${paid === 1 ? '' : 's'}`, { description: 'Booked as Salary expense' });
      if (failed.length) toast.error(`${failed.length} payment${failed.length === 1 ? '' : 's'} failed`, { description: failed.join('\n') });
    },
  });

  const revert = useMutation({
    mutationFn: (r: PayrollRow) => api.post(`/hr/payroll/${r._id}/revert`),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Salary payment reverted', { description: 'The salary expense was deleted and the row is a draft again.' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (r: PayrollRow) => api.del(`/hr/payroll/${r._id}`),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Draft salary removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('payroll.view', 'payroll.manage')) return <NoAccess what="payroll" />;

  const askGenerate = async () => {
    if (
      rows.length &&
      !(await confirm({
        title: `Recalculate ${monthLabel(month)}?`,
        message: 'Earned salary and advance deductions of draft rows are recalculated from attendance. Bonus, allowances and deductions you changed are kept. Paid salaries are not touched.',
        confirmText: 'Recalculate',
      }))
    )
      return;
    generate.mutate();
  };

  const hr = settings?.hr;
  const sum = (k: keyof PayrollRow) => round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll"
        description="Monthly salary calculated from attendance. Pay from cash or bank and print salary slips."
        actions={
          <>
            <MonthPicker value={month} onChange={(m) => set({ month: m === thisMonth() ? null : m })} max={thisMonth()} />
            {can('reports.view') && (
              <Link href={href(`/reports/salary?month=${month}`)} className={buttonClass({ variant: 'outline' })}>
                <FileSpreadsheet className="h-4 w-4" /> Salary report
              </Link>
            )}
            {manage && (
              <Button variant={rows.length ? 'outline' : 'primary'} onClick={askGenerate} loading={generate.isPending}>
                {!generate.isPending && <Calculator className="h-4 w-4" />} {rows.length ? 'Recalculate' : 'Generate payroll'}
              </Button>
            )}
            {manage && drafts.length > 0 && (
              <Button variant="success" onClick={() => setPay({ rows: drafts })}>
                <Banknote className="h-4 w-4" /> Pay all ({drafts.length})
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Employees" value={rows.length} hint={monthLabel(month)} tone="blue" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Net payroll" value={money(totals.net)} tone="violet" icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Paid" value={money(totals.paid)} hint={`${rows.filter((r) => r.status === 'paid').length} salaries paid`} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Pending" value={money(totals.pending)} hint={`${rows.filter((r) => r.status === 'draft').length} drafts`} tone="amber" icon={<Clock className="h-5 w-5" />} />
      </div>

      {hr && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-900">
          <Info className="h-4 w-4 shrink-0 text-blue-600" />
          Monthly salary is pro-rated over {hr.workingDaysPerMonth} working days. Half day counts as {hr.halfDayFactor} day, {hr.paidLeavePerMonth} leave per month is paid, holidays are paid and salary advances are deducted automatically.
          {can('settings.manage') && (
            <Link href={href('/settings?tab=hr')} className="font-medium text-blue-700 underline-offset-2 hover:underline">
              Change rules
            </Link>
          )}
        </p>
      )}

      <Card className="min-w-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="h-6 w-6" />}
            title={`No payroll for ${monthLabel(month)}`}
            description="Generate payroll to calculate every active employee's salary from this month's attendance."
            action={
              manage && (
                <Button onClick={askGenerate} loading={generate.isPending}>
                  <Calculator className="h-4 w-4" /> Generate payroll
                </Button>
              )
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Employee</th>
                  <th className="px-3 py-2.5 text-right font-medium">Payable days</th>
                  <th className="px-3 py-2.5 text-right font-medium">Earned</th>
                  <th className="px-3 py-2.5 text-right font-medium">Allowances</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bonus</th>
                  <th className="px-3 py-2.5 text-right font-medium">Deductions</th>
                  <th className="px-3 py-2.5 text-right font-medium">Advance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Net pay</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="relative w-12 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{r.employee?.name ?? 'Deleted employee'}</p>
                      <p className="text-xs text-slate-500">
                        {[r.employee?.code, r.employee?.designation].filter(Boolean).join(' · ')}
                        {r.employee?.salaryType === 'daily' ? ` · ${money(r.basic)}/day` : ` · ${money(r.basic)}/month`}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" title={`Present ${r.presentDays} · Half day ${r.halfDays} · Leave ${r.leaveDays} · Absent ${r.absentDays}`}>
                      <span className="font-medium text-slate-800">{r.payableDays}</span>
                      <span className="text-slate-400"> / {r.workingDays}</span>
                      <span className="block text-[11px] text-slate-400">
                        P{r.presentDays} H{r.halfDays} L{r.leaveDays} A{r.absentDays}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.earned)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{r.allowances ? money(r.allowances) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{r.bonus ? money(r.bonus) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-rose-600 tabular-nums">{r.deductions ? money(r.deductions) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-rose-600 tabular-nums">{r.advanceDeduction ? money(r.advanceDeduction) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{money(r.net)}</td>
                    <td className="px-3 py-2.5">
                      {r.status === 'paid' ? (
                        <span className="block">
                          <Badge tone="green">Paid</Badge>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {fmtDate(r.paidOn)}
                            {r.paymentAccount?.name ? ` · ${r.paymentAccount.name}` : ''}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="amber">Draft</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Dropdown>
                        <DropdownTrigger asChild>
                          <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Actions for ${r.employee?.name ?? 'salary'}`}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownTrigger>
                        <DropdownContent>
                          {manage && r.status === 'draft' && (
                            <>
                              <DropdownItem icon={<Banknote className="h-4 w-4" />} disabled={r.net <= 0} onSelect={() => setPay({ rows: [r] })}>
                                Pay salary
                              </DropdownItem>
                              <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setEdit(r)}>
                                Edit bonus & deductions
                              </DropdownItem>
                            </>
                          )}
                          <DropdownItem icon={<Printer className="h-4 w-4" />} onSelect={() => router.push(href(`/print/payslip/${r._id}`))}>
                            Salary slip
                          </DropdownItem>
                          {manage && r.status === 'paid' && (
                            <>
                              <DropdownSeparator />
                              <DropdownItem
                                icon={<RotateCcw className="h-4 w-4" />}
                                onSelect={async () => {
                                  if (
                                    await confirm({
                                      title: 'Revert this salary payment?',
                                      message: `The salary expense of ${money(r.net)} is deleted, ${r.paymentAccount?.name ?? 'the account'} gets the money back and the row becomes a draft.`,
                                      confirmText: 'Revert payment',
                                      danger: true,
                                    })
                                  )
                                    revert.mutate(r);
                                }}
                              >
                                Revert payment
                              </DropdownItem>
                            </>
                          )}
                          {manage && r.status === 'draft' && (
                            <>
                              <DropdownSeparator />
                              <DropdownItem
                                danger
                                icon={<Trash2 className="h-4 w-4" />}
                                onSelect={async () => {
                                  if (await confirm({ title: 'Remove this draft?', message: 'You can generate it again later.', confirmText: 'Remove', danger: true })) remove.mutate(r);
                                }}
                              >
                                Remove draft
                              </DropdownItem>
                            </>
                          )}
                        </DropdownContent>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td className="px-4 py-2.5">Total</td>
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum('earned'))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum('allowances'))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum('bonus'))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum('deductions'))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum('advanceDeduction'))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(totals.net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <EditPayrollModal row={edit} onOpenChange={(o) => !o && setEdit(null)} />
      <PayModal
        open={!!pay}
        onOpenChange={(o) => !o && setPay(null)}
        title={pay?.rows.length === 1 ? `Pay salary to ${pay.rows[0].employee?.name ?? 'employee'}` : `Pay ${pay?.rows.length ?? 0} salaries`}
        description={`${monthLabel(month)} salary`}
        amount={round2((pay?.rows ?? []).reduce((s, r) => s + r.net, 0))}
        loading={payMany.isPending}
        confirmText={pay && pay.rows.length > 1 ? `Pay ${pay.rows.length} salaries` : 'Pay salary'}
        onConfirm={(input) => pay && payMany.mutate({ list: pay.rows, input })}
      >
        {pay && pay.rows.length > 1 && (
          <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {pay.rows.map((r) => (
              <li key={r._id} className="flex justify-between px-3 py-1.5">
                <span className="truncate">{r.employee?.name}</span>
                <span className="tabular-nums">{money(r.net)}</span>
              </li>
            ))}
          </ul>
        )}
      </PayModal>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const payrollForm = (row: PayrollRow | null) => ({
  earned: row?.earned ?? 0,
  allowances: row?.allowances ?? 0,
  bonus: row?.bonus ?? 0,
  deductions: row?.deductions ?? 0,
  advanceDeduction: row?.advanceDeduction ?? 0,
  note: row?.note ?? '',
});

function EditPayrollModal({ row, onOpenChange }: { row: PayrollRow | null; onOpenChange: (o: boolean) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [f, setF] = useState(() => payrollForm(row));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  useResetOn(row?._id ?? null, () => setF(payrollForm(row)));
  const net = round2(Math.max(0, f.earned + f.allowances + f.bonus - f.deductions - f.advanceDeduction));

  const save = useMutation({
    mutationFn: () => api.put(`/hr/payroll/${row!._id}`, f),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Salary updated');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={!!row}
      onOpenChange={onOpenChange}
      title={`Edit salary · ${row?.employee?.name ?? ''}`}
      description={row ? `${monthLabel(row.month)} · ${row.payableDays} payable of ${row.workingDays} working days` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Earned salary" hint="Calculated from attendance; change only to override">
            <NumberInput value={f.earned} onValueChange={(v) => set('earned', v)} min={0} />
          </Field>
          <Field label="Allowances">
            <NumberInput value={f.allowances} onValueChange={(v) => set('allowances', v)} min={0} />
          </Field>
          <Field label="Bonus / incentive">
            <NumberInput value={f.bonus} onValueChange={(v) => set('bonus', v)} min={0} />
          </Field>
          <Field label="Deductions" hint="PF, ESI, fines, loan EMI">
            <NumberInput value={f.deductions} onValueChange={(v) => set('deductions', v)} min={0} />
          </Field>
          <Field label="Advance recovery" hint="Salary advances paid earlier">
            <NumberInput value={f.advanceDeduction} onValueChange={(v) => set('advanceDeduction', v)} min={0} />
          </Field>
          <div className="flex flex-col justify-end rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Net pay</p>
            <p className="text-xl font-semibold text-slate-900 tabular-nums">{money(net)}</p>
          </div>
        </div>
        <Field label="Note" hint="Printed on the salary slip">
          <Textarea value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
