'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Building2, FileSpreadsheet, Landmark, MoreVertical, Pencil, Plus, Smartphone, Trash2, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { BankAccount, TxnType } from '@/lib/types';
import { TXN, txnHref } from '@/lib/txn';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, money } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { DateRangeFilter, defaultRange, type DateRangeValue } from '@/components/ui/date-range';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, NoAccess, PageHeader, SearchInput, Skeleton } from '@/components/ui/misc';
import { AccountModal } from '@/components/finance/account-modal';
import { EntryModal, type EntryKind } from '@/components/finance/entry-modal';

interface StatementRow {
  _id: string;
  kind: 'txn' | 'entry' | 'cheque' | 'loan';
  type: string;
  label: string;
  number: string;
  party?: string;
  date: string;
  amount: number;
  balance: number;
  /** The document the row opens (documents, and cleared cheques by their payment) */
  link?: { type: TxnType; id: string };
  loan?: string;
  /** Manual adjustments and transfers; cheques and loan entries are undone on their own screens */
  deletable: boolean;
}

const ROW_TONE: Record<StatementRow['kind'], string> = { txn: 'text-slate-700', entry: 'text-violet-700', cheque: 'text-sky-700', loan: 'text-amber-700' };
interface Statement {
  account: BankAccount;
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
  currentBalance: number;
  rows: StatementRow[];
}

const KIND_ICON = { cash: Banknote, bank: Landmark, wallet: Smartphone } as const;
const KIND_LABEL = { cash: 'Cash', bank: 'Bank', wallet: 'bKash / Nagad' } as const;

export default function CashBankPage() {
  const { cid, can, href } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange('this_month'));
  const [search, setSearch] = useState('');
  const [accountModal, setAccountModal] = useState<{ open: boolean; account?: BankAccount | null }>({ open: false });
  const [entry, setEntry] = useState<{ open: boolean; kind: EntryKind; account?: string | null }>({ open: false, kind: 'add' });
  const [exporting, setExporting] = useState(false);

  const list = useQuery({
    queryKey: [cid, 'accounts', 'list'],
    queryFn: async () => api.get<(BankAccount & { balance: number })[]>('/finance/accounts'),
    enabled: can('cash_bank.view'),
  });
  const accounts = useMemo(() => list.data?.data ?? [], [list.data]);
  const selectedId = params.get('account') ?? accounts[0]?._id ?? null;
  const selected = accounts.find((a) => a._id === selectedId) ?? null;
  const balances = useMemo(() => Object.fromEntries(accounts.map((a) => [a._id, a.balance])), [accounts]);

  useEffect(() => {
    // Keep the URL pointing at a real account (e.g. after a delete)
    if (params.get('account') && accounts.length && !accounts.some((a) => a._id === params.get('account'))) router.replace(pathname, { scroll: false });
  }, [accounts, params, pathname, router]);

  const statement = useQuery({
    queryKey: [cid, 'accounts', 'statement', selectedId, range.from, range.to],
    queryFn: async () => (await api.get<Statement>(`/finance/accounts/${selectedId}/statement`, { from: range.from, to: range.to })).data,
    enabled: !!selectedId && can('cash_bank.view'),
    placeholderData: (prev) => prev,
  });

  const delAccount = useMutation({
    mutationFn: (a: BankAccount) => api.del(`/finance/accounts/${a._id}`),
    onSuccess: (_r, a) => {
      invalidateCompany(qc, cid, a._id);
      toast.success(`${a.name} deleted`);
      router.replace(pathname, { scroll: false });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delEntry = useMutation({
    mutationFn: (id: string) => api.del(`/finance/entries/${id}`),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Entry deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('cash_bank.view')) return <NoAccess what="cash & bank" />;
  const summary = list.data?.meta?.summary as { cash: number; bank: number } | undefined;
  const manage = can('cash_bank.manage');
  const select = (id: string) => router.replace(`${pathname}?account=${id}`, { scroll: false });

  const rows = (statement.data?.rows ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || `${r.label} ${r.number} ${r.party ?? ''}`.toLowerCase().includes(q);
  });

  const exportXlsx = async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      await api.download('/reports/bank-statement/export', { format: 'xlsx', account: selectedId, from: range.from, to: range.to }, 'Account-statement.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const askDeleteAccount = async (a: BankAccount) => {
    if (await confirm({ title: `Delete ${a.name}?`, message: 'Accounts that already have payments or adjustments cannot be deleted. This cannot be undone.', danger: true, confirmText: 'Delete account' })) delAccount.mutate(a);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cash & Bank"
        description="Cash in hand, bank and bKash / Nagad balances with a running statement for every account."
        actions={
          manage && (
            <>
              <Button variant="outline" onClick={() => setEntry({ open: true, kind: 'transfer', account: selectedId })}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer
              </Button>
              <Button variant="outline" onClick={() => setEntry({ open: true, kind: 'add', account: selectedId })}>
                <Wallet className="h-4 w-4" /> Adjust balance
              </Button>
              <Button onClick={() => setAccountModal({ open: true, account: null })}>
                <Plus className="h-4 w-4" /> Add account
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Cash in hand" value={money(summary?.cash)} tone="green" icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Bank & mobile wallet balance" value={money(summary?.bank)} tone="blue" icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Total available" value={money((summary?.cash ?? 0) + (summary?.bank ?? 0))} tone="violet" icon={<Wallet className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="self-start">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Accounts</div>
          <div className="p-1.5">
            {list.isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="m-2 h-12" />
              ))}
            {accounts.map((a) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => select(a._id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', a._id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50')}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', a.kind === 'cash' ? 'bg-emerald-50 text-emerald-600' : a.kind === 'bank' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600')}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', a._id === selectedId ? 'font-semibold text-blue-800' : 'font-medium text-slate-800')}>{a.name}</span>
                    <span className="text-xs text-slate-500">
                      {KIND_LABEL[a.kind]}
                      {a.isDefault ? ' · default' : ''}
                    </span>
                  </span>
                  <span className={cn('text-sm font-semibold', a.balance < 0 ? 'text-rose-600' : 'text-slate-900')}>{money(a.balance)}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                      <Badge tone={selected.kind === 'cash' ? 'green' : selected.kind === 'bank' ? 'blue' : 'violet'}>{KIND_LABEL[selected.kind]}</Badge>
                      {selected.printOnInvoice && <Badge tone="slate">Printed on invoices</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
                      {selected.bankName && <span>{selected.bankName}</span>}
                      {selected.accountNumber && <span>A/c {selected.accountNumber}</span>}
                      {selected.ifsc && <span>Routing {selected.ifsc}</span>}
                      {selected.upiId && <span>bKash / Nagad {selected.upiId}</span>}
                      <span>
                        Opening {money(selected.openingBalance)} on {fmtDate(selected.openingDate)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Current balance</p>
                      <p className={cn('text-2xl font-semibold', selected.balance < 0 ? 'text-rose-600' : 'text-slate-900')}>{money(selected.balance)}</p>
                    </div>
                    {manage && (
                      <Dropdown>
                        <DropdownTrigger asChild>
                          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Account options">
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </DropdownTrigger>
                        <DropdownContent>
                          <DropdownItem icon={<ArrowDownLeft className="h-4 w-4" />} onSelect={() => setEntry({ open: true, kind: 'add', account: selected._id })}>
                            Add money
                          </DropdownItem>
                          <DropdownItem icon={<ArrowUpRight className="h-4 w-4" />} onSelect={() => setEntry({ open: true, kind: 'reduce', account: selected._id })}>
                            Reduce money
                          </DropdownItem>
                          <DropdownItem icon={<ArrowLeftRight className="h-4 w-4" />} onSelect={() => setEntry({ open: true, kind: 'transfer', account: selected._id })}>
                            Transfer to another account
                          </DropdownItem>
                          <DropdownSeparator />
                          <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setAccountModal({ open: true, account: selected })}>
                            Edit account
                          </DropdownItem>
                          {!selected.isDefault && (
                            <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => askDeleteAccount(selected)}>
                              Delete account
                            </DropdownItem>
                          )}
                        </DropdownContent>
                      </Dropdown>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search statement" className="w-full sm:w-60" />
                  <DateRangeFilter value={range} onChange={setRange} />
                  <div className="flex-1" />
                  {can('reports.export') && (
                    <Button variant="outline" size="sm" onClick={exportXlsx} loading={exporting}>
                      {!exporting && <FileSpreadsheet className="h-4 w-4" />} Excel
                    </Button>
                  )}
                </div>
                {statement.data && (
                  <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
                    {[
                      ['Opening balance', statement.data.opening, 'text-slate-900'],
                      ['Money in', statement.data.moneyIn, 'text-emerald-700'],
                      ['Money out', statement.data.moneyOut, 'text-rose-700'],
                      ['Closing balance', statement.data.closing, 'text-slate-900'],
                    ].map(([label, value, cls]) => (
                      <div key={label as string} className="bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className={cn('text-base font-semibold', cls as string)}>{money(value as number)}</p>
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
                  <EmptyState icon={<Landmark className="h-6 w-6" />} title="No movements in this period" description="Payments received or made through this account, and balance adjustments, appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-2.5 py-2.5 pl-5 font-medium">Date</th>
                          <th className="px-2.5 py-2.5 font-medium">Type</th>
                          <th className="px-2.5 py-2.5 font-medium">Number</th>
                          <th className="px-2.5 py-2.5 font-medium">Party / description</th>
                          <th className="px-2.5 py-2.5 text-right font-medium">Money in</th>
                          <th className="px-2.5 py-2.5 text-right font-medium">Money out</th>
                          <th className="px-2.5 py-2.5 text-right font-medium">Balance</th>
                          <th className="w-10 px-2 py-2.5 pr-4" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                          const target = r.link && r.link.type in TXN ? txnHref(r.link.type, r.link.id) : r.loan ? `/cash-bank/loans?loan=${r.loan}` : null;
                          return (
                            <tr key={`${r.kind}-${r._id}`} onClick={target ? () => router.push(href(target)) : undefined} className={cn(target && 'cursor-pointer hover:bg-blue-50/40')}>
                              <td className="px-2.5 py-2.5 pl-5 whitespace-nowrap text-slate-600">{fmtDate(r.date)}</td>
                              <td className="px-2.5 py-2.5 whitespace-nowrap">
                                <span className={cn('inline-flex items-center gap-1.5', ROW_TONE[r.kind])}>{r.label}</span>
                              </td>
                              <td className="px-2.5 py-2.5 font-medium whitespace-nowrap text-slate-900">{r.number || '—'}</td>
                              <td className="max-w-[240px] truncate px-2.5 py-2.5 text-slate-600">{r.party || '—'}</td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap text-emerald-700 tabular-nums">{r.amount > 0 ? money(r.amount) : ''}</td>
                              <td className="px-2.5 py-2.5 text-right whitespace-nowrap text-rose-700 tabular-nums">{r.amount < 0 ? money(-r.amount) : ''}</td>
                              <td className="px-2.5 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{money(r.balance)}</td>
                              <td className="px-2 py-1.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                {r.deletable && manage && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (await confirm({ title: 'Delete this adjustment?', message: `${r.label} of ${money(Math.abs(r.amount))} on ${fmtDate(r.date)} will be removed and balances recalculated.`, danger: true, confirmText: 'Delete' }))
                                        delEntry.mutate(r._id);
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label="Delete adjustment"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            !list.isLoading && (
              <Card>
                <EmptyState
                  icon={<Landmark className="h-6 w-6" />}
                  title="No accounts yet"
                  description="Add your bank accounts and bKash / Nagad wallets to track balances."
                  action={
                    manage && (
                      <Button onClick={() => setAccountModal({ open: true, account: null })}>
                        <Plus className="h-4 w-4" /> Add account
                      </Button>
                    )
                  }
                />
              </Card>
            )
          )}
        </div>
      </div>

      <AccountModal open={accountModal.open} account={accountModal.account} onOpenChange={(o) => setAccountModal((x) => ({ ...x, open: o }))} onSaved={(a) => select(a._id)} />
      <EntryModal open={entry.open} kind={entry.kind} account={entry.account} balances={balances} onOpenChange={(o) => setEntry((x) => ({ ...x, open: o }))} />
    </div>
  );
}
