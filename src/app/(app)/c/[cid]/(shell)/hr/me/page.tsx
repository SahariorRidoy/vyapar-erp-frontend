'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ClipboardList, Clock, FileText, HandCoins, LogIn, LogOut, Plus, UserX } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { ATTENDANCE_STATUS } from '@/lib/constants';
import { cn, fmtDate, inZone, money, plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, PageLoader, Skeleton } from '@/components/ui/misc';
import { RequestModal } from '@/components/hr/request-modal';
import { AttendanceCalendar, MarkCounts } from '@/components/hr/attendance-calendar';
import { EmployeeAvatar, MonthPicker, REQUEST_KIND, REQUEST_STATUS, leaveDays, monthLabel, thisMonth, useMyEmployee, type AttendanceMark, type HrRequestRow, type PayrollRow } from '@/components/hr/shared';

interface MyAttendance {
  month: string;
  today: string;
  employee: { _id: string; name: string } | null;
  marks: AttendanceMark[];
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Staff self service: check in/out, own attendance, leave & advance requests and salary slips. */
export default function MyHrPage() {
  const { cid, can, href, settings } = useCompany();
  const { session } = useSession();
  const qc = useQueryClient();
  const me = useMyEmployee();
  const now = useClock();
  const [month, setMonth] = useState(thisMonth());
  const [request, setRequest] = useState<{ open: boolean; kind: 'leave' | 'salary_advance' }>({ open: false, kind: 'leave' });
  const linked = !!me.data;

  const att = useQuery({
    queryKey: [cid, 'hr', 'me', 'attendance', month],
    queryFn: async () => (await api.get<MyAttendance>('/hr/me/attendance', { month })).data,
    enabled: linked,
    placeholderData: (prev) => prev,
  });
  const todayAtt = useQuery({
    queryKey: [cid, 'hr', 'me', 'attendance', 'today'],
    queryFn: async () => {
      const d = (await api.get<MyAttendance>('/hr/me/attendance')).data;
      return { today: d.today, mark: d.marks.find((m) => m.day === d.today) ?? null };
    },
    enabled: linked,
  });
  const requests = useQuery({
    queryKey: [cid, 'hr', 'requests', 'mine', me.data?._id],
    queryFn: async () => (await api.get<HrRequestRow[]>('/hr/requests', { employee: me.data!._id })).data,
    enabled: linked,
  });
  const slips = useQuery({ queryKey: [cid, 'hr', 'me', 'payslips'], queryFn: async () => (await api.get<PayrollRow[]>('/hr/me/payslips')).data, enabled: linked });

  const punch = useMutation({
    mutationFn: async (action: 'check_in' | 'check_out') => (await api.post<AttendanceMark>('/hr/attendance/self', { action })).data,
    onSuccess: (a, action) => {
      qc.invalidateQueries({ queryKey: [cid, 'hr'] });
      toast.success(action === 'check_in' ? `Checked in at ${a.checkIn}` : `Checked out at ${a.checkOut}`, { description: 'Have a great day!' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.isLoading) return <PageLoader />;
  if (!linked)
    return (
      <>
        <PageHeader title="My attendance & pay" description="Attendance, leave, salary advances and salary slips" />
        <Card>
          <EmptyState
            icon={<UserX className="h-6 w-6" />}
            title="Your login is not linked to an employee profile"
            description={
              can('employees.manage')
                ? 'Open HR ▸ Employees, edit your employee profile and choose your login under “App login”.'
                : 'Ask your company admin to link your login to your employee profile. Then you can check in, request leave and download salary slips here.'
            }
            action={
              can('employees.manage') ? (
                <Link href={href('/hr/employees')} className={buttonClass({ variant: 'outline' })}>
                  Go to employees
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    );

  const e = me.data!;
  const mark = todayAtt.data?.mark ?? null;
  const checkedIn = !!mark?.checkIn;
  const checkedOut = !!mark?.checkOut;
  const blocked = !!mark && mark.status !== 'present' && mark.status !== 'half_day';
  const firstName = (session?.user.name ?? e.name).split(' ')[0];
  // The clock follows the company's time zone, the same one the server stamps check-ins with.
  const tz = settings?.general.timezone;
  const hour = Number(inZone(now, tz, { hour: 'numeric', hourCycle: 'h23' }, 'en-US'));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const marks = att.data?.marks ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={`${greeting}, ${firstName}`} description={[e.designation, e.department, e.code].filter(Boolean).join(' · ') || 'My attendance & pay'} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white">
            <div className="flex items-center gap-3">
              <EmployeeAvatar employee={e} className="h-12 w-12 ring-2 ring-white/40" />
              <div>
                <p className="text-sm text-blue-100">{inZone(now, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p className="text-3xl font-semibold tabular-nums">{inZone(now, tz, { hour: '2-digit', minute: '2-digit', hour12: true }, 'en-US')}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-blue-100">Check in</p>
                <p className="font-semibold">{mark?.checkIn ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-blue-100">Check out</p>
                <p className="font-semibold">{mark?.checkOut ?? '—'}</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {todayAtt.isLoading ? (
              <Skeleton className="h-10" />
            ) : blocked ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                Today is marked as <span className="font-semibold">{ATTENDANCE_STATUS[mark!.status].label.toLowerCase()}</span> for you.
              </p>
            ) : checkedOut ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">You have checked out for today. See you tomorrow!</p>
            ) : checkedIn ? (
              <Button variant="danger" size="lg" className="w-full" onClick={() => punch.mutate('check_out')} loading={punch.isPending}>
                {!punch.isPending && <LogOut className="h-5 w-5" />} Check out
              </Button>
            ) : (
              <Button variant="success" size="lg" className="w-full" onClick={() => punch.mutate('check_in')} loading={punch.isPending}>
                {!punch.isPending && <LogIn className="h-5 w-5" />} Check in
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setRequest({ open: true, kind: 'leave' })}>
                <CalendarDays className="h-4 w-4" /> Apply leave
              </Button>
              <Button variant="outline" onClick={() => setRequest({ open: true, kind: 'salary_advance' })}>
                <HandCoins className="h-4 w-4" /> Ask advance
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Times are recorded by the server in your company&apos;s time zone.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="My attendance" description={monthLabel(month)} actions={<MonthPicker value={month} onChange={setMonth} max={thisMonth()} />} />
          <div className="space-y-4 p-4">
            {att.isLoading ? (
              <Skeleton className="h-72" />
            ) : (
              <>
                <MarkCounts marks={marks} />
                <AttendanceCalendar month={month} marks={marks} today={att.data?.today} />
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="My requests"
            description="Leave and salary advance"
            actions={
              <Button size="sm" variant="outline" onClick={() => setRequest({ open: true, kind: 'leave' })}>
                <Plus className="h-4 w-4" /> New
              </Button>
            }
          />
          {requests.isLoading ? (
            <Skeleton className="m-4 h-24" />
          ) : (requests.data ?? []).length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No requests yet" description="Apply for leave or ask for a salary advance. Your manager will approve it." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(requests.data ?? []).slice(0, 20).map((r) => (
                <li key={r._id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', r.kind === 'leave' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600')}>
                    {r.kind === 'leave' ? <CalendarDays className="h-4.5 w-4.5" /> : <HandCoins className="h-4.5 w-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {REQUEST_KIND[r.kind]} · {r.kind === 'leave' ? `${fmtDate(r.fromDate)} to ${fmtDate(r.toDate)} (${plural(leaveDays(r.fromDate, r.toDate), 'day')})` : money(r.amount)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {r.reason || 'No reason given'}
                      {r.reviewNote ? ` · Reply: “${r.reviewNote}”` : ''}
                    </p>
                  </div>
                  <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="My salary slips" description="Download or print any paid month" />
          {slips.isLoading ? (
            <Skeleton className="m-4 h-24" />
          ) : (slips.data ?? []).length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" />} title="No salary slips yet" description="Salary slips appear here once your salary is paid." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(slips.data ?? []).map((p) => (
                <li key={p._id}>
                  <Link href={href(`/print/payslip/${p._id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <FileText className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{monthLabel(p.month)}</span>
                      <span className="block text-xs text-slate-500">
                        {p.payableDays} payable days · paid {fmtDate(p.paidOn)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{money(p.net)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RequestModal open={request.open} initialKind={request.kind} self onOpenChange={(o) => setRequest((r) => ({ ...r, open: o }))} />
    </div>
  );
}
