'use client';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { ATTENDANCE_STATUS, WEEK_OFF, type AttendanceStatus } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Avatar } from '@/components/ui/misc';
import type { EmployeeRow } from '@/hooks/data';

export interface AttendanceMark {
  employee?: string;
  day: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  note?: string;
}

export interface HrRequestRow {
  _id: string;
  kind: 'salary_advance' | 'leave' | 'salary';
  employee: { _id: string; name: string; designation?: string } | null;
  amount?: number;
  fromDate?: string;
  toDate?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requestedBy?: { _id: string; name: string } | null;
  reviewedBy?: { _id: string; name: string } | null;
  reviewNote?: string;
  reviewedAt?: string;
  deductedIn?: string | null;
  createdAt: string;
}

export interface PayrollRow {
  _id: string;
  employee: { _id: string; name: string; designation?: string; code?: string; salaryType?: 'monthly' | 'daily'; salary?: number } | null;
  month: string;
  workingDays: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  payableDays: number;
  basic: number;
  earned: number;
  allowances: number;
  bonus: number;
  deductions: number;
  advanceDeduction: number;
  net: number;
  status: 'draft' | 'paid';
  paidOn?: string;
  paymentAccount?: { _id: string; name: string } | null;
  expense?: string | null;
  note?: string;
}

/* ---------------- month helpers ---------------- */

export const thisMonth = () => dayjs().format('YYYY-MM');
export const shiftMonth = (month: string, n: number) => dayjs(`${month}-01`).add(n, 'month').format('YYYY-MM');
export const monthLabel = (month: string, short = false) => dayjs(`${month}-01`).format(short ? 'MMM YYYY' : 'MMMM YYYY');
export const isMonth = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}$/.test(v);

export function monthDays(month: string) {
  const start = dayjs(`${month}-01`);
  return Array.from({ length: start.daysInMonth() }, (_, i) => {
    const d = start.add(i, 'day');
    return { day: d.format('YYYY-MM-DD'), date: i + 1, dow: d.day() };
  });
}

/** Inclusive number of calendar days in a leave request. */
export const leaveDays = (from?: string, to?: string) => (from && to ? dayjs(to).diff(dayjs(from), 'day') + 1 : 0);

export function useWeeklyOff() {
  const { settings } = useCompany();
  const off = new Set(settings?.hr.weeklyOff ?? [0]);
  return (dow: number) => off.has(dow);
}

/* ---------------- small components ---------------- */

export function MonthPicker({ value, onChange, className, max }: { value: string; onChange: (m: string) => void; className?: string; max?: string }) {
  const atMax = !!max && value >= max;
  return (
    <div className={cn('inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white shadow-xs', className)}>
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} className="flex h-full items-center rounded-l-lg px-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800" aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label className="relative flex h-full min-w-[132px] cursor-pointer items-center justify-center border-x border-slate-200 px-3 text-sm font-medium text-slate-800">
        {monthLabel(value)}
        <input
          type="month"
          value={value}
          max={max}
          onChange={(e) => isMonth(e.target.value) && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Choose month"
        />
      </label>
      <button
        type="button"
        disabled={atMax}
        onClick={() => onChange(shiftMonth(value, 1))}
        className="flex h-full items-center rounded-r-lg px-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AttendanceChip({ status, weekOff, className, title }: { status?: AttendanceStatus | null; weekOff?: boolean; className?: string; title?: string }) {
  const s = status ? ATTENDANCE_STATUS[status] : weekOff ? WEEK_OFF : null;
  if (!s) return <span className={cn('inline-flex h-6 w-7 items-center justify-center rounded text-[11px] text-slate-300', className)} title={title}>·</span>;
  return (
    <span className={cn('inline-flex h-6 w-7 items-center justify-center rounded text-[11px] font-semibold', s.className, className)} title={title ?? s.label}>
      {s.short}
    </span>
  );
}

export function AttendanceLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500', className)}>
      {(Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <AttendanceChip status={k} className="h-5 w-6" /> {ATTENDANCE_STATUS[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <AttendanceChip weekOff className="h-5 w-6" /> {WEEK_OFF.label}
      </span>
    </div>
  );
}

export function EmployeeAvatar({ employee, className }: { employee: Pick<EmployeeRow, 'name' | 'photo'>; className?: string }) {
  if (employee.photo)
    // eslint-disable-next-line @next/next/no-img-element -- authenticated file served by the API
    return <img src={fileUrl(employee.photo)} alt="" className={cn('h-9 w-9 shrink-0 rounded-full object-cover', className)} />;
  return <Avatar name={employee.name} className={cn('h-9 w-9', className)} />;
}

export const REQUEST_STATUS: Record<HrRequestRow['status'], { label: string; tone: 'amber' | 'blue' | 'red' | 'green' }> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
};

export const REQUEST_KIND: Record<HrRequestRow['kind'], string> = { salary_advance: 'Salary advance', leave: 'Leave', salary: 'Salary' };

/** The employee profile linked to the signed-in login (null when not linked). */
export function useMyEmployee() {
  const { cid } = useCompany();
  return useQuery({
    queryKey: [cid, 'hr', 'me'],
    queryFn: async () => (await api.get<EmployeeRow | null>('/hr/me')).data,
    staleTime: 60_000,
  });
}
