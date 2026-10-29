'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Txn, TxnType } from '@/lib/types';
import { TXN, newTxnHref } from '@/lib/txn';
import { money } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useResetOn } from '@/hooks/use-reset-on';
import { useParties } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { DateRangeFilter, defaultRange, type DateRangeValue } from '@/components/ui/date-range';
import { EmptyState, NoAccess, PageHeader, Pagination, SearchInput, Skeleton } from '@/components/ui/misc';
import { TxnTable, type TxnColumn } from './txn-table';
import { useTxnActions } from './actions';
import type { PaymentType } from './payment-modal';

const COLUMNS: Record<TxnType, TxnColumn[]> = {
  SALE: ['date', 'number', 'party', 'paymentType', 'total', 'balance', 'dueDate', 'status', 'createdBy'],
  PURCHASE: ['date', 'number', 'party', 'paymentType', 'total', 'balance', 'dueDate', 'status', 'createdBy'],
  ESTIMATE: ['date', 'number', 'party', 'total', 'status', 'createdBy'],
  PROFORMA: ['date', 'number', 'party', 'total', 'status', 'createdBy'],
  SALE_ORDER: ['date', 'number', 'party', 'dueDate', 'total', 'status', 'createdBy'],
  PURCHASE_ORDER: ['date', 'number', 'party', 'dueDate', 'total', 'status', 'createdBy'],
  DELIVERY_CHALLAN: ['date', 'number', 'party', 'dueDate', 'total', 'status', 'createdBy'],
  SALE_RETURN: ['date', 'number', 'party', 'ref', 'total', 'settled', 'balance', 'status', 'createdBy'],
  PURCHASE_RETURN: ['date', 'number', 'party', 'ref', 'total', 'settled', 'balance', 'status', 'createdBy'],
  PAYMENT_IN: ['date', 'number', 'party', 'ref', 'total', 'paymentType', 'linked', 'createdBy'],
  PAYMENT_OUT: ['date', 'number', 'party', 'ref', 'total', 'paymentType', 'linked', 'createdBy'],
  EXPENSE: ['date', 'number', 'category', 'party', 'paymentType', 'total', 'balance', 'status', 'createdBy'],
};

const STATUS_OPTIONS: Record<'settle' | 'open' | 'payment', { value: string; label: string }[]> = {
  settle: [
    { value: '', label: 'All statuses' },
    { value: 'PAID', label: 'Paid' },
    { value: 'PARTIAL', label: 'Partially paid' },
    { value: 'UNPAID', label: 'Unpaid' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ],
  open: [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'CONVERTED', label: 'Converted' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ],
  payment: [],
};

interface Summary {
  total: number;
  settled: number;
  balance: number;
  tax: number;
  count: number;
}

const plural = (n: number | undefined, word: string) => `${n ?? 0} ${word}${n === 1 ? '' : 's'}`;

function SummaryCards({ type, s, counts }: { type: TxnType; s?: Summary; counts?: { open: number; converted: number } }) {
  const m = TXN[type];
  const card = (label: string, value: string, tone: string, sub?: string) => (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      {sub && <p className="text-[11px] opacity-70">{sub}</p>}
    </div>
  );
  const neutral = 'border-slate-200 bg-white text-slate-900';
  const green = 'border-emerald-200 bg-emerald-50/60 text-emerald-800';
  const red = 'border-rose-200 bg-rose-50/60 text-rose-800';
  const blue = 'border-blue-200 bg-blue-50/60 text-blue-800';
  let cards: React.ReactNode[] = [];
  if (type === 'SALE')
    cards = [card('Total sales', money(s?.total), blue, `${plural(s?.count, 'invoice')} · tax ${money(s?.tax)}`), card('Received', money(s?.settled), green), card('Balance', money(s?.balance), red, 'Still to be received')];
  else if (type === 'PURCHASE') cards = [card('Paid', money(s?.settled), green), card('Unpaid', money(s?.balance), red, 'Still to be paid'), card('Total', money(s?.total), blue, `${plural(s?.count, 'bill')} · tax ${money(s?.tax)}`)];
  else if (m.isPayment) cards = [card(type === 'PAYMENT_IN' ? 'Total received' : 'Total paid', money(s?.total), type === 'PAYMENT_IN' ? green : red, plural(s?.count, type === 'PAYMENT_IN' ? 'receipt' : 'voucher'))];
  else if (m.settles) cards = [card(`Total ${m.plural.toLowerCase()}`, money(s?.total), blue, plural(s?.count, 'document')), card(m.settledLabel || 'Settled', money(s?.settled), green), card('Balance', money(s?.balance), red)];
  else cards = [card(`Total ${m.label.toLowerCase()}s`, money(s?.total), blue, plural(s?.count, 'document')), card('Open', String(counts?.open ?? '—'), neutral, 'Not converted yet'), card('Converted', String(counts?.converted ?? '—'), neutral)];
  return <div className="grid gap-3 sm:grid-cols-3">{cards.map((c, i) => <div key={i}>{c}</div>)}</div>;
}

export function TxnListPage({ type }: { type: TxnType }) {
  const m = TXN[type];
  const { cid, href, can } = useCompany();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openPayment } = useTxnActions();
  const parties = useParties();
  const [range, setRange] = useState<DateRangeValue>(() => (params.get('status') ? defaultRange('all') : defaultRange('this_month')));
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<string | null>(params.get('party'));
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search);

  useResetOn(`${debounced}|${party}|${status}|${range.from}|${range.to}`, () => setPage(1));

  // Payment modal deep links: ?new=1, ?edit=<id>, ?duplicate=<id>, ?party=<id>
  useEffect(() => {
    if (!m.isPayment) return;
    const edit = params.get('edit');
    const isNew = params.get('new') === '1';
    if (!edit && !isNew) return;
    openPayment(type as PaymentType, { id: edit ?? undefined, duplicateOf: params.get('duplicate') ?? undefined, party: params.get('party') });
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const q = useQuery({
    queryKey: [cid, 'transactions', 'list', type, debounced, party, status, range.from, range.to, page],
    queryFn: async () => api.get<Txn[]>('/transactions', { type, search: debounced, party: party ?? undefined, status: status || undefined, from: range.from, to: range.to, page, limit: 50 }),
    placeholderData: (prev) => prev,
    enabled: can(`${m.perm}.view`),
  });
  const isOrderLike = !m.settles;
  const counts = useQuery({
    queryKey: [cid, 'transactions', 'counts', type, range.from, range.to, party],
    queryFn: async () => {
      const [open, converted] = await Promise.all(
        ['OPEN', 'CONVERTED'].map(async (st) => (await api.get<Txn[]>('/transactions', { type, status: st, from: range.from, to: range.to, party: party ?? undefined, limit: 1 })).meta?.total as number),
      );
      return { open, converted };
    },
    enabled: isOrderLike && can(`${m.perm}.view`),
  });

  const partyOptions = useMemo(() => (parties.data ?? []).map((p) => ({ value: p._id, label: p.name, hint: p.phone })), [parties.data]);
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;
  const summary = meta?.summary as Summary | undefined;

  const add = () => {
    if (m.isPayment) openPayment(type as PaymentType, { party });
    else router.push(href(newTxnHref(type, { party: party ?? undefined })));
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await api.download('/reports/all-transactions/export', { format: 'xlsx', type, from: range.from, to: range.to, party: party ?? undefined, status: status || undefined }, `${m.plural}.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  if (!can(`${m.perm}.view`)) return <NoAccess what={m.plural} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={m.plural}
        actions={
          <>
            {can('reports.export') && (
              <Button variant="outline" onClick={exportXlsx} loading={exporting}>
                {!exporting && <FileSpreadsheet className="h-4 w-4" />} Excel
              </Button>
            )}
            {can(`${m.perm}.create`) && (
              <Button onClick={add}>
                <Plus className="h-4 w-4" /> {m.newLabel}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search number, party, note…`} className="w-full sm:w-56" />
        <DateRangeFilter value={range} onChange={setRange} />
        <Combobox value={party} onChange={setParty} options={partyOptions} placeholder="All parties" clearable className="w-full sm:w-52" />
        {STATUS_OPTIONS[m.isPayment ? 'payment' : m.settles ? 'settle' : 'open'].length > 0 && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40">
            {STATUS_OPTIONS[m.settles ? 'settle' : 'open'].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
      </div>
      <SummaryCards type={type} s={summary} counts={counts.data} />
      <Card className="min-w-0">
        {q.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : (
          <>
            <TxnTable
              rows={rows}
              columns={COLUMNS[type]}
              empty={
                <EmptyState
                  icon={<Download className="h-6 w-6" />}
                  title={`No ${m.plural.toLowerCase()} found`}
                  description={debounced || party || status ? 'Try changing the filters or the date range.' : `Create your first ${m.label.toLowerCase()} to see it here.`}
                  action={
                    can(`${m.perm}.create`) && (
                      <Button onClick={add}>
                        <Plus className="h-4 w-4" /> {m.newLabel}
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
      {m.type === 'SALE' && can('sale_order.view') && (
        <p className="text-center text-xs text-slate-400">
          Tip: open estimates, sale orders and delivery challans can be converted to invoices from their three-dot menu. <Link className="text-blue-600 hover:underline" href={href('/sale/orders')}>Sale orders</Link>
        </p>
      )}
    </div>
  );
}
