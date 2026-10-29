'use client';
import { ATTENDANCE_KEYS, ATTENDANCE_STATUS, type AttendanceStatus } from '@/lib/constants';
import { WEEKDAYS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { AttendanceChip, monthDays, useWeeklyOff, type AttendanceMark } from './shared';

/** Summary counts of a set of marks. */
export function countMarks(marks: Pick<AttendanceMark, 'status'>[]) {
  const c = Object.fromEntries(ATTENDANCE_KEYS.map((k) => [k, 0])) as Record<AttendanceStatus, number>;
  for (const m of marks) c[m.status] = (c[m.status] ?? 0) + 1;
  return c;
}

export function MarkCounts({ marks, className }: { marks: Pick<AttendanceMark, 'status'>[]; className?: string }) {
  const c = countMarks(marks);
  return (
    <div className={cn('grid grid-cols-5 gap-2', className)}>
      {ATTENDANCE_KEYS.map((k) => (
        <div key={k} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
          <p className="text-lg font-semibold text-slate-900 tabular-nums">{c[k]}</p>
          <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', ATTENDANCE_STATUS[k].dot)} /> {ATTENDANCE_STATUS[k].label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Month calendar of one employee's attendance. */
export function AttendanceCalendar({ month, marks, today, className }: { month: string; marks: AttendanceMark[]; today?: string; className?: string }) {
  const isOff = useWeeklyOff();
  const days = monthDays(month);
  const byDay = new Map(marks.map((m) => [m.day, m]));
  const lead = days[0]?.dow ?? 0;
  return (
    <div className={className}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 uppercase">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d.slice(0, 3)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const m = byDay.get(d.day);
          const off = !m && isOff(d.dow);
          const future = !!today && d.day > today;
          return (
            <div
              key={d.day}
              className={cn(
                'flex min-h-14 flex-col items-center justify-between rounded-lg border px-1 py-1.5',
                d.day === today ? 'border-blue-400 ring-1 ring-blue-400' : 'border-slate-100',
                future && 'opacity-50',
              )}
              title={m ? `${ATTENDANCE_STATUS[m.status].label}${m.checkIn ? ` · in ${m.checkIn}` : ''}${m.checkOut ? ` · out ${m.checkOut}` : ''}${m.note ? ` · ${m.note}` : ''}` : off ? 'Weekly off' : 'Not marked'}
            >
              <span className={cn('text-xs', d.day === today ? 'font-semibold text-blue-700' : 'text-slate-500')}>{d.date}</span>
              <AttendanceChip status={m?.status} weekOff={off} className="h-5 w-6 text-[10px]" />
              {m?.checkIn ? <span className="text-[10px] leading-none text-slate-400 tabular-nums">{m.checkIn}</span> : <span className="h-2.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
