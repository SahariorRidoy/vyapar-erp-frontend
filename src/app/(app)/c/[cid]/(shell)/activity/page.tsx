'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ExternalLink, FileSpreadsheet, History, Monitor } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, fmtDate } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useDebounce } from '@/hooks/use-debounce';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Select } from '@/components/ui/input';
import { DateRangeFilter, defaultRange, type DateRangeValue } from '@/components/ui/date-range';
import { Avatar, EmptyState, NoAccess, PageHeader, Pagination, SearchInput, Skeleton } from '@/components/ui/misc';
import { ChangeList } from '@/components/audit/diff';
import { useUsers } from '@/components/users/types';

interface AuditRow {
  _id: string;
  user?: string;
  userName?: string;
  action: string;
  entity: string;
  entityId?: string;
  label: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

const ACTIONS: Record<string, { label: string; className: string }> = {
  create: { label: 'Created', className: 'bg-emerald-50 text-emerald-700' },
  update: { label: 'Updated', className: 'bg-blue-50 text-blue-700' },
  delete: { label: 'Deleted', className: 'bg-rose-50 text-rose-700' },
  cancel: { label: 'Cancelled', className: 'bg-amber-50 text-amber-700' },
  convert: { label: 'Converted', className: 'bg-violet-50 text-violet-700' },
  login: { label: 'Signed in', className: 'bg-slate-100 text-slate-600' },
  logout: { label: 'Signed out', className: 'bg-slate-100 text-slate-600' },
  approve: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700' },
  reject: { label: 'Declined', className: 'bg-rose-50 text-rose-700' },
  request_approval: { label: 'Asked approval', className: 'bg-amber-50 text-amber-700' },
  withdraw: { label: 'Withdrew', className: 'bg-slate-100 text-slate-600' },
  adjust_stock: { label: 'Stock adjusted', className: 'bg-violet-50 text-violet-700' },
  import: { label: 'Imported', className: 'bg-sky-50 text-sky-700' },
  export: { label: 'Exported', className: 'bg-sky-50 text-sky-700' },
  upload: { label: 'Uploaded', className: 'bg-sky-50 text-sky-700' },
  pay: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700' },
  email: { label: 'Emailed', className: 'bg-sky-50 text-sky-700' },
  reset_password: { label: 'Password reset', className: 'bg-amber-50 text-amber-700' },
  mark_attendance: { label: 'Attendance', className: 'bg-teal-50 text-teal-700' },
  check_in: { label: 'Checked in', className: 'bg-teal-50 text-teal-700' },
  check_out: { label: 'Checked out', className: 'bg-teal-50 text-teal-700' },
};

const ENTITIES: Record<string, string> = {
  Transaction: 'Documents', Party: 'Parties', PartyGroup: 'Party groups', Item: 'Items', Category: 'Item categories', Unit: 'Units', BankAccount: 'Bank accounts', BankEntry: 'Cash & bank entries',
  ExpenseCategory: 'Expense categories', Employee: 'Employees', Attendance: 'Attendance', HrRequest: 'Leave & advances', Payroll: 'Payroll', User: 'Users & sign-ins', Role: 'Roles', Settings: 'Settings',
  Company: 'Company profile', Email: 'Emails', Report: 'Reports',
};

function entityHref(r: AuditRow) {
  if (!r.entityId || r.action === 'delete') return null;
  switch (r.entity) {
    case 'Transaction':
      return `/txn/${r.entityId}`;
    case 'Party':
      return `/parties?party=${r.entityId}`;
    case 'Item':
      return `/items?item=${r.entityId}`;
    case 'Employee':
      return `/hr/employees?employee=${r.entityId}`;
    case 'BankAccount':
      return `/cash-bank?account=${r.entityId}`;
    case 'Role':
      return `/roles?role=${r.entityId}`;
    default:
      return null;
  }
}

function dayHeading(d: string) {
  const day = dayjs(d).startOf('day');
  const today = dayjs().startOf('day');
  if (day.isSame(today)) return 'Today';
  if (day.isSame(today.subtract(1, 'day'))) return 'Yesterday';
  return day.format('dddd, D MMMM YYYY');
}

function Details({ id }: { id: string }) {
  const { cid } = useCompany();
  const q = useQuery({ queryKey: [cid, 'audit', 'detail', id], queryFn: async () => (await api.get<AuditRow>(`/system/audit/${id}`)).data, staleTime: Infinity });
  if (q.isLoading) return <Skeleton className="h-16" />;
  const r = q.data;
  if (!r) return null;
  return (
    <div className="space-y-2">
      {r.before || r.after ? <ChangeList before={r.before} after={r.after} /> : <p className="text-xs text-slate-400">No field level details for this entry.</p>}
      {(r.ip || r.userAgent) && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Monitor className="h-3 w-3" /> {[r.ip, r.userAgent?.slice(0, 120)].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const { cid, can, href } = useCompany();
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange('this_month'));
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<string | null>(null);
  // Other pages deep link here with a filter, e.g. Settings ▸ Backup opens ?entity=Settings
  const initial = useSearchParams();
  const [entity, setEntity] = useState(() => initial.get('entity') ?? '');
  const [action, setAction] = useState(() => initial.get('action') ?? '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const debounced = useDebounce(search, 350);
  const users = useUsers();
  const activeUsers = useQuery({
    queryKey: [cid, 'audit', 'users'],
    queryFn: async () => (await api.get<{ _id: string; name: string }[]>('/system/audit/users')).data,
    enabled: can('audit.view') && can('users.manage'),
    staleTime: 60_000,
  });
  // Users of this company plus anyone from another company who switched in and did something here
  const userOptions = useMemo(() => {
    const own = (users.data ?? []).map((u) => ({ value: u._id, label: u.name, hint: u.role?.name }));
    const ownIds = new Set(own.map((o) => o.value));
    const visitors = (activeUsers.data ?? []).filter((u) => !ownIds.has(u._id)).map((u) => ({ value: u._id, label: u.name, hint: 'Other company' }));
    return [...own, ...visitors];
  }, [users.data, activeUsers.data]);

  const q = useQuery({
    queryKey: [cid, 'audit', range.from, range.to, debounced, user, entity, action, page],
    queryFn: async () => api.get<AuditRow[]>('/system/audit', { from: range.from, to: range.to, search: debounced, user: user ?? undefined, entity: entity || undefined, action: action || undefined, page, limit: 50 }),
    enabled: can('audit.view'),
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const groups = useMemo(() => {
    const m = new Map<string, AuditRow[]>();
    for (const r of rows) {
      const k = dayjs(r.createdAt).format('YYYY-MM-DD');
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [rows]);

  if (!can('audit.view')) return <NoAccess what="the activity log" />;
  const meta = q.data?.meta as { total: number; pages: number } | undefined;
  const reset = () => setPage(1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity log"
        description="Everything your team did in this company: who, what and when, with before and after values."
        actions={
          can('reports.view') && (
            <Link href={href(`/reports/activity?from=${range.from}&to=${range.to}`)} className={buttonClass({ variant: 'outline' })}>
              <FileSpreadsheet className="h-4 w-4" /> Export report
            </Link>
          )
        }
      />
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              reset();
            }}
            placeholder="Search activity"
            className="w-full sm:w-56"
          />
          <DateRangeFilter
            value={range}
            onChange={(v) => {
              setRange(v);
              reset();
            }}
          />
          {can('users.manage') && (
            <Combobox
              value={user}
              onChange={(v) => {
                setUser(v);
                reset();
              }}
              options={userOptions}
              placeholder="All users"
              searchPlaceholder="Search users"
              clearable
              className="w-full sm:w-48"
            />
          )}
          <Select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              reset();
            }}
            className="w-full sm:w-44"
            aria-label="Area"
          >
            <option value="">All areas</option>
            {Object.entries(ENTITIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              reset();
            }}
            className="w-full sm:w-40"
            aria-label="Action"
          >
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>

        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="No activity found" description="Try a wider date range or clear the filters." />
        ) : (
          <div>
            {groups.map(([day, list]) => (
              <section key={day}>
                <p className="sticky top-0 z-[1] border-y border-slate-100 bg-slate-50/95 px-4 py-1.5 text-xs font-semibold text-slate-500 backdrop-blur">
                  {dayHeading(day)} <span className="font-normal text-slate-400">· {fmtDate(day)}</span>
                </p>
                <ul className="divide-y divide-slate-50">
                  {list.map((r) => {
                    const a = ACTIONS[r.action] ?? { label: r.action, className: 'bg-slate-100 text-slate-600' };
                    const link = entityHref(r);
                    const isOpen = open === r._id;
                    return (
                      <li key={r._id} className={cn('px-4 py-2.5', isOpen && 'bg-slate-50/60')}>
                        <div className="flex items-start gap-3">
                          <span className="w-[60px] shrink-0 pt-1.5 text-xs whitespace-nowrap text-slate-400 tabular-nums">{dayjs(r.createdAt).format('hh:mm A')}</span>
                          <Avatar name={r.userName ?? 'System'} className="mt-0.5 h-7 w-7 text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800">
                              <span className="font-medium">{r.userName ?? 'System'}</span>
                              <span className={cn('mx-2 inline-flex rounded-full px-2 py-0.5 align-middle text-[11px] font-medium', a.className)}>{a.label}</span>
                              <span className="text-slate-600">{r.label}</span>
                            </p>
                            <p className="text-[11px] text-slate-400">{ENTITIES[r.entity] ?? r.entity}</p>
                            {isOpen && (
                              <div className="mt-2 rounded-lg border border-slate-100 bg-white p-3">
                                <Details id={r._id} />
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {link && (
                              <Link href={href(link)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Open" aria-label="Open record">
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            )}
                            <button type="button" onClick={() => setOpen(isOpen ? null : r._id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Show details" aria-expanded={isOpen}>
                              <ChevronDown className={cn('h-4 w-4 transition', isOpen && 'rotate-180')} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {meta && <Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
