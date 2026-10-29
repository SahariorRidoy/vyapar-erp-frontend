'use client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, FileText, Landmark, Percent, ReceiptText, ScrollText, ShoppingCart, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useCompany } from '@/providers/company';

export type ReportFilter = 'dateRange' | 'asOf' | 'party' | 'item' | 'category' | 'account' | 'employee' | 'month' | 'txnType' | 'group' | 'user' | 'loan';

export interface ReportDef {
  key: string;
  title: string;
  group: string;
  description: string;
  filters: ReportFilter[];
  required?: ReportFilter[];
}

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'date' | 'percent';
}

export interface ReportResult {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  summary?: { label: string; value: number | string; type?: 'money' | 'number' | 'text' }[];
  subtitle?: string;
}

export const GROUP_ORDER = ['Transaction', 'Party', 'Item / Stock', 'Business Status', 'Taxes', 'Expense', 'Sale / Purchase Orders', 'HR', 'Audit'];

export const GROUP_META: Record<string, { icon: LucideIcon; tone: string }> = {
  Transaction: { icon: FileText, tone: 'bg-blue-50 text-blue-600' },
  Party: { icon: Users, tone: 'bg-emerald-50 text-emerald-600' },
  'Item / Stock': { icon: Boxes, tone: 'bg-amber-50 text-amber-600' },
  'Business Status': { icon: Landmark, tone: 'bg-sky-50 text-sky-600' },
  Taxes: { icon: Percent, tone: 'bg-rose-50 text-rose-600' },
  Expense: { icon: ReceiptText, tone: 'bg-orange-50 text-orange-600' },
  'Sale / Purchase Orders': { icon: ShoppingCart, tone: 'bg-violet-50 text-violet-600' },
  HR: { icon: BarChart3, tone: 'bg-teal-50 text-teal-600' },
  Audit: { icon: ScrollText, tone: 'bg-slate-100 text-slate-600' },
};

/** Reports the signed-in user may run (the API filters by permission). */
export function useReportDefs() {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'reports', 'defs'],
    queryFn: async () => (await api.get<ReportDef[]>('/reports')).data,
    enabled: can('reports.view'),
    staleTime: 10 * 60_000,
  });
}

export function groupDefs(defs: ReportDef[], search = '') {
  const q = search.trim().toLowerCase();
  const filtered = q ? defs.filter((d) => `${d.title} ${d.description} ${d.group}`.toLowerCase().includes(q)) : defs;
  const groups = new Map<string, ReportDef[]>();
  for (const d of filtered) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  return [...groups.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
}
