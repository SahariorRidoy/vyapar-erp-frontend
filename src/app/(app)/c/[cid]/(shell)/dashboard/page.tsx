'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, Boxes, ClipboardList, FileText, HandCoins, Landmark, Plus, Receipt, ShieldCheck, ShoppingCart, TrendingUp, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { TxnType } from '@/lib/types';
import { TXN, txnHref } from '@/lib/txn';
import { fmtDate, money, plural, qty } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { DateRangeFilter, defaultRange } from '@/components/ui/date-range';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { MonthlyChart, type MonthPoint } from '@/components/charts/monthly-chart';
import { TxnMenu } from '@/components/txn/actions';

interface Dashboard {
  sales: { total: number; received: number; balance: number; count: number; returns: number };
  purchases: { total: number; paid: number; balance: number; count: number; returns: number };
  expenses: { total: number; count: number };
  paymentIn: number;
  paymentOut: number;
  profit: { gross: number; net: number };
  receivable: number;
  payable: number;
  partyCount: number;
  stock: { value: number; items: number; low: { _id: string; name: string; stock: number; minStock: number; baseUnit?: { shortName: string } }[] };
  cash: number;
  bank: number;
  accounts: { _id: string; name: string; kind: string; balance: number }[];
  overdue: { count: number; amount: number };
  openDocs: Record<string, { count: number; total: number }>;
  /** Cheques not deposited (received) or not withdrawn (issued) yet */
  cheques: Partial<Record<'received' | 'issued', { count: number; total: number }>>;
  loans: { count: number; outstanding: number };
  pendingApprovals: number;
  monthly: MonthPoint[];
  recent: { _id: string; type: TxnType; number: string; partyName?: string; date: string; total: number; balance: number; status: string }[];
  topItems: { name: string; qty: number; amount: number }[];
  topParties: { _id: string; name: string; total: number; count: number }[];
}

function Kpi({ label, value, sub, icon, href, accent }: { label: string; value: string; sub?: React.ReactNode; icon: React.ReactNode; href?: string; accent: string }) {
  const body = (
    <div className="flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-slate-900">{value}</p>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { cid, href, can, company } = useCompany();
  const [range, setRange] = useState(defaultRange('this_month'));
  const q = useQuery({
    queryKey: [cid, 'dashboard', range.from, range.to],
    queryFn: async () => (await api.get<Dashboard>('/dashboard', { from: range.from, to: range.to })).data,
    enabled: can('dashboard.view'),
  });
  const d = q.data;

  if (!can('dashboard.view'))
    return (
      <Card>
        <EmptyState title={`Welcome to ${company?.name ?? 'your company'}`} description="Your role does not include the business dashboard. Use the menu on the left to get to your work." />
      </Card>
    );

  const quick = [
    { label: 'Add Sale', href: '/sale/invoices/new', perm: 'sale_invoice.create', icon: <Receipt className="h-4 w-4" /> },
    { label: 'Add Purchase', href: '/purchase/bills/new', perm: 'purchase_bill.create', icon: <ShoppingCart className="h-4 w-4" /> },
    { label: 'Payment In', href: '/sale/payment-in?new=1', perm: 'payment_in.create', icon: <ArrowDownLeft className="h-4 w-4" /> },
    { label: 'Add Expense', href: '/purchase/expenses/new', perm: 'expense.create', icon: <Wallet className="h-4 w-4" /> },
  ].filter((x) => can(x.perm));

  const openLabels: [string, string, string][] = [
    ['ESTIMATE', 'Open estimates', '/sale/estimates'],
    ['PROFORMA', 'Open proforma invoices', '/sale/proforma'],
    ['SALE_ORDER', 'Open sale orders', '/sale/orders'],
    ['DELIVERY_CHALLAN', 'Open delivery challans', '/sale/delivery-challans'],
    ['PURCHASE_ORDER', 'Open purchase orders', '/purchase/orders'],
  ];

  // Money on its way in or out of the accounts above, and loans being repaid
  const pending = d
    ? [
        { key: 'cheque-in', label: 'Cheques to deposit', count: d.cheques.received?.count ?? 0, total: d.cheques.received?.total ?? 0, path: '/cash-bank/cheques?direction=in', icon: <ArrowDownLeft className="h-4 w-4 text-emerald-500" /> },
        { key: 'cheque-out', label: 'Issued cheques not withdrawn', count: d.cheques.issued?.count ?? 0, total: d.cheques.issued?.total ?? 0, path: '/cash-bank/cheques?direction=out', icon: <ArrowUpRight className="h-4 w-4 text-rose-500" /> },
        { key: 'loans', label: 'Loans still owed', count: d.loans.count, total: d.loans.outstanding, path: '/cash-bank/loans', icon: <HandCoins className="h-4 w-4 text-amber-500" /> },
      ].filter((p) => p.count > 0)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Business overview for ${company?.name}`}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            {quick.map((x, i) => (
              <Link key={x.href} href={href(x.href)} className={buttonClass({ variant: i === 0 ? 'primary' : 'outline' })}>
                {i === 0 ? <Plus className="h-4 w-4" /> : x.icon} {x.label}
              </Link>
            ))}
          </>
        }
      />

      {q.isLoading || !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Sales"
              value={money(d.sales.total)}
              sub={
                <>
                  {plural(d.sales.count, 'invoice')} · received {money(d.sales.received)}
                </>
              }
              icon={<TrendingUp className="h-5 w-5" />}
              accent="bg-blue-50 text-blue-600"
              href={can('sale_invoice.view') ? href('/sale/invoices') : undefined}
            />
            <Kpi
              label="Purchases"
              value={money(d.purchases.total)}
              sub={
                <>
                  {plural(d.purchases.count, 'bill')} · paid {money(d.purchases.paid)}
                </>
              }
              icon={<ShoppingCart className="h-5 w-5" />}
              accent="bg-orange-50 text-orange-600"
              href={can('purchase_bill.view') ? href('/purchase/bills') : undefined}
            />
            <Kpi label="Expenses" value={money(d.expenses.total)} sub={plural(d.expenses.count, 'entry')} icon={<Wallet className="h-5 w-5" />} accent="bg-teal-50 text-teal-600" href={can('expense.view') ? href('/purchase/expenses') : undefined} />
            <Kpi
              label="Net profit"
              value={money(d.profit.net)}
              sub={<>Gross profit {money(d.profit.gross)}</>}
              icon={<FileText className="h-5 w-5" />}
              accent={d.profit.net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
              href={can('reports.view') ? href('/reports/profit-loss') : undefined}
            />
            <Kpi label="You'll receive" value={money(d.receivable)} sub="Total receivable from parties" icon={<ArrowDownLeft className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" href={can('parties.view') ? href('/parties') : undefined} />
            <Kpi label="You'll pay" value={money(d.payable)} sub="Total payable to parties" icon={<ArrowUpRight className="h-5 w-5" />} accent="bg-rose-50 text-rose-600" href={can('parties.view') ? href('/parties') : undefined} />
            <Kpi
              label="Cash & bank"
              value={money(d.cash + d.bank)}
              sub={
                <>
                  Cash {money(d.cash)} · Bank {money(d.bank)}
                </>
              }
              icon={<Landmark className="h-5 w-5" />}
              accent="bg-violet-50 text-violet-600"
              href={can('cash_bank.view') ? href('/cash-bank') : undefined}
            />
            <Kpi label="Stock value" value={money(d.stock.value)} sub={`${d.stock.items} products · ${d.stock.low.length} low on stock`} icon={<Boxes className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" href={can('items.view') ? href('/items') : undefined} />
          </div>

          {(d.overdue.count > 0 || d.pendingApprovals > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {d.overdue.count > 0 && (
                <Link href={href('/sale/invoices?status=OVERDUE')} className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 hover:bg-rose-100/70">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span>
                    <b>{d.overdue.count}</b> overdue invoice{d.overdue.count > 1 ? 's' : ''} worth <b>{money(d.overdue.amount)}</b> — follow up for payment
                  </span>
                </Link>
              )}
              {d.pendingApprovals > 0 && (
                <Link href={href('/approvals')} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100/70">
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                  <span>
                    <b>{d.pendingApprovals}</b> change request{d.pendingApprovals > 1 ? 's are' : ' is'} waiting for approval
                  </span>
                </Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Sales, purchases and expenses" description="Last 12 months, net of returns" />
              <CardBody>
                <MonthlyChart data={d.monthly} />
              </CardBody>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader title="Open documents" />
                <div className="divide-y divide-slate-100">
                  {openLabels.map(([type, label, path]) => {
                    const o = d.openDocs[type];
                    return (
                      <Link key={type} href={href(path)} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                        <span className="flex items-center gap-2 text-slate-700">
                          <ClipboardList className="h-4 w-4 text-slate-400" /> {label}
                        </span>
                        <span className="text-right">
                          <span className="font-semibold text-slate-900">{o?.count ?? 0}</span>
                          {o && <span className="ml-2 text-xs text-slate-500">{money(o.total)}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <CardHeader title="Cash & bank accounts" actions={can('cash_bank.view') && <Link className="text-xs font-medium text-blue-600 hover:underline" href={href('/cash-bank')}>Manage</Link>} />
                <div className="divide-y divide-slate-100">
                  {d.accounts.map((a) => (
                    <div key={a._id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-slate-700">
                        {a.kind === 'cash' ? <Banknote className="h-4 w-4 text-emerald-500" /> : <Landmark className="h-4 w-4 text-blue-500" />}
                        {a.name}
                      </span>
                      <span className={`font-medium ${a.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{money(a.balance)}</span>
                    </div>
                  ))}
                  {pending.map((p) => {
                    const row = (
                      <>
                        <span className="flex items-center gap-2 text-slate-700">
                          {p.icon}
                          {p.label}
                        </span>
                        <span className="text-right">
                          <span className="font-semibold text-slate-900">{p.count}</span>
                          <span className="ml-2 text-xs text-slate-500">{money(p.total)}</span>
                        </span>
                      </>
                    );
                    return can('cash_bank.view') ? (
                      <Link key={p.key} href={href(p.path)} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                        {row}
                      </Link>
                    ) : (
                      <div key={p.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        {row}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Recent transactions" />
              {d.recent.length === 0 ? (
                <EmptyState title="No transactions yet" description="Create your first sale invoice to see it here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Number</th>
                        <th className="px-3 py-2 font-medium">Party</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.recent.map((t) => (
                        <tr key={t._id} className="hover:bg-slate-50">
                          <td className="px-5 py-2 text-slate-600">{TXN[t.type]?.label}</td>
                          <td className="px-3 py-2 font-medium">
                            <Link className="text-blue-700 hover:underline" href={href(txnHref(t.type, t._id))}>
                              {t.number}
                            </Link>
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2">{t.partyName || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(t.date)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(t.total)}</td>
                          <td className="px-3 py-2">
                            <StatusBadge txn={t} />
                          </td>
                          <td className="px-3 py-1 text-right">
                            <TxnMenu txn={t} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader title="Low stock" description="At or below the minimum stock level" />
                {d.stock.low.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-slate-500">All items are above their minimum stock.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {d.stock.low.map((i) => (
                      <Link key={i._id} href={href(`/items?item=${i._id}`)} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                        <span className="truncate text-slate-700">{i.name}</span>
                        <span className="shrink-0 text-xs">
                          <b className="text-rose-600">{qty(i.stock)}</b>
                          <span className="text-slate-500">
                            {' '}
                            / min {qty(i.minStock)} {i.baseUnit?.shortName}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Top selling items" description="In the selected period" />
                {d.topItems.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-slate-500">No sales in this period.</p>
                ) : (
                  <div className="space-y-3 px-5 py-4">
                    {d.topItems.map((i) => {
                      const pct = d.topItems[0].amount ? (i.amount / d.topItems[0].amount) * 100 : 0;
                      return (
                        <div key={i.name}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate text-slate-700">{i.name}</span>
                            <span className="shrink-0 font-medium text-slate-900">{money(i.amount)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-blue-100">
                            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{qty(i.qty)} sold</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Top customers" description="By sales in the selected period" />
                {d.topParties.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-slate-500">No sales in this period.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {d.topParties.map((p) => (
                      <Link key={p._id} href={href(`/parties?party=${p._id}`)} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                        <span className="truncate text-slate-700">{p.name}</span>
                        <span className="shrink-0 text-right">
                          <span className="font-medium text-slate-900">{money(p.total)}</span>
                          <span className="ml-2 text-xs text-slate-500">{p.count} inv.</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
