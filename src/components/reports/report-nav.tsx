'use client';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { SearchInput, Skeleton } from '@/components/ui/misc';
import { GROUP_META, groupDefs, useReportDefs } from './defs';

/** Left-hand list of every report, grouped like Vyapar's report menu. */
export function ReportNav({ active, className }: { active?: string; className?: string }) {
  const { href } = useCompany();
  const defs = useReportDefs();
  const [search, setSearch] = useState('');
  const groups = groupDefs(defs.data ?? [], search);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="border-b border-slate-100 p-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Find a report" />
      </div>
      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {defs.isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mx-2 my-2 h-6" />
          ))}
        {groups.map(([group, list]) => {
          const meta = GROUP_META[group];
          const Icon = meta?.icon;
          return (
            <div key={group} className="mb-3">
              <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                {Icon && <Icon className="h-3.5 w-3.5" />} {group}
              </p>
              {list.map((d) => (
                <Link
                  key={d.key}
                  href={href(`/reports/${d.key}`)}
                  className={cn('block rounded-lg px-2.5 py-1.5 text-sm', d.key === active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-50')}
                >
                  {d.title}
                </Link>
              ))}
            </div>
          );
        })}
        {!defs.isLoading && groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">No report matches “{search}”.</p>}
      </nav>
    </div>
  );
}
