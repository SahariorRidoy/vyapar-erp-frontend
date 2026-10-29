'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, FileSpreadsheet, Info, RotateCcw, Save, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { ATTENDANCE_KEYS, ATTENDANCE_STATUS, WEEKDAYS, type AttendanceStatus } from '@/lib/constants';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, today } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useQueryState } from '@/hooks/use-query-state';
import { useResetOn } from '@/hooks/use-reset-on';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, NoAccess, PageHeader, Skeleton, Tabs } from '@/components/ui/misc';
import { AttendanceChip, AttendanceLegend, MonthPicker, isMonth, monthDays, thisMonth, useWeeklyOff, type AttendanceMark } from '@/components/hr/shared';

type View = 'daily' | 'monthly';

export default function AttendancePage() {
  const { can, href } = useCompany();
  const { params, set } = useQueryState();
  const view: View = params.get('view') === 'monthly' ? 'monthly' : 'daily';
  if (!can('attendance.view', 'attendance.manage')) return <NoAccess what="attendance" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance"
        description="Mark daily attendance and review the monthly register. Payroll is calculated from these marks."
        actions={
          can('reports.view') && (
            <Link href={href(`/reports/attendance?month=${params.get('month') ?? thisMonth()}`)} className={buttonClass({ variant: 'outline' })}>
              <FileSpreadsheet className="h-4 w-4" /> Attendance report
            </Link>
          )
        }
      />
      <Card>
        <Tabs<View>
          className="px-2"
          value={view}
          onChange={(v) => set({ view: v === 'daily' ? null : v })}
          tabs={[
            { value: 'daily', label: 'Daily register' },
            { value: 'monthly', label: 'Monthly register' },
          ]}
        />
        {view === 'daily' ? <DailyRegister /> : <MonthlyRegister />}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */

interface DayRow {
  employee: { _id: string; name: string; designation?: string; code?: string };
  attendance: (AttendanceMark & { _id: string }) | null;
}
interface Draft {
  status: AttendanceStatus | null;
  checkIn: string;
  checkOut: string;
  note: string;
}

const toDraft = (r: DayRow): Draft => ({ status: r.attendance?.status ?? null, checkIn: r.attendance?.checkIn ?? '', checkOut: r.attendance?.checkOut ?? '', note: r.attendance?.note ?? '' });
const toDrafts = (rows: DayRow[]): Record<string, Draft> => Object.fromEntries(rows.map((r) => [r.employee._id, toDraft(r)]));
const same = (a: Draft, b: Draft) => a.status === b.status && a.checkIn === b.checkIn && a.checkOut === b.checkOut && a.note === b.note;

function DailyRegister() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const isOff = useWeeklyOff();
  const { params, set } = useQueryState();
  const paramDay = params.get('day');
  const day = paramDay && /^\d{4}-\d{2}-\d{2}$/.test(paramDay) ? paramDay : today();
  const manage = can('attendance.manage');

  const q = useQuery({
    queryKey: [cid, 'hr', 'attendance', 'day', day],
    queryFn: async () => (await api.get<{ day: string; rows: DayRow[] }>('/hr/attendance', { day })).data,
    // A background refetch must never wipe marks that are being edited.
    refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const [draft, setDraft] = useState(() => toDrafts(rows));
  useResetOn(rows, () => setDraft(toDrafts(rows)));

  const changed = rows.filter((r) => draft[r.employee._id] && !same(draft[r.employee._id], toDraft(r)));
  const dirty = changed.length > 0;
  const patch = (id: string, p: Partial<Draft>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));

  const save = useMutation({
    mutationFn: async () =>
      api.post<{ saved: number }>('/hr/attendance', {
        day,
        entries: changed.map((r) => {
          const d = draft[r.employee._id];
          return { employee: r.employee._id, status: d.status, checkIn: d.checkIn, checkOut: d.checkOut, note: d.note.trim() };
        }),
      }),
    onSuccess: (res) => {
      invalidateCompany(qc, cid);
      toast.success(`Attendance saved for ${fmtDate(day)}`, { description: `${res.data.saved} employee${res.data.saved === 1 ? '' : 's'} updated` });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const goTo = async (next: string) => {
    if (next === day) return;
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', message: `You changed attendance of ${changed.length} employee${changed.length === 1 ? '' : 's'} for ${fmtDate(day)}.`, confirmText: 'Discard', danger: true }))) return;
    set({ day: next === today() ? null : next });
  };

  const markAll = (status: AttendanceStatus, onlyUnmarked: boolean) =>
    setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, x]) => [id, onlyUnmarked && x.status ? x : { ...x, status }])));

  const counts = Object.fromEntries(ATTENDANCE_KEYS.map((k) => [k, 0])) as Record<AttendanceStatus, number>;
  let unmarked = 0;
  for (const d of Object.values(draft)) {
    if (d.status) counts[d.status]++;
    else unmarked++;
  }
  const dow = dayjs(day).day();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white shadow-xs">
          <button type="button" onClick={() => goTo(dayjs(day).subtract(1, 'day').format('YYYY-MM-DD'))} className="flex h-full items-center rounded-l-lg px-2 text-slate-500 hover:bg-slate-50" aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={day} onChange={(e) => e.target.value && goTo(e.target.value)} className="h-full border-x border-slate-200 bg-transparent px-2 text-sm outline-none" aria-label="Attendance date" />
          <button type="button" onClick={() => goTo(dayjs(day).add(1, 'day').format('YYYY-MM-DD'))} className="flex h-full items-center rounded-r-lg px-2 text-slate-500 hover:bg-slate-50" aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-slate-700">{WEEKDAYS[dow]}</span>
        {day !== today() && (
          <Button variant="ghost" size="sm" onClick={() => goTo(today())}>
            Today
          </Button>
        )}
        <div className="flex-1" />
        {manage && rows.length > 0 && (
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="outline" size="sm">
                <CheckCheck className="h-4 w-4" /> Mark all
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>Employees not marked yet</DropdownLabel>
              {ATTENDANCE_KEYS.map((k) => (
                <DropdownItem key={`u-${k}`} onSelect={() => markAll(k, true)} icon={<AttendanceChip status={k} className="h-4 w-5 text-[9px]" />}>
                  {ATTENDANCE_STATUS[k].label}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownLabel>Everyone</DropdownLabel>
              <DropdownItem onSelect={() => markAll('present', false)} icon={<AttendanceChip status="present" className="h-4 w-5 text-[9px]" />}>
                Present
              </DropdownItem>
              <DropdownItem onSelect={() => markAll('holiday', false)} icon={<AttendanceChip status="holiday" className="h-4 w-5 text-[9px]" />}>
                Holiday
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-xs">
        {ATTENDANCE_KEYS.map((k) => (
          <span key={k} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium', ATTENDANCE_STATUS[k].className)}>
            {ATTENDANCE_STATUS[k].label} <span className="tabular-nums">{counts[k]}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
          Not marked <span className="tabular-nums">{unmarked}</span>
        </span>
      </div>

      {isOff(dow) && (
        <p className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0" /> {WEEKDAYS[dow]} is a weekly off (Settings ▸ HR). Mark only the employees who worked today.
        </p>
      )}

      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No active employees" description="Add employees in HR ▸ Employees to start marking attendance." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const d = draft[r.employee._id] ?? toDraft(r);
            const rowDirty = !same(d, toDraft(r));
            return (
              <li key={r.employee._id} className={cn('grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1fr)_auto_minmax(260px,1fr)] lg:items-center', rowDirty && 'bg-blue-50/40')}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {r.employee.name}
                    {rowDirty && <span className="ml-2 text-[11px] font-normal text-blue-600">edited</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{[r.employee.code, r.employee.designation].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Attendance of ${r.employee.name}`}>
                  {ATTENDANCE_KEYS.map((k) => {
                    const on = d.status === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={!manage}
                        onClick={() => patch(r.employee._id, { status: on ? null : k })}
                        title={on ? `Clear ${ATTENDANCE_STATUS[k].label}` : ATTENDANCE_STATUS[k].label}
                        className={cn(
                          'h-8 min-w-9 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed',
                          on ? cn(ATTENDANCE_STATUS[k].className, 'border-transparent ring-1 ring-current/30') : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800',
                        )}
                      >
                        <span className="xl:hidden">{ATTENDANCE_STATUS[k].short}</span>
                        <span className="hidden xl:inline">{ATTENDANCE_STATUS[k].label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-[90px_90px_1fr] gap-2">
                  <Input type="time" value={d.checkIn} disabled={!manage || !d.status} onChange={(e) => patch(r.employee._id, { checkIn: e.target.value })} className="h-8 px-2 text-xs" aria-label="Check in time" title="Check in" />
                  <Input type="time" value={d.checkOut} disabled={!manage || !d.status} onChange={(e) => patch(r.employee._id, { checkOut: e.target.value })} className="h-8 px-2 text-xs" aria-label="Check out time" title="Check out" />
                  <Input value={d.note} disabled={!manage || !d.status} onChange={(e) => patch(r.employee._id, { note: e.target.value })} placeholder="Note" className="h-8 text-xs" aria-label="Note" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {manage && rows.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
          <p className="mr-auto text-xs text-slate-500">{dirty ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'All changes saved'}</p>
          <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => setDraft(Object.fromEntries(rows.map((r) => [r.employee._id, toDraft(r)])))}>
            <RotateCcw className="h-4 w-4" /> Discard
          </Button>
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            {!save.isPending && <Save className="h-4 w-4" />} Save attendance
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

interface MonthData {
  month: string;
  employees: { _id: string; name: string; designation?: string }[];
  marks: (AttendanceMark & { employee: string })[];
}

function MonthlyRegister() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const isOff = useWeeklyOff();
  const { params, set } = useQueryState();
  const month = isMonth(params.get('month')) ? params.get('month')! : thisMonth();
  const manage = can('attendance.manage');
  const days = monthDays(month);
  const now = today();

  const q = useQuery({
    queryKey: [cid, 'hr', 'attendance', 'month', month],
    queryFn: async () => (await api.get<MonthData>('/hr/attendance/month', { month })).data,
    placeholderData: (prev) => prev,
  });
  const byKey = useMemo(() => new Map((q.data?.marks ?? []).map((m) => [`${m.employee}|${m.day}`, m])), [q.data]);

  const mark = useMutation({
    mutationFn: async (v: { employee: string; day: string; status: AttendanceStatus | null }) => api.post('/hr/attendance', { day: v.day, entries: [{ employee: v.employee, status: v.status }] }),
    onSuccess: () => invalidateCompany(qc, cid),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const employees = q.data?.employees ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
        <MonthPicker value={month} onChange={(m) => set({ month: m === thisMonth() ? null : m })} />
        <AttendanceLegend className="flex-1" />
      </div>
      {q.isLoading ? (
        <Skeleton className="m-4 h-64" />
      ) : employees.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No active employees" description="Add employees to see the monthly register." />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="sticky left-0 z-10 min-w-40 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">Employee</th>
                {days.map((d) => (
                  <th key={d.day} className={cn('min-w-7 border-b border-slate-200 px-0 py-1.5 text-center font-medium', isOff(d.dow) ? 'bg-slate-100' : 'bg-slate-50', d.day === now && 'bg-blue-50 text-blue-700')}>
                    <span className="block text-[11px]">{d.date}</span>
                    <span className="block text-[10px] font-normal opacity-70">{WEEKDAYS[d.dow].slice(0, 2)}</span>
                  </th>
                ))}
                {ATTENDANCE_KEYS.map((k) => (
                  <th key={k} className="min-w-8 border-b border-l border-slate-200 bg-slate-50 px-1 py-2 text-center font-semibold" title={ATTENDANCE_STATUS[k].label}>
                    {ATTENDANCE_STATUS[k].short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const totals = Object.fromEntries(ATTENDANCE_KEYS.map((k) => [k, 0])) as Record<AttendanceStatus, number>;
                return (
                  <tr key={e._id} className="group">
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                      <p className="truncate font-medium text-slate-800">{e.name}</p>
                      {e.designation && <p className="truncate text-[11px] text-slate-400">{e.designation}</p>}
                    </td>
                    {days.map((d) => {
                      const m = byKey.get(`${e._id}|${d.day}`);
                      if (m) totals[m.status]++;
                      const off = isOff(d.dow);
                      const title = `${e.name} · ${fmtDate(d.day)}: ${m ? ATTENDANCE_STATUS[m.status].label : off ? 'Weekly off' : 'Not marked'}${m?.checkIn ? ` · in ${m.checkIn}` : ''}${m?.checkOut ? ` · out ${m.checkOut}` : ''}`;
                      const chip = <AttendanceChip status={m?.status} weekOff={off} className="h-6 w-6" title={title} />;
                      return (
                        <td key={d.day} className={cn('border-b border-slate-100 px-0 py-1 text-center group-hover:bg-slate-50', off && 'bg-slate-50/70', d.day === now && 'bg-blue-50/50')}>
                          {manage ? (
                            <Dropdown>
                              <DropdownTrigger asChild>
                                <button type="button" className="rounded outline-none hover:ring-2 hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={title}>
                                  {chip}
                                </button>
                              </DropdownTrigger>
                              <DropdownContent align="center" className="min-w-[170px]">
                                <DropdownLabel>
                                  {e.name.split(' ')[0]} · {dayjs(d.day).format('D MMM')}
                                </DropdownLabel>
                                {ATTENDANCE_KEYS.map((k) => (
                                  <DropdownItem key={k} onSelect={() => mark.mutate({ employee: e._id, day: d.day, status: k })} icon={<AttendanceChip status={k} className="h-4 w-5 text-[9px]" />}>
                                    {ATTENDANCE_STATUS[k].label}
                                    {m?.status === k && <span className="ml-auto text-xs text-blue-600">current</span>}
                                  </DropdownItem>
                                ))}
                                {m && (
                                  <>
                                    <DropdownSeparator />
                                    <DropdownItem danger onSelect={() => mark.mutate({ employee: e._id, day: d.day, status: null })}>
                                      Clear mark
                                    </DropdownItem>
                                  </>
                                )}
                              </DropdownContent>
                            </Dropdown>
                          ) : (
                            chip
                          )}
                        </td>
                      );
                    })}
                    {ATTENDANCE_KEYS.map((k) => (
                      <td key={k} className="border-b border-l border-slate-100 px-1 py-1.5 text-center font-semibold text-slate-700 tabular-nums group-hover:bg-slate-50">
                        {totals[k] || <span className="text-slate-300">0</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {manage && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Click any day to change an employee&apos;s mark. Weekly offs are not counted as absent.</p>}
    </div>
  );
}
