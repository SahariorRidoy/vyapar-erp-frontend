'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, MoreVertical, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Txn } from '@/lib/types';
import { newTxnHref } from '@/lib/txn';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, money } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useResetOn } from '@/hooks/use-reset-on';
import { useExpenseCategories, type ExpenseCategoryRow } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { DateRangeFilter, defaultRange, type DateRangeValue } from '@/components/ui/date-range';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, NoAccess, PageHeader, Pagination, SearchInput, Skeleton } from '@/components/ui/misc';
import { TxnTable } from './txn-table';
import { ExpenseCategoryModal } from './expense-category-modal';

const ALL = 'all';

/** Expenses: categories with their spend on the left, the selected category's expenses on the right. */
export function ExpensesPage() {
  const { cid, href, can } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange('this_month'));
  const [catSearch, setCatSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [catModal, setCatModal] = useState<{ open: boolean; category?: ExpenseCategoryRow | null }>({ open: false });
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search);
  const selected = params.get('category') ?? ALL;

  const cats = useExpenseCategories({ from: range.from, to: range.to });
  useResetOn(`${selected}|${debounced}|${range.from}|${range.to}`, () => setPage(1));
  const list = useQuery({
    queryKey: [cid, 'transactions', 'list', 'EXPENSE', selected, debounced, range.from, range.to, page],
    queryFn: async () =>
      api.get<Txn[]>('/transactions', { type: 'EXPENSE', expenseCategory: selected === ALL ? undefined : selected, search: debounced, from: range.from, to: range.to, page, limit: 50 }),
    placeholderData: (prev) => prev,
    enabled: can('expense.view'),
  });

  const categories = useMemo(() => cats.data ?? [], [cats.data]);
  const current = categories.find((c) => c._id === selected) ?? null;
  const grand = useMemo(() => categories.reduce((s, c) => ({ total: s.total + c.total, balance: s.balance + c.balance, count: s.count + c.count }), { total: 0, balance: 0, count: 0 }), [categories]);
  const visibleCats = categories.filter((c) => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()));
  const ranked = useMemo(() => [...categories].filter((c) => c.total > 0).sort((a, b) => b.total - a.total), [categories]);

  const select = (id: string) => {
    const q = new URLSearchParams(params.toString());
    if (id === ALL) q.delete('category');
    else q.set('category', id);
    const s = q.toString();
    router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
  };

  const remove = useMutation({
    mutationFn: (c: ExpenseCategoryRow) => api.del(`/finance/expense-categories/${c._id}`),
    onSuccess: (_r, c) => {
      invalidateCompany(qc, cid, c._id);
      toast.success(`Category "${c.name}" deleted`);
      if (selected === c._id) select(ALL);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const askDelete = async (c: ExpenseCategoryRow) => {
    if (c.count > 0) return toast.error(`"${c.name}" has expenses in this period. Move or delete them first.`);
    if (await confirm({ title: `Delete "${c.name}"?`, message: 'The category is removed. Expenses already recorded against it (in any period) prevent deletion.', danger: true, confirmText: 'Delete' })) remove.mutate(c);
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await api.download('/reports/expense/export', { format: 'xlsx', from: range.from, to: range.to, category: selected === ALL ? undefined : selected }, 'Expenses.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  if (!can('expense.view')) return <NoAccess what="expenses" />;
  const addHref = href(newTxnHref('EXPENSE', { category: current?._id }));
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Record business spending by category to see where money goes and how it affects profit."
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            {can('reports.export') && (
              <Button variant="outline" onClick={exportXlsx} loading={exporting}>
                {!exporting && <FileSpreadsheet className="h-4 w-4" />} Excel
              </Button>
            )}
            {can('expense.create') && (
              <Button onClick={() => router.push(addHref)}>
                <Plus className="h-4 w-4" /> Add Expense
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Categories */}
        <Card className="flex min-h-0 flex-col lg:max-h-[calc(100vh-11rem)]">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Categories</p>
              {can('expense.create') && (
                <Button size="sm" variant="outline" onClick={() => setCatModal({ open: true, category: null })}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              )}
            </div>
            <SearchInput value={catSearch} onChange={setCatSearch} placeholder="Search categories" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => select(ALL)}
              className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm', selected === ALL ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50')}
            >
              <span className="flex items-center gap-2 font-medium">
                <Wallet className="h-4 w-4 opacity-70" /> All expenses
              </span>
              <span className="font-semibold">{money(grand.total)}</span>
            </button>
            {cats.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="mx-2 my-2 h-9" />
              ))}
            {visibleCats.map((c) => (
              <div key={c._id} className={cn('group flex items-center rounded-lg', selected === c._id ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                <button type="button" onClick={() => select(c._id)} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-left text-sm">
                  <span className="min-w-0">
                    <span className={cn('block truncate', selected === c._id ? 'font-medium text-blue-800' : 'text-slate-800')}>{c.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {c.kind === 'direct' ? 'Direct' : 'Indirect'} · {c.count} {c.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-700">{money(c.total)}</span>
                </button>
                {(can('expense.edit') || can('expense.delete')) && (
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <button type="button" className="mr-1 rounded p-1 text-slate-400 opacity-60 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700" aria-label={`Options for ${c.name}`}>
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownTrigger>
                    <DropdownContent>
                      {can('expense.edit') && (
                        <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setCatModal({ open: true, category: c })}>
                          Edit category
                        </DropdownItem>
                      )}
                      {can('expense.delete') && (
                        <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => askDelete(c)}>
                          Delete category
                        </DropdownItem>
                      )}
                    </DropdownContent>
                  </Dropdown>
                )}
              </div>
            ))}
            {!cats.isLoading && visibleCats.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">{catSearch ? 'No category matches.' : 'No categories yet.'}</p>}
          </div>
        </Card>

        {/* Detail */}
        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{current ? current.name : 'All expenses'}</h2>
                  {current && <Badge tone={current.kind === 'direct' ? 'violet' : 'slate'}>{current.kind === 'direct' ? 'Direct expense' : 'Indirect expense'}</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{range.from || range.to ? `${fmtDate(range.from) || 'Beginning'} to ${fmtDate(range.to) || 'today'}` : 'All time'}</p>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Total spent</p>
                  <p className="text-lg font-semibold text-slate-900">{money(current ? current.total : grand.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Unpaid</p>
                  <p className={cn('text-lg font-semibold', (current ? current.balance : grand.balance) > 0 ? 'text-rose-600' : 'text-slate-900')}>{money(current ? current.balance : grand.balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Entries</p>
                  <p className="text-lg font-semibold text-slate-900">{current ? current.count : grand.count}</p>
                </div>
              </div>
            </div>
            {!current && ranked.length > 0 && <SpendBreakdown rows={ranked} total={grand.total} onSelect={select} />}
          </Card>

          <Card className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search number, item, note…" className="w-full sm:w-72" />
              {can('expense.create') && (
                <Button size="sm" variant="outline" onClick={() => router.push(addHref)}>
                  <Plus className="h-4 w-4" /> {current ? `Add to ${current.name}` : 'Add Expense'}
                </Button>
              )}
            </div>
            {list.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <>
                <TxnTable
                  rows={rows}
                  columns={current ? ['date', 'number', 'party', 'paymentType', 'total', 'balance', 'status', 'createdBy'] : ['date', 'number', 'category', 'party', 'paymentType', 'total', 'balance', 'status', 'createdBy']}
                  empty={
                    <EmptyState
                      icon={<Receipt className="h-6 w-6" />}
                      title="No expenses in this period"
                      description={debounced ? 'Try another search or date range.' : 'Record rent, salaries, electricity, transport and other spending here.'}
                      action={
                        can('expense.create') && (
                          <Button onClick={() => router.push(addHref)}>
                            <Plus className="h-4 w-4" /> Add Expense
                          </Button>
                        )
                      }
                    />
                  }
                />
                {rows.length > 0 && meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
              </>
            )}
          </Card>
        </div>
      </div>

      <ExpenseCategoryModal open={catModal.open} category={catModal.category} onOpenChange={(o) => setCatModal((c) => ({ ...c, open: o }))} onSaved={(c) => !catModal.category && select(c._id)} />
    </div>
  );
}

/** Share of spend per category: one hue, sorted bars with values, top 6 plus the rest folded into "Other". */
function SpendBreakdown({ rows, total, onSelect }: { rows: ExpenseCategoryRow[]; total: number; onSelect: (id: string) => void }) {
  const top = rows.slice(0, 6);
  const other = rows.slice(6).reduce((s, r) => s + r.total, 0);
  const max = Math.max(...top.map((r) => r.total), other, 1);
  const line = (key: string, label: string, value: number, onClick?: () => void) => (
    <button key={key} type="button" onClick={onClick} disabled={!onClick} className="group grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-left text-sm disabled:cursor-default">
      <span className="truncate text-slate-600 group-enabled:group-hover:text-blue-700">{label}</span>
      <span className="h-2.5 rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
      </span>
      <span className="w-36 text-right text-slate-800">
        {money(value)} <span className="text-xs text-slate-400">{total ? Math.round((value / total) * 100) : 0}%</span>
      </span>
    </button>
  );
  return (
    <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Spending by category</p>
      {top.map((r) => line(r._id, r.name, r.total, () => onSelect(r._id)))}
      {other > 0 && line('other', `Other (${rows.length - 6})`, other)}
    </div>
  );
}
