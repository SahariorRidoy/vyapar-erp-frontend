'use client';
import { CalendarDays } from 'lucide-react';
import { RANGE_PRESETS, presetRange } from '@/lib/utils';

export interface DateRangeValue {
  preset: string;
  from: string;
  to: string;
}

export const defaultRange = (preset = 'this_month'): DateRangeValue => ({ preset, ...presetRange(preset) });

export function DateRangeFilter({ value, onChange, className }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select
          value={value.preset}
          onChange={(e) => onChange(e.target.value === 'custom' ? { ...value, preset: 'custom' } : { preset: e.target.value, ...presetRange(e.target.value) })}
          className="h-9 cursor-pointer rounded-lg border border-slate-300 bg-white pr-7 pl-8 text-sm outline-none focus:border-blue-500"
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-sm">
        <input type="date" value={value.from} onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to: value.to })} className="h-8 bg-transparent outline-none" aria-label="From date" />
        <span className="text-slate-400">to</span>
        <input type="date" value={value.to} onChange={(e) => onChange({ preset: 'custom', from: value.from, to: e.target.value })} className="h-8 bg-transparent outline-none" aria-label="To date" />
      </div>
    </div>
  );
}
