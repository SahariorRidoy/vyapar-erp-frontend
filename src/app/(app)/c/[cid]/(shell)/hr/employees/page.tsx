'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  ArrowLeft, BadgeCheck, Briefcase, CalendarCheck, CalendarDays, ClipboardList, FileBarChart2, HandCoins, KeyRound, Landmark, Mail, MoreVertical, Pencil, Phone, Plus, Printer, Trash2, UserCheck, UserMinus, Users,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, money, plural, today } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useEmployees, type EmployeeRow } from '@/hooks/data';
import { useQueryState } from '@/hooks/use-query-state';
import { useUrlFlag } from '@/hooks/use-url-flag';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, KeyValue, NoAccess, PageHeader, SearchInput, Skeleton, Tabs } from '@/components/ui/misc';
import { EmployeeModal } from '@/components/hr/employee-modal';
import { RequestModal } from '@/components/hr/request-modal';
import { AttendanceCalendar, MarkCounts } from '@/components/hr/attendance-calendar';
import { EmployeeAvatar, MonthPicker, REQUEST_KIND, REQUEST_STATUS, leaveDays, monthLabel, thisMonth, type AttendanceMark, type HrRequestRow, type PayrollRow } from '@/components/hr/shared';

type EmployeeDetail = EmployeeRow & { payroll: PayrollRow[]; requests: HrRequestRow[] };

function tenure(join?: string) {
  if (!join) return '';
  const months = dayjs().diff(dayjs(join), 'month');
  if (months < 1) return 'joined this month';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', m ? `${m} mo${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ');
}

/** Approximate monthly cost of one employee (daily wages × working days). */
function monthlyCost(e: EmployeeRow, workingDays: number) {
  const base = e.salaryType === 'daily' ? e.salary * workingDays : e.salary;
  return base + (e.allowances ?? 0) - (e.deductions ?? 0);
}

export default function EmployeesPage() {
  const { cid, can, href, settings } = useCompany();
  const { params, set } = useQueryState();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('active');
  const [modal, setModal] = useState<{ open: boolean; employee?: EmployeeRow | null }>({ open: false });
  const [mobileDetail, setMobileDetail] = useState(false);
  const list = useEmployees();
  const canView = can('employees.view', 'employees.manage');
  const workingDays = settings?.hr.workingDaysPerMonth ?? 26;

  const todayAtt = useQuery({
    queryKey: [cid, 'hr', 'attendance', 'day', today()],
    queryFn: async () => (await api.get<{ rows: { attendance: AttendanceMark | null }[] }>('/hr/attendance', { day: today() })).data,
    enabled: can('attendance.view', 'attendance.manage'),
  });
  const pending = useQuery({
    queryKey: [cid, 'hr', 'requests', 'pending-count'],
    queryFn: async () => (await api.get<HrRequestRow[]>('/hr/requests', { status: 'pending' })).data.length,
    enabled: can('hr_requests.manage'),
  });

  useUrlFlag('new', can('employees.manage'), () => setModal({ open: true, employee: null }));

  const all = useMemo(() => list.data ?? [], [list.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((e) => (!status || e.status === status) && (!q || `${e.name} ${e.code ?? ''} ${e.phone ?? ''} ${e.designation ?? ''} ${e.department ?? ''}`.toLowerCase().includes(q)));
  }, [all, search, status]);
  const selected = params.get('employee') ?? filtered[0]?._id ?? null;

  if (!canView) return <NoAccess what="employees" />;

  const active = all.filter((e) => e.status === 'active');
  const presentToday = (todayAtt.data?.rows ?? []).filter((r) => r.attendance?.status === 'present' || r.attendance?.status === 'half_day').length;
  const markedToday = (todayAtt.data?.rows ?? []).filter((r) => r.attendance).length;
  const bill = active.reduce((s, e) => s + monthlyCost(e, workingDays), 0);

  const choose = (id: string) => {
    set({ employee: id });
    setMobileDetail(true);
  };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff profiles, salary structure, attendance and salary history"
        actions={
          <>
            {can('attendance.view', 'attendance.manage') && (
              <Link href={href('/hr/attendance')} className={buttonClass({ variant: 'outline' })}>
                <CalendarCheck className="h-4 w-4" /> Attendance
              </Link>
            )}
            {can('employees.manage') && (
              <Button onClick={() => setModal({ open: true, employee: null })}>
                <Plus className="h-4 w-4" /> Add employee
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Active employees" value={active.length} hint={all.length > active.length ? `${all.length - active.length} inactive` : 'All staff active'} tone="blue" icon={<Users className="h-5 w-5" />} />
        {can('attendance.view', 'attendance.manage') ? (
          <StatCard
            label="Present today"
            value={`${presentToday} / ${active.length}`}
            hint={markedToday < active.length ? `${active.length - markedToday} not marked yet` : 'Attendance complete'}
            tone="green"
            icon={<UserCheck className="h-5 w-5" />}
          />
        ) : (
          <StatCard label="Departments" value={new Set(active.map((e) => e.department).filter(Boolean)).size} tone="green" icon={<Briefcase className="h-5 w-5" />} />
        )}
        <StatCard label="Monthly salary bill" value={money(bill)} hint={`Estimated, daily wages × ${workingDays} days`} tone="violet" icon={<HandCoins className="h-5 w-5" />} />
        {can('hr_requests.manage') ? (
          <StatCard label="Pending requests" value={pending.data ?? 0} hint="Leave and salary advance" tone="amber" icon={<ClipboardList className="h-5 w-5" />} href={href('/hr/requests?status=pending')} />
        ) : (
          <StatCard label="Daily-wage staff" value={active.filter((e) => e.salaryType === 'daily').length} tone="amber" icon={<ClipboardList className="h-5 w-5" />} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={cn('flex flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)]', mobileDetail && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, phone" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-8 text-xs" aria-label="Status">
              <option value="active">Active employees</option>
              <option value="inactive">Inactive employees</option>
              <option value="">All employees</option>
            </Select>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={all.length ? 'No employees match' : 'No employees yet'}
                description={all.length ? 'Try another search or status.' : 'Add your staff to track attendance and run payroll.'}
                action={
                  !all.length && can('employees.manage') ? (
                    <Button size="sm" onClick={() => setModal({ open: true, employee: null })}>
                      <Plus className="h-4 w-4" /> Add employee
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              filtered.map((e) => (
                <button
                  key={e._id}
                  type="button"
                  onClick={() => choose(e._id)}
                  className={cn(
                    'flex w-full items-center gap-3 border-l-[3px] px-4 py-2.5 text-left transition',
                    selected === e._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50',
                    e.status === 'inactive' && 'opacity-60',
                  )}
                >
                  <EmployeeAvatar employee={e} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{e.name}</span>
                    <span className="block truncate text-xs text-slate-500">{[e.designation, e.code].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium text-slate-800 tabular-nums">{money(e.salary)}</span>
                    <span className="block text-[11px] text-slate-400">{e.salaryType === 'daily' ? 'per day' : 'per month'}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {filtered.length} employee{filtered.length === 1 ? '' : 's'}
          </p>
        </Card>

        <div className={cn('min-w-0', !mobileDetail && 'hidden lg:block')}>
          {selected ? (
            <EmployeeDetailPane
              key={selected}
              id={selected}
              onBack={() => setMobileDetail(false)}
              onEdit={(e) => setModal({ open: true, employee: e })}
              onDeleted={() => set({ employee: null })}
            />
          ) : (
            <Card>
              <EmptyState icon={<Users className="h-6 w-6" />} title="Select an employee" description="Pick an employee on the left to see attendance, salary history and requests." />
            </Card>
          )}
        </div>
      </div>

      <EmployeeModal open={modal.open} employee={modal.employee} onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))} onSaved={(e) => !modal.employee && set({ employee: e._id })} />
    </>
  );
}

/* ---------------------------------------------------------------- */

type DetailTab = 'attendance' | 'salary' | 'requests' | 'details';

function EmployeeDetailPane({ id, onBack, onEdit, onDeleted }: { id: string; onBack: () => void; onEdit: (e: EmployeeRow) => void; onDeleted: () => void }) {
  const { cid, can, href, settings } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const canAttendance = can('attendance.view', 'attendance.manage');
  const [tab, setTab] = useState<DetailTab>(canAttendance ? 'attendance' : 'salary');
  const [month, setMonth] = useState(thisMonth());
  const [request, setRequest] = useState(false);

  const q = useQuery({ queryKey: [cid, 'hr', 'employees', 'detail', id], queryFn: async () => (await api.get<EmployeeDetail>(`/hr/employees/${id}`)).data });
  const att = useQuery({
    queryKey: [cid, 'hr', 'attendance', 'month', month],
    queryFn: async () => (await api.get<{ marks: AttendanceMark[] }>('/hr/attendance/month', { month })).data,
    enabled: canAttendance && tab === 'attendance',
  });

  const setStatus = useMutation({
    mutationFn: async (status: 'active' | 'inactive') => {
      const e = q.data!;
      const user = typeof e.user === 'object' && e.user ? e.user._id : (e.user ?? '');
      return api.put(`/hr/employees/${e._id}`, { ...e, payroll: undefined, requests: undefined, user, photo: e.photo ?? '', status });
    },
    onSuccess: (_r, status) => {
      invalidateCompany(qc, cid);
      toast.success(status === 'inactive' ? 'Employee marked inactive' : 'Employee re-activated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/hr/employees/${id}`),
    onSuccess: () => {
      invalidateCompany(qc, cid, id);
      toast.success('Employee deleted');
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data)
    return (
      <Card>
        <EmptyState title="Employee not found" description="It may have been deleted, or the link is old." action={<Button variant="outline" onClick={onDeleted}>Open the first employee</Button>} />
      </Card>
    );
  const e = q.data;
  const manage = can('employees.manage');
  const login = typeof e.user === 'object' && e.user ? e.user : null;
  const marks = (att.data?.marks ?? []).filter((m) => m.employee === e._id);
  const workingDays = settings?.hr.workingDaysPerMonth ?? 26;
  const gross = monthlyCost(e, workingDays) + (e.deductions ?? 0);

  const askDelete = async () => {
    if (
      await confirm({
        title: `Delete ${e.name}?`,
        message: 'Attendance, draft payroll and requests of this employee are deleted too. Employees with paid salary cannot be deleted; mark them inactive instead.',
        danger: true,
        confirmText: 'Delete employee',
      })
    )
      del.mutate();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <button type="button" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to list">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <EmployeeAvatar employee={e} className="h-14 w-14 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{e.name}</h2>
              {e.code && <Badge tone="slate">{e.code}</Badge>}
              <Badge tone={e.status === 'active' ? 'green' : 'red'}>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="text-sm text-slate-500">{[e.designation, e.department].filter(Boolean).join(' · ') || 'No designation'}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {e.phone && (
                <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-600">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> {e.phone}
                </a>
              )}
              {e.email && (
                <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1.5 hover:text-blue-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> {e.email}
                </a>
              )}
              {e.joinDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> Joined {fmtDate(e.joinDate)} ({tenure(e.joinDate)})
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-slate-400" /> {login ? `Login: ${login.name}` : 'No app login'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {manage && (
              <Button variant="outline" size="sm" onClick={() => onEdit(e)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Dropdown>
              <DropdownTrigger asChild>
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Employee options">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </DropdownTrigger>
              <DropdownContent>
                {can('attendance.manage') && (
                  <DropdownItem icon={<CalendarCheck className="h-4 w-4" />} onSelect={() => router.push(href('/hr/attendance'))}>
                    Mark attendance
                  </DropdownItem>
                )}
                {can('hr_requests.manage') && (
                  <DropdownItem icon={<ClipboardList className="h-4 w-4" />} onSelect={() => setRequest(true)}>
                    New leave / advance request
                  </DropdownItem>
                )}
                {can('payroll.view', 'payroll.manage') && (
                  <DropdownItem icon={<HandCoins className="h-4 w-4" />} onSelect={() => router.push(href(`/hr/payroll?month=${thisMonth()}`))}>
                    Open payroll
                  </DropdownItem>
                )}
                {can('reports.view') && (
                  <DropdownItem icon={<FileBarChart2 className="h-4 w-4" />} onSelect={() => router.push(href(`/reports/salary?employee=${e._id}`))}>
                    Salary report
                  </DropdownItem>
                )}
                {manage && (
                  <>
                    <DropdownSeparator />
                    {e.status === 'active' ? (
                      <DropdownItem icon={<UserMinus className="h-4 w-4" />} onSelect={() => setStatus.mutate('inactive')}>
                        Mark inactive (left company)
                      </DropdownItem>
                    ) : (
                      <DropdownItem icon={<BadgeCheck className="h-4 w-4" />} onSelect={() => setStatus.mutate('active')}>
                        Re-activate
                      </DropdownItem>
                    )}
                    <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={askDelete}>
                      Delete employee
                    </DropdownItem>
                  </>
                )}
              </DropdownContent>
            </Dropdown>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-100 bg-slate-100 sm:grid-cols-4">
          {[
            { label: e.salaryType === 'daily' ? 'Daily wage' : 'Monthly salary', value: money(e.salary) },
            { label: 'Allowances / month', value: money(e.allowances) },
            { label: 'Deductions / month', value: money(e.deductions) },
            { label: e.salaryType === 'daily' ? `Gross (${workingDays} days)` : 'Gross / month', value: money(gross) },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="mt-0.5 font-semibold text-slate-900 tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="min-w-0">
        <Tabs<DetailTab>
          className="px-2"
          value={tab}
          onChange={setTab}
          tabs={[
            ...(canAttendance ? [{ value: 'attendance' as const, label: 'Attendance' }] : []),
            { value: 'salary', label: 'Salary history', count: e.payroll.length },
            { value: 'requests', label: 'Requests', count: e.requests.length },
            { value: 'details', label: 'Bank & other details' },
          ]}
        />

        {tab === 'attendance' && (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MonthPicker value={month} onChange={setMonth} max={thisMonth()} />
              {can('reports.view') && (
                <Link href={href(`/reports/attendance?month=${month}&employee=${e._id}`)} className="text-sm font-medium text-blue-600 hover:underline">
                  Attendance report
                </Link>
              )}
            </div>
            {att.isLoading ? (
              <Skeleton className="h-72" />
            ) : (
              <>
                <MarkCounts marks={marks} />
                <AttendanceCalendar month={month} marks={marks} today={today()} />
              </>
            )}
          </div>
        )}

        {tab === 'salary' &&
          (e.payroll.length === 0 ? (
            <EmptyState icon={<HandCoins className="h-6 w-6" />} title="No salary records" description="Generate payroll for a month to calculate this employee's salary." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-4 py-2.5 text-right font-medium">Payable days</th>
                    <th className="px-4 py-2.5 text-right font-medium">Earned</th>
                    <th className="px-4 py-2.5 text-right font-medium">Additions</th>
                    <th className="px-4 py-2.5 text-right font-medium">Deductions</th>
                    <th className="px-4 py-2.5 text-right font-medium">Net pay</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="relative px-2 py-2.5">
                      <span className="sr-only">Payslip</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {e.payroll.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{monthLabel(p.month, true)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {p.payableDays} / {p.workingDays}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(p.earned)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">{money(p.allowances + p.bonus)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">{money(p.deductions + p.advanceDeduction)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(p.net)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={p.status === 'paid' ? 'green' : 'amber'}>{p.status === 'paid' ? `Paid ${fmtDate(p.paidOn)}` : 'Draft'}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Link href={href(`/print/payslip/${p._id}`)} className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Salary slip" aria-label="Open salary slip">
                          <Printer className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'requests' &&
          (e.requests.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No requests" description="Leave and salary advance requests of this employee appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {e.requests.map((r) => (
                <li key={r._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', r.kind === 'leave' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600')}>
                    {r.kind === 'leave' ? <CalendarDays className="h-4.5 w-4.5" /> : <HandCoins className="h-4.5 w-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {REQUEST_KIND[r.kind]}
                      {r.kind === 'leave' ? ` · ${fmtDate(r.fromDate)} to ${fmtDate(r.toDate)} (${plural(leaveDays(r.fromDate, r.toDate), 'day')})` : ` · ${money(r.amount)}`}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {r.reason || 'No reason given'} · requested {fmtDate(r.createdAt)}
                    </p>
                  </div>
                  <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'details' && (
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <Landmark className="h-3.5 w-3.5" /> Salary bank account
              </p>
              <KeyValue label="Bank" value={e.bankName} />
              <KeyValue label="Account number" value={e.accountNumber} />
              <KeyValue label="Routing No." value={e.ifsc} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Other</p>
              <KeyValue label="Address" value={e.address && <span className="whitespace-pre-line">{e.address}</span>} />
              <KeyValue label="Emergency contact" value={e.emergencyContact && <span className="whitespace-pre-line">{e.emergencyContact}</span>} />
              <KeyValue label="App login" value={login ? `${login.name}${login.email ? ` (${login.email})` : ''}` : 'Not linked'} />
            </div>
          </div>
        )}
      </Card>

      <RequestModal open={request} onOpenChange={setRequest} employeeId={e._id} />
    </div>
  );
}
