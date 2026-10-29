'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Banknote, CalendarDays, Check, ClipboardList, HandCoins, Plus, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, fmtDateTime, money, plural, round2 } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useEmployees } from '@/hooks/data';
import { useQueryState } from '@/hooks/use-query-state';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, PageHeader, PageLoader, Skeleton, Tabs } from '@/components/ui/misc';
import { RequestModal } from '@/components/hr/request-modal';
import { PayModal } from '@/components/hr/pay-modal';
import { REQUEST_KIND, REQUEST_STATUS, leaveDays, type HrRequestRow } from '@/components/hr/shared';

type StatusTab = 'pending' | 'approved' | 'paid' | 'rejected' | 'all';

export default function HrRequestsPage() {
  const { cid, can, href } = useCompany();
  const router = useRouter();
  const manage = can('hr_requests.manage');

  // Staff without HR rights manage their own requests from "My attendance & pay".
  useEffect(() => {
    if (!manage) router.replace(href('/hr/me'));
  }, [manage, router, href]);
  if (!manage) return <PageLoader label="Opening My attendance & pay…" />;
  return <RequestsManager key={cid} />;
}

function RequestsManager() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { params, set } = useQueryState();
  const status = (['pending', 'approved', 'paid', 'rejected', 'all'].includes(params.get('status') ?? '') ? params.get('status') : 'pending') as StatusTab;
  const kind = params.get('kind') ?? '';
  const employee = params.get('employee');
  const [newOpen, setNewOpen] = useState(false);
  const [paying, setPaying] = useState<HrRequestRow | null>(null);
  const employees = useEmployees();

  const q = useQuery({ queryKey: [cid, 'hr', 'requests', 'all'], queryFn: async () => (await api.get<HrRequestRow[]>('/hr/requests')).data });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const scoped = all.filter((r) => (!kind || r.kind === kind) && (!employee || r.employee?._id === employee));
  const rows = status === 'all' ? scoped : scoped.filter((r) => r.status === status);
  const count = (s: HrRequestRow['status']) => scoped.filter((r) => r.status === s).length;

  const decide = useMutation({
    mutationFn: async (v: { r: HrRequestRow; decision: 'approve' | 'reject'; note?: string }) => api.post(`/hr/requests/${v.r._id}/decision`, { decision: v.decision, note: v.note }),
    onSuccess: (_res, v) => {
      invalidateCompany(qc, cid);
      toast.success(v.decision === 'approve' ? 'Request approved' : 'Request declined', {
        description: v.decision === 'approve' && v.r.kind === 'leave' ? 'Leave days were marked in attendance.' : v.decision === 'approve' && v.r.kind === 'salary_advance' ? 'Pay the advance when you hand over the money.' : undefined,
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pay = useMutation({
    mutationFn: async (v: { r: HrRequestRow; paymentAccount: string; date: string }) => api.post(`/hr/requests/${v.r._id}/pay`, { paymentAccount: v.paymentAccount, date: v.date }),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      setPaying(null);
      toast.success('Advance paid', { description: 'Booked as Salary expense. It is recovered automatically in the next payroll.' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const askDecision = async (r: HrRequestRow, decision: 'approve' | 'reject') => {
    const what = r.kind === 'leave' ? `${leaveDays(r.fromDate, r.toDate)} day leave for ${r.employee?.name}` : `${money(r.amount)} advance for ${r.employee?.name}`;
    const res = await confirm({
      title: decision === 'approve' ? 'Approve request?' : 'Decline request?',
      message: what,
      confirmText: decision === 'approve' ? 'Approve' : 'Decline',
      danger: decision === 'reject',
      withReason: true,
      reasonLabel: decision === 'approve' ? 'Note for the employee (optional)' : 'Reason for declining',
    });
    if (res) decide.mutate({ r, decision, note: res.reason || undefined });
  };

  const pendingAdvance = round2(all.filter((r) => r.kind === 'salary_advance' && r.status === 'approved').reduce((s, r) => s + (r.amount ?? 0), 0));
  const outstanding = round2(all.filter((r) => r.kind === 'salary_advance' && r.status === 'paid' && !r.deductedIn).reduce((s, r) => s + (r.amount ?? 0), 0));
  const employeeOptions = (employees.data ?? []).map((e) => ({ value: e._id, label: e.name, hint: e.designation }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Salary & leave requests"
        description="Approve or decline leave and salary advance requests. Approved leave is marked in attendance; paid advances are recovered from the next salary."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New request
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Waiting for approval" value={all.filter((r) => r.status === 'pending').length} tone="amber" icon={<ClipboardList className="h-5 w-5" />} onClick={() => set({ status: null })} />
        <StatCard label="Approved advances to pay" value={money(pendingAdvance)} tone="blue" icon={<Banknote className="h-5 w-5" />} onClick={() => set({ status: 'approved', kind: 'salary_advance' })} />
        <StatCard label="Advances to recover" value={money(outstanding)} hint="Deducted in the next payroll" tone="violet" icon={<HandCoins className="h-5 w-5" />} />
        <StatCard label="Leave requests" value={all.filter((r) => r.kind === 'leave').length} hint="All time" tone="green" icon={<CalendarDays className="h-5 w-5" />} onClick={() => set({ kind: 'leave', status: 'all' })} />
      </div>

      <Card className="min-w-0">
        <Tabs<StatusTab>
          className="px-2"
          value={status}
          onChange={(v) => set({ status: v === 'pending' ? null : v })}
          tabs={[
            { value: 'pending', label: 'Pending', count: count('pending') },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'paid', label: 'Paid', count: count('paid') },
            { value: 'rejected', label: 'Declined', count: count('rejected') },
            { value: 'all', label: 'All', count: scoped.length },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <Select value={kind} onChange={(e) => set({ kind: e.target.value || null })} className="w-full sm:w-44" aria-label="Request type">
            <option value="">All types</option>
            <option value="leave">Leave</option>
            <option value="salary_advance">Salary advance</option>
          </Select>
          <Combobox value={employee} onChange={(v) => set({ employee: v })} options={employeeOptions} placeholder="All employees" searchPlaceholder="Search employees" clearable className="w-full sm:w-60" />
        </div>

        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={status === 'pending' ? 'No pending requests' : 'No requests here'}
            description={status === 'pending' ? 'New leave and salary advance requests from your staff appear here for approval.' : 'Try another tab or filter.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r._id} className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', r.kind === 'leave' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600')}>
                    {r.kind === 'leave' ? <CalendarDays className="h-5 w-5" /> : <HandCoins className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{r.employee?.name ?? 'Deleted employee'}</p>
                      <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                      {r.kind === 'salary_advance' && r.status === 'paid' && <Badge tone={r.deductedIn ? 'slate' : 'violet'}>{r.deductedIn ? `Recovered ${r.deductedIn}` : 'To recover'}</Badge>}
                    </div>
                    <p className="text-sm text-slate-700">
                      {REQUEST_KIND[r.kind]}
                      {r.kind === 'leave' ? (
                        <>
                          {' '}
                          · {fmtDate(r.fromDate)} to {fmtDate(r.toDate)} · <span className="font-medium">{plural(leaveDays(r.fromDate, r.toDate), 'day')}</span>
                        </>
                      ) : (
                        <>
                          {' '}
                          · <span className="font-semibold">{money(r.amount)}</span>
                        </>
                      )}
                    </p>
                    {r.reason && <p className="mt-0.5 text-sm text-slate-500">“{r.reason}”</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Requested {fmtDateTime(r.createdAt)}
                      {r.requestedBy?.name && r.requestedBy.name !== r.employee?.name ? ` by ${r.requestedBy.name}` : ''}
                      {r.reviewedBy?.name && ` · ${r.status === 'rejected' ? 'declined' : 'approved'} by ${r.reviewedBy.name}${r.reviewedAt ? ` on ${fmtDate(r.reviewedAt)}` : ''}`}
                      {r.reviewNote && ` · “${r.reviewNote}”`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {r.status === 'pending' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => askDecision(r, 'reject')} disabled={decide.isPending}>
                        <X className="h-4 w-4 text-rose-600" /> Decline
                      </Button>
                      <Button variant="success" size="sm" onClick={() => askDecision(r, 'approve')} disabled={decide.isPending}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    </>
                  )}
                  {r.status === 'approved' && r.kind === 'salary_advance' && can('payroll.manage') && (
                    <Button size="sm" onClick={() => setPaying(r)}>
                      <Banknote className="h-4 w-4" /> Pay advance
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RequestModal open={newOpen} onOpenChange={setNewOpen} employeeId={employee} />
      <PayModal
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        title={`Pay advance to ${paying?.employee?.name ?? ''}`}
        description={paying?.reason ? `“${paying.reason}”` : 'Salary advance'}
        amount={paying?.amount ?? 0}
        loading={pay.isPending}
        confirmText="Pay advance"
        onConfirm={(v) => paying && pay.mutate({ r: paying, ...v })}
      />
    </div>
  );
}
