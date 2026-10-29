'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { ArrowLeft, FileDown, FileSpreadsheet, ListFilter, Printer } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { LoanAccount, TxnType } from '@/lib/types';
import { TXN, txnHref } from '@/lib/txn';
import { cn, fmtDate, money, num, presetRange } from '@/lib/utils';
import { useAccountOptions, useCategories, useEmployees, useExpenseCategories, useItems, useParties, usePartyGroups } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Select } from '@/components/ui/input';
import { DateRangeFilter, type DateRangeValue } from '@/components/ui/date-range';
import { EmptyState, NoAccess, Skeleton } from '@/components/ui/misc';
import { ReportNav } from '@/components/reports/report-nav';
import { useReportDefs, type ReportColumn, type ReportDef, type ReportFilter, type ReportResult } from '@/components/reports/defs';

const FILTER_LABEL: Record<ReportFilter, string> = {
  dateRange: 'period', asOf: 'date', party: 'party', item: 'item', category: 'category', account: 'account', employee: 'employee', month: 'month', txnType: 'type', group: 'party group', user: 'user', loan: 'loan',
};
/** Reports that read best over their whole history open on All Time instead of this month */
const DEFAULT_PRESET: Record<string, string> = { 'loan-statement': 'all' };
const MAX_ROWS = 1000;

function formatCell(col: ReportColumn, v: unknown) {
  if (v === null || v === undefined || v === '') return '';
  switch (col.type) {
    case 'money':
      return money(Number(v));
    case 'number':
      return num(Number(v), 3);
    case 'percent':
      return `${num(Number(v), 2)}%`;
    case 'date':
      return fmtDate(String(v));
    default:
      return String(v);
  }
}

const isNumeric = (c: ReportColumn) => c.type === 'money' || c.type === 'number' || c.type === 'percent';

export default function ReportViewerPage() {
  const { key } = useParams<{ key: string }>();
  const { cid, can, href } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defs = useReportDefs();
  const def: ReportDef | undefined = defs.data?.find((d) => d.key === key);
  const has = (f: ReportFilter) => !!def?.filters.includes(f);

  // Filters live in the URL so a report can be bookmarked or shared.
  const initialRange = (): DateRangeValue => {
    const from = params.get('from');
    const to = params.get('to');
    if (from !== null || to !== null) return { preset: params.get('preset') ?? 'custom', from: from ?? '', to: to ?? '' };
    const preset = DEFAULT_PRESET[key] ?? 'this_month';
    return { preset, ...presetRange(preset) };
  };
  const [range, setRange] = useState<DateRangeValue>(initialRange);
  const [asOf, setAsOf] = useState(params.get('to') ?? dayjs().format('YYYY-MM-DD'));
  const [month, setMonth] = useState(params.get('month') ?? dayjs().format('YYYY-MM'));
  const [party, setParty] = useState<string | null>(params.get('party'));
  const [item, setItem] = useState<string | null>(params.get('item'));
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [account, setAccount] = useState(params.get('account') ?? '');
  const [employee, setEmployee] = useState<string | null>(params.get('employee'));
  const [group, setGroup] = useState(params.get('group') ?? '');
  const [user, setUser] = useState(params.get('user') ?? '');
  const [type, setType] = useState(params.get('type') ?? '');
  const [loan, setLoan] = useState(params.get('loan') ?? '');
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
  const [showAll, setShowAll] = useState(false);

  const query = useMemo(() => {
    if (!def) return null;
    const q: Record<string, string | undefined> = {};
    if (has('dateRange')) Object.assign(q, { from: range.from || undefined, to: range.to || undefined });
    if (has('asOf')) q.to = asOf || undefined;
    if (has('month')) q.month = month || undefined;
    if (has('party')) q.party = party ?? undefined;
    if (has('item')) q.item = item ?? undefined;
    if (has('category')) q.category = category || undefined;
    if (has('account')) q.account = account || undefined;
    if (has('employee')) q.employee = employee ?? undefined;
    if (has('group')) q.group = group || undefined;
    if (has('user')) q.user = user || undefined;
    if (has('txnType')) q.type = type || undefined;
    if (has('loan')) q.loan = loan || undefined;
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, range.from, range.to, asOf, month, party, item, category, account, employee, group, user, type, loan]);

  useEffect(() => {
    if (!query) return;
    const s = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
    if (has('dateRange') && range.preset !== 'custom') s.set('preset', range.preset);
    const next = s.toString();
    if (next !== params.toString()) router.replace(`${pathname}${next ? `?${next}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const missing = def?.required?.filter((f) => {
    const map: Partial<Record<ReportFilter, unknown>> = { party, item, account: account || null, employee, category: category || null, month: month || null, loan: loan || null };
    return !map[f];
  }) ?? [];

  const result = useQuery({
    queryKey: [cid, 'reports', key, query],
    queryFn: async () => (await api.get<ReportResult>(`/reports/${key}`, query ?? undefined)).data,
    enabled: !!def && !!query && missing.length === 0,
    placeholderData: (prev) => prev,
  });

  // Option sources, loaded only for the filters this report uses
  const parties = useParties(has('party'));
  const items = useItems(has('item'));
  const itemCats = useCategories(has('category') && def?.group !== 'Expense');
  const expCats = useExpenseCategories();
  const accounts = useAccountOptions();
  const employees = useEmployees(has('employee'));
  const groups = usePartyGroups(has('group'));
  const users = useQuery({
    queryKey: [cid, 'users', 'options'],
    queryFn: async () => (await api.get<{ _id: string; name: string }[]>('/users')).data,
    enabled: has('user') && can('users.manage'),
  });
  const loans = useQuery({
    queryKey: [cid, 'loans', 'list'],
    queryFn: async () => api.get<LoanAccount[]>('/finance/loans'),
    enabled: has('loan') && can('cash_bank.view'),
  });

  if (!can('reports.view')) return <NoAccess what="reports" />;

  const exportAs = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      await api.download(`/reports/${key}/export`, { ...(query ?? {}), format }, `${key}.${format}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const data = result.data;
  const rows = data?.rows ?? [];
  const visible = showAll ? rows : rows.slice(0, MAX_ROWS);
  const columns = data?.columns ?? [];
  const groupKey = columns[0]?.key === 'section' ? 'section' : null;
  const rowLink = (r: Record<string, unknown>) => {
    const id = r._id as string | undefined;
    if (!id) return null;
    if (r.txnType && (r.txnType as string) in TXN) return href(txnHref(r.txnType as TxnType, id));
    if (def?.group === 'Party') return href(`/parties?party=${id}`);
    if (def?.group === 'Item / Stock') return href(`/items?item=${id}`);
    return null;
  };
  const periodText = has('dateRange')
    ? range.from || range.to
      ? `${range.from ? fmtDate(range.from) : 'Beginning'} – ${range.to ? fmtDate(range.to) : 'Today'}`
      : 'All time'
    : has('asOf')
      ? `As of ${fmtDate(asOf)}`
      : has('month')
        ? dayjs(`${month}-01`).format('MMMM YYYY')
        : '';
  const categoryOptions = def?.group === 'Expense' ? (expCats.data ?? []).map((c) => ({ _id: c._id, name: c.name })) : (itemCats.data?.categories ?? []).map((c) => ({ _id: c._id, name: c.name }));

  return (
    <div className="flex gap-4">
      <aside className="no-print hidden w-64 shrink-0 xl:block">
        <Card className="sticky top-0 h-[calc(100vh-6.5rem)] overflow-hidden">
          <ReportNav active={key} className="h-full" />
        </Card>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href('/reports')} className="no-print mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600">
              <ArrowLeft className="h-3.5 w-3.5" /> All reports
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{def?.title ?? (defs.isLoading ? 'Loading…' : 'Report not found')}</h1>
            <p className="text-sm text-slate-500">
              {def?.description}
              {periodText && <span className="hidden print:inline"> · {periodText}</span>}
            </p>
          </div>
          {def && (
            <div className="no-print flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.print()} disabled={!data}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              {can('reports.export') && (
                <>
                  <Button variant="outline" onClick={() => exportAs('csv')} loading={exporting === 'csv'} disabled={!data}>
                    {exporting !== 'csv' && <FileDown className="h-4 w-4" />} CSV
                  </Button>
                  <Button onClick={() => exportAs('xlsx')} loading={exporting === 'xlsx'} disabled={!data}>
                    {exporting !== 'xlsx' && <FileSpreadsheet className="h-4 w-4" />} Excel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {!defs.isLoading && !def && (
          <Card>
            <EmptyState title="Report not available" description="It does not exist or your role cannot open it." action={<Link href={href('/reports')} className="text-sm font-medium text-blue-600 hover:underline">Back to reports</Link>} />
          </Card>
        )}

        {def && def.filters.length > 0 && (
          <Card className="no-print flex flex-wrap items-center gap-2 p-3">
            <ListFilter className="h-4 w-4 text-slate-400" />
            {has('dateRange') && <DateRangeFilter value={range} onChange={setRange} />}
            {has('asOf') && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                As of <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
              </label>
            )}
            {has('month') && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" aria-label="Month" />}
            {has('party') && (
              <Combobox
                value={party}
                onChange={setParty}
                options={(parties.data ?? []).map((p) => ({ value: p._id, label: p.name, hint: p.phone }))}
                placeholder={def.required?.includes('party') ? 'Select party' : 'All parties'}
                clearable
                className="w-full sm:w-56"
                invalid={missing.includes('party')}
              />
            )}
            {has('item') && (
              <Combobox
                value={item}
                onChange={setItem}
                options={(items.data ?? []).map((i) => ({ value: i._id, label: i.name, hint: i.code }))}
                placeholder={def.required?.includes('item') ? 'Select item' : 'All items'}
                clearable
                className="w-full sm:w-56"
                invalid={missing.includes('item')}
              />
            )}
            {has('category') && (
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full sm:w-48" aria-label="Category">
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            {has('account') && (
              <Select value={account} onChange={(e) => setAccount(e.target.value)} className={cn('w-full sm:w-52', missing.includes('account') && 'border-rose-400')} aria-label="Account">
                <option value="">{def.required?.includes('account') ? 'Select account' : 'All accounts'}</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
            {has('loan') && (
              <Select value={loan} onChange={(e) => setLoan(e.target.value)} className={cn('w-full sm:w-56', missing.includes('loan') && 'border-rose-400')} aria-label="Loan">
                <option value="">{def.required?.includes('loan') ? 'Select loan' : 'All loans'}</option>
                {(loans.data?.data ?? []).map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
            {has('employee') && (
              <Combobox value={employee} onChange={setEmployee} options={(employees.data ?? []).map((e) => ({ value: e._id, label: e.name, hint: e.designation }))} placeholder="All employees" clearable className="w-full sm:w-56" />
            )}
            {has('group') && (
              <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-full sm:w-48" aria-label="Party group">
                <option value="">All groups</option>
                {(groups.data?.groups ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            {has('txnType') && (
              <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-48" aria-label="Transaction type">
                <option value="">All types</option>
                {Object.values(TXN).map((m) => (
                  <option key={m.type} value={m.type}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
            {has('user') && can('users.manage') && (
              <Select value={user} onChange={(e) => setUser(e.target.value)} className="w-full sm:w-44" aria-label="User">
                <option value="">All users</option>
                {(users.data ?? []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            )}
          </Card>
        )}

        {def && missing.length > 0 && (
          <Card>
            <EmptyState icon={<ListFilter className="h-6 w-6" />} title={`Select ${missing.map((f) => `a ${FILTER_LABEL[f]}`).join(' and ')} to run this report`} description="Use the filters above." />
          </Card>
        )}

        {def && missing.length === 0 && (
          <>
            {result.isError && (
              <Card>
                <EmptyState title="Could not run this report" description={errorMessage(result.error)} />
              </Card>
            )}
            {data?.summary && data.summary.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {data.summary.map((s) => (
                  <Card key={s.label} className="px-4 py-3">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className={cn('mt-0.5 text-lg font-semibold', typeof s.value === 'number' && s.value < 0 ? 'text-rose-600' : 'text-slate-900')}>
                      {s.type === 'money' ? money(Number(s.value)) : s.type === 'number' ? num(Number(s.value), 3) : String(s.value)}
                    </p>
                  </Card>
                ))}
              </div>
            )}
            <Card className="min-w-0 print:border-0 print:shadow-none">
              {(result.isLoading || (result.isFetching && !data)) && (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8" />
                  ))}
                </div>
              )}
              {data && rows.length === 0 && <EmptyState title="Nothing to show" description="No records match these filters." />}
              {data && rows.length > 0 && (
                <>
                  <div className={cn('overflow-x-auto', result.isFetching && 'opacity-60 transition-opacity')}>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          {columns.map((c) => (
                            <th key={c.key} className={cn('px-3 py-2.5 font-medium whitespace-nowrap first:pl-5 last:pr-5', isNumeric(c) && 'text-right')}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((r, i) => {
                          const link = rowLink(r);
                          const strong = !!r.strong;
                          const info = r.section === 'info';
                          const newGroup = groupKey && (i === 0 || visible[i - 1][groupKey] !== r[groupKey]);
                          return (
                            <tr
                              key={i}
                              onClick={link ? () => router.push(link) : undefined}
                              className={cn(link && 'cursor-pointer hover:bg-blue-50/40', strong && 'bg-slate-50 font-semibold text-slate-900', info && 'text-slate-400 italic', newGroup && i > 0 && 'border-t-2 border-slate-200')}
                            >
                              {columns.map((c) => {
                                const v = r[c.key];
                                const negative = c.type === 'money' && Number(v) < 0;
                                return (
                                  <td key={c.key} className={cn('px-3 py-2 whitespace-nowrap first:pl-5 last:pr-5', isNumeric(c) && 'text-right tabular-nums', negative && !info && 'text-rose-600', c.key === groupKey && !newGroup && 'text-transparent')}>
                                    {formatCell(c, v)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                      {data.totals && Object.keys(data.totals).length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                            {columns.map((c, i) => (
                              <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap first:pl-5 last:pr-5', isNumeric(c) && 'text-right tabular-nums')}>
                                {i === 0 && !(c.key in (data.totals ?? {})) ? 'Total' : formatCell(c, data.totals?.[c.key])}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  <div className="no-print flex items-center justify-between px-5 py-3 text-xs text-slate-500">
                    <span>
                      {rows.length} row{rows.length === 1 ? '' : 's'}
                      {data.subtitle ? ` · ${data.subtitle}` : ''}
                    </span>
                    {rows.length > MAX_ROWS && !showAll && (
                      <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => setShowAll(true)}>
                        Show all {rows.length} rows
                      </button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
