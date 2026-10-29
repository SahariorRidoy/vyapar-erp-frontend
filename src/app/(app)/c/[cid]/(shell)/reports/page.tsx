'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCompany } from '@/providers/company';
import { Card } from '@/components/ui/card';
import { NoAccess, PageHeader, SearchInput, Skeleton } from '@/components/ui/misc';
import { GROUP_META, groupDefs, useReportDefs } from '@/components/reports/defs';

const FEATURED = ['profit-loss', 'balance-sheet', 'sale', 'day-book', 'stock-summary', 'vat-sales', 'receivable-ageing', 'party-statement'];

export default function ReportsIndexPage() {
  const { can, href } = useCompany();
  const defs = useReportDefs();
  const [search, setSearch] = useState('');
  if (!can('reports.view')) return <NoAccess what="reports" />;
  const all = defs.data ?? [];
  const groups = groupDefs(all, search);
  const featured = FEATURED.map((k) => all.find((d) => d.key === k)).filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={`${all.length || 'All'} business reports. Every report can be filtered, printed and downloaded as Excel or CSV.`}
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search reports" className="w-full sm:w-72" />}
      />

      {!search && featured.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Most used</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {featured.map((d) => {
              const meta = GROUP_META[d.group];
              const Icon = meta?.icon;
              return (
                <Link key={d.key} href={href(`/reports/${d.key}`)} className="group rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:border-blue-300 hover:shadow-md">
                  <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${meta?.tone ?? 'bg-slate-100 text-slate-600'}`}>{Icon && <Icon className="h-4.5 w-4.5" />}</span>
                  <p className="font-medium text-slate-900 group-hover:text-blue-700">{d.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{d.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {defs.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(([group, list]) => {
            const meta = GROUP_META[group];
            const Icon = meta?.icon;
            return (
              <Card key={group} className="overflow-hidden">
                <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta?.tone ?? 'bg-slate-100 text-slate-600'}`}>{Icon && <Icon className="h-4 w-4" />}</span>
                  <p className="font-semibold text-slate-900">{group}</p>
                  <span className="ml-auto text-xs text-slate-400">{list.length}</span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {list.map((d) => (
                    <li key={d.key}>
                      <Link href={href(`/reports/${d.key}`)} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800 group-hover:text-blue-700">{d.title}</span>
                          <span className="block truncate text-xs text-slate-500">{d.description}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
