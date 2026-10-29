'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, FileSpreadsheet, HandCoins, Landmark, MoreVertical, Pencil, Percent, Plus, Receipt, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { LoanAccount, LoanEntryKind, LoanStatementRow } from '@/lib/types';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, money, plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { DateRangeFilter, defaultRange, type DateRangeValue } from '@/components/ui/date-range';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, NoAccess, PageHeader, Skeleton } from '@/components/ui/misc';
import { LoanEntryModal, LoanModal } from '@/components/finance/loan-modals';

interface LoanStatement {
  totals: { outstanding: number; taken: number; principalPaid: number; interestPaid: number; charges: number };
  rows: LoanStatementRow[];
}

const KIND_TONE: Record<LoanStatementRow['kind'], string> = {
  opening: 'text-emerald-700',
  increase: 'text-emerald-700',
  payment: 'text-blue-700',
  charge: 'text-amber-700',
  fee: 'text-amber-700',
};
/** Lines that bring money into an account; the rest are paid out */
const RECEIVED = new Set<LoanStatementRow['kind']>(['opening', 'increase']);

/** Business loans: EMIs split into principal and interest, extra loan taken and charges, with what is still owed. */
export default function LoansPage() {
  const { cid, can } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange('all'));
  const [loanModal, setLoanModal] = useState<{ open: boolean; loan?: LoanAccount | null }>({ open: false });
  const [entryModal, setEntryModal] = useState<{ open: boolean; kind: LoanEntryKind; entry?: LoanStatementRow | null }>({ open: false, kind: 'payment' });
  const [exporting, setExporting] = useState(false);

  const list = useQuery({
    queryKey: [cid, 'loans', 'list'],
    queryFn: async () => api.get<LoanAccount[]>('/finance/loans'),
    enabled: can('cash_bank.view'),
  });
  const loans = useMemo(() => list.data?.data ?? [], [list.data]);
  const wanted = params.get('loan');
  const selectedId = wanted ?? loans[0]?._id ?? null;
  const selected = loans.find((l) => l._id === selectedId) ?? null;

  useEffect(() => {
    // Keep the URL pointing at a real loan (e.g. after a delete)
    if (wanted && list.isSuccess && !loans.some((l) => l._id === wanted)) router.replace(pathname, { scroll: false });
  }, [wanted, list.isSuccess, loans, pathname, router]);

  const statement = useQuery({
    queryKey: [cid, 'loans', 'statement', selectedId, range.from, range.to],
    queryFn: async () => (await api.get<LoanStatement>(`/finance/loans/${selectedId}/statement`, { from: range.from, to: range.to })).data,
    enabled: !!selected && can('cash_bank.view'),
    // Keep the old lines while the dates change, but never show one loan's lines under another
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[3] === selectedId ? prev : undefined),
  });

  const delLoan = useMutation({
    mutationFn: (l: LoanAccount) => api.del(`/finance/loans/${l._id}`),
    onSuccess: (_r, l) => {
      invalidateCompany(qc, cid, l._id);
      toast.success(`${l.name} deleted`);
      router.replace(pathname, { scroll: false });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delEntry = useMutation({
    mutationFn: (r: LoanStatementRow) => api.del(`/finance/loans/entries/${r._id}`),
    onSuccess: (_r, r) => {
      invalidateCompany(qc, cid, r._id);
      toast.success(`${r.label} entry deleted`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('cash_bank.view')) return <NoAccess what="loan accounts" />;
  const manage = can('cash_bank.manage');
  const summary = list.data?.meta?.summary as { outstanding: number; interestPaid: number } | undefined;
  const running = loans.filter((l) => l.balance > 0.005).length;
  const select = (id: string) => router.replace(`${pathname}?loan=${id}`, { scroll: false });
  const totals = statement.data?.totals;
  const rows = statement.data?.rows ?? [];
  // Everything borrowed and what is owed now, for the EMI suggestion and the repaid bar
  const taken = totals?.taken ?? selected?.openingBalance ?? 0;
  const owed = selected?.balance ?? 0;
  const repaid = taken > 0 ? Math.min(100, Math.max(0, ((selected?.principalPaid ?? 0) / taken) * 100)) : 0;

  const newEntry = (kind: LoanEntryKind) => setEntryModal({ open: true, kind, entry: null });
  const editRow = (r: LoanStatementRow) => (r.entry ? setEntryModal({ open: true, kind: r.kind as LoanEntryKind, entry: r }) : setLoanModal({ open: true, loan: selected }));

  const askDeleteLoan = async (l: LoanAccount) => {
    if (
      await confirm({
        title: `Delete ${l.name}?`,
        message: 'The loan and all its EMIs, extra loan and charges are removed, and cash, bank, profit and loss and the balance sheet are recalculated. This cannot be undone.',
        danger: true,
        confirmText: 'Delete loan',
      })
    )
      delLoan.mutate(l);
  };
  const askDeleteEntry = async (r: LoanStatementRow) => {
    if (await confirm({ title: `Delete this ${r.label.toLowerCase()} entry?`, message: `${money(r.amount)} on ${fmtDate(r.date)} is removed and the loan, cash and bank balances are recalculated.`, danger: true, confirmText: 'Delete' }))
      delEntry.mutate(r);
  };

  const exportXlsx = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      await api.download('/reports/loan-statement/export', { format: 'xlsx', loan: selected._id, from: range.from, to: range.to }, 'Loan-statement.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Loan Accounts"
        description="Business loans with every EMI split into principal and interest. Interest and charges are expenses in profit and loss; what is still owed is a liability in the balance sheet."
        actions={
          manage && (
            <Button onClick={() => setLoanModal({ open: true, loan: null })}>
              <Plus className="h-4 w-4" /> Add loan
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Still owed on loans" value={money(summary?.outstanding)} tone="red" icon={<HandCoins className="h-5 w-5" />} />
        <StatCard label="Interest paid so far" value={money(summary?.interestPaid)} tone="amber" icon={<Percent className="h-5 w-5" />} />
        <StatCard label="Loan accounts" value={loans.length.toLocaleString('en-IN')} hint={list.isSuccess ? `${running.toLocaleString('en-IN')} being repaid` : undefined} tone="blue" icon={<Landmark className="h-5 w-5" />} />
      </div>

      {list.isSuccess && loans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandCoins className="h-6 w-6" />}
            title="No loan accounts yet"
            description="Add a business loan to track EMIs, interest, extra loan and charges, and see what is still owed at any time."
            action={
              manage && (
                <Button onClick={() => setLoanModal({ open: true, loan: null })}>
                  <Plus className="h-4 w-4" /> Add loan
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="self-start">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Loans</div>
            <div className="p-1.5">
              {list.isLoading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="m-2 h-12" />
                ))}
              {loans.map((l) => {
                const on = l._id === selectedId;
                const closed = l.balance <= 0.005;
                return (
                  <button key={l._id} type="button" onClick={() => select(l._id)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', on ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', closed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                      <HandCoins className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', on ? 'font-semibold text-blue-800' : 'font-medium text-slate-800')}>{l.name}</span>
                      <span className="block truncate text-xs text-slate-500">{[l.lender, l.interestRate ? `${l.interestRate}%` : null].filter(Boolean).join(' · ') || 'Loan'}</span>
                    </span>
                    {closed ? <Badge tone="green">Repaid</Badge> : <span className="text-sm font-semibold text-slate-900 tabular-nums">{money(l.balance)}</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            {selected && (
              <>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                        {selected.interestRate > 0 && <Badge tone="amber">{selected.interestRate}% a year</Badge>}
                        {selected.termMonths > 0 && <Badge tone="slate">{plural(selected.termMonths, 'month')}</Badge>}
                        {owed <= 0.005 && <Badge tone="green">Fully repaid</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
                        {selected.lender && <span>{selected.lender}</span>}
                        {selected.accountNumber && <span>A/c {selected.accountNumber}</span>}
                        <span>
                          {money(selected.openingBalance)} on {fmtDate(selected.openingDate)}
                          {selected.receivedIn ? ` into ${selected.receivedIn.name}` : ''}
                        </span>
                        {!!selected.processingFee && (
                          <span>
                            Processing fee {money(selected.processingFee)}
                            {selected.feePaidFrom ? ` from ${selected.feePaidFrom.name}` : ''}
                          </span>
                        )}
                      </div>
                      {selected.description && <p className="mt-1.5 text-sm text-slate-600">{selected.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Still owed</p>
                        <p className={cn('text-2xl font-semibold tabular-nums', owed > 0.005 ? 'text-rose-700' : 'text-emerald-700')}>{money(owed)}</p>
                      </div>
                      {manage && (
                        <>
                          {owed > 0.005 && (
                            <Button onClick={() => newEntry('payment')} className="hidden sm:inline-flex">
                              Pay EMI
                            </Button>
                          )}
                          <Dropdown>
                            <DropdownTrigger asChild>
                              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Loan options">
                                <MoreVertical className="h-5 w-5" />
                              </button>
                            </DropdownTrigger>
                            <DropdownContent>
                              <DropdownItem icon={<HandCoins className="h-4 w-4" />} onSelect={() => newEntry('payment')} disabled={owed <= 0.005}>
                                Pay EMI
                              </DropdownItem>
                              <DropdownItem icon={<ArrowDownLeft className="h-4 w-4" />} onSelect={() => newEntry('increase')}>
                                Take more loan
                              </DropdownItem>
                              <DropdownItem icon={<Receipt className="h-4 w-4" />} onSelect={() => newEntry('charge')}>
                                Record charges
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setLoanModal({ open: true, loan: selected })}>
                                Edit loan
                              </DropdownItem>
                              <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => askDeleteLoan(selected)}>
                                Delete loan
                              </DropdownItem>
                            </DropdownContent>
                          </Dropdown>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Principal repaid {money(selected.principalPaid)} of {money(taken)}
                      </span>
                      <span>
                        {selected.termMonths > 0 ? `${selected.payments.toLocaleString('en-IN')} of ${plural(selected.termMonths, 'EMI')} paid` : plural(selected.payments, 'EMI') + ' paid'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Principal repaid" aria-valuenow={Math.round(repaid)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${repaid}%` }} />
                    </div>
                  </div>
                  {manage && owed > 0.005 && (
                    <Button onClick={() => newEntry('payment')} className="mt-4 w-full sm:hidden">
                      Pay EMI
                    </Button>
                  )}
                </Card>

                <Card className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
                    <DateRangeFilter value={range} onChange={setRange} />
                    <div className="flex-1" />
                    {can('reports.export') && (
                      <Button variant="outline" size="sm" onClick={exportXlsx} loading={exporting}>
                        {!exporting && <FileSpreadsheet className="h-4 w-4" />} Excel
                      </Button>
                    )}
                  </div>
                  {totals && (
                    <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
                      {(
                        [
                          ['Loan taken', totals.taken, 'text-slate-900'],
                          ['Principal repaid', totals.principalPaid, 'text-emerald-700'],
                          ['Interest paid', totals.interestPaid, 'text-amber-700'],
                          ['Charges & fees', totals.charges, 'text-amber-700'],
                        ] as const
                      ).map(([label, value, cls]) => (
                        <div key={label} className="bg-white px-4 py-3">
                          <p className="text-xs text-slate-500">{label}</p>
                          <p className={cn('text-base font-semibold tabular-nums', cls)}>{money(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {statement.isLoading ? (
                    <div className="space-y-2 p-5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9" />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <EmptyState icon={<HandCoins className="h-6 w-6" />} title="Nothing in this period" description="EMIs, extra loan and charges on this loan appear here. Pick All Time to see the whole loan." />
                  ) : (
                    <div className="relative overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500">
                          <tr>
                            <th className="px-2.5 py-2.5 pl-5 font-medium">Date</th>
                            <th className="px-2.5 py-2.5 font-medium">Type</th>
                            <th className="px-2.5 py-2.5 text-right font-medium">Principal</th>
                            <th className="px-2.5 py-2.5 text-right font-medium">Interest</th>
                            <th className="px-2.5 py-2.5 text-right font-medium">Amount</th>
                            <th className="px-2.5 py-2.5 text-right font-medium">Still owed</th>
                            <th className="w-16 px-2 py-2.5 pr-4">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((r) => (
                            <tr key={r._id} className="align-top">
                              <td className="px-2.5 py-2.5 pl-5 whitespace-nowrap text-slate-600">{fmtDate(r.date)}</td>
                              <td className="px-2.5 py-2.5">
                                <span className={cn('font-medium whitespace-nowrap', KIND_TONE[r.kind])}>{r.label}</span>
                                <span className="block max-w-[260px] truncate text-xs text-slate-500">
                                  {[r.account ? `${RECEIVED.has(r.kind) ? 'Into' : 'From'} ${r.account.name}` : 'Opening balance only', r.description].filter(Boolean).join(' · ')}
                                </span>
                              </td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">{r.kind === 'payment' ? money(r.principal) : ''}</td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">{r.kind === 'payment' ? money(r.interest) : ''}</td>
                              <td className={cn('px-2.5 py-2.5 text-right font-medium whitespace-nowrap tabular-nums', RECEIVED.has(r.kind) ? 'text-emerald-700' : 'text-rose-700')}>
                                {RECEIVED.has(r.kind) ? '+' : '−'}
                                {money(r.amount)}
                              </td>
                              <td className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">{money(r.balance)}</td>
                              <td className="px-2 py-1.5 pr-4 text-right whitespace-nowrap">
                                {manage && (
                                  <>
                                    <button type="button" onClick={() => editRow(r)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={r.entry ? `Edit ${r.label}` : 'Edit loan'} title={r.entry ? 'Edit' : 'Edit loan'}>
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    {r.entry && (
                                      <button type="button" onClick={() => askDeleteEntry(r)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${r.label}`} title="Delete">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <LoanModal open={loanModal.open} loan={loanModal.loan} onOpenChange={(o) => setLoanModal((x) => ({ ...x, open: o }))} onSaved={(id) => select(id)} />
      <LoanEntryModal open={entryModal.open} kind={entryModal.kind} entry={entryModal.entry} loan={selected} owed={owed} taken={taken} onOpenChange={(o) => setEntryModal((x) => ({ ...x, open: o }))} />
    </div>
  );
}
