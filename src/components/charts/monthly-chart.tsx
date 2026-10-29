'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { cn, money } from '@/lib/utils';

/** Validated categorical slots 1–3 (CVD-safe adjacent order). Aqua is under 3:1 on white, so the legend and a table view carry identity too. */
export const SERIES_COLORS = { sale: '#2a78d6', purchase: '#eb6834', expense: '#1baf7a' } as const;
const INK = { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781' };

export interface MonthPoint {
  key: string;
  label: string;
  sale: number;
  purchase: number;
  expense: number;
}

const SERIES = [
  { key: 'sale', label: 'Sales' },
  { key: 'purchase', label: 'Purchases' },
  { key: 'expense', label: 'Expenses' },
] as const;

const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: unknown; value?: unknown }[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-slate-900">{String(label)}</p>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 py-0.5 text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[s.key] }} />
              {s.label}
            </span>
            <span className="font-medium text-slate-900 tabular-nums">{money(Number(v ?? 0))}</span>
          </p>
        );
      })}
    </div>
  );
}

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const totals = SERIES.map((s) => ({ ...s, total: data.reduce((t, d) => t + d[s.key], 0) }));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {totals.map((s) => (
            <span key={s.key} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[s.key] }} />
              {s.label}
              <span className="font-semibold text-slate-900">{money(s.total)}</span>
            </span>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn('flex items-center gap-1 px-2.5 py-1', view === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              aria-pressed={view === v}
            >
              {v === 'chart' ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>
      {view === 'chart' ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: INK.axis }} tick={{ fontSize: 11, fill: INK.muted }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK.muted }} tickFormatter={compact} width={52} />
              <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[s.key]} radius={[4, 4, 0, 0]} maxBarSize={18} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-1.5 text-slate-700">{d.label}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                      {money(d[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
