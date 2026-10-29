'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, Banknote, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { TxnType } from '@/lib/types';
import { TXN, txnHref } from '@/lib/txn';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, isoDate, money, plural, today } from '@/lib/utils';
import { useAccountOptions } from '@/hooks/data';
import { useDebounce } from '@/hooks/use-debounce';
import { useQueryState } from '@/hooks/use-query-state';
import { useResetOn } from '@/hooks/use-reset-on';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState, NoAccess, PageHeader, SearchInput, Skeleton, Tabs } from '@/components/ui/misc';

interface ChequeRow {
  _id: string;
  type: TxnType;
  number: string;
  date: string;
  partyName?: string;
  chequeNo: string;
  amount: number;
  direction: 'in' | 'out';
  status: 'OPEN' | 'CLOSED';
  account: { _id: string; name: string } | null;
  closedOn: string | null;
}
interface ChequeSummary {
  received: { total: number; count: number };
  issued: { total: number; count: number };
}

type Status = 'open' | 'closed' | 'all';
type Direction = 'all' | 'in' | 'out';

/** Cheques received and issued. Open cheques are deposited (received) or withdrawn (issued) once they clear. */
export default function ChequesPage() {
  const { cid, can, href } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { params, set } = useQueryState();
  const status = (['open', 'closed', 'all'].includes(params.get('status') ?? '') ? params.get('status') : 'open') as Status;
  const direction = (['in', 'out'].includes(params.get('direction') ?? '') ? params.get('direction') : 'all') as Direction;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounce(search.trim(), 250);
  const [closing, setClosing] = useState<ChequeRow | null>(null);

  const list = useQuery({
    queryKey: [cid, 'cheques', status, direction, q],
    queryFn: async () => api.get<ChequeRow[]>('/finance/cheques', { status, direction: direction === 'all' ? undefined : direction, q: q || undefined }),
    enabled: can('cash_bank.view'),
    placeholderData: (prev) => prev,
  });

  const reopen = useMutation({
    mutationFn: (c: ChequeRow) => api.post(`/finance/cheques/${c._id}/reopen`),
    onSuccess: (_r, c) => {
      invalidateCompany(qc, cid);
      toast.success(`Cheque${c.chequeNo ? ` ${c.chequeNo}` : ''} is open again`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can('cash_bank.view')) return <NoAccess what="cash & bank" />;
  const manage = can('cash_bank.manage');
  const rows = list.data?.data ?? [];
  const summary = list.data?.meta?.summary as ChequeSummary | undefined;

  const askReopen = async (c: ChequeRow) => {
    const moved = c.direction === 'in' ? `leaves ${c.account?.name ?? 'the account'} again` : `goes back into ${c.account?.name ?? 'the account'}`;
    if (await confirm({ title: `Reopen cheque${c.chequeNo ? ` ${c.chequeNo}` : ''}?`, message: `${money(c.amount)} ${moved} and the cheque is listed as open. The ${TXN[c.type].label.toLowerCase()} itself does not change.`, confirmText: 'Reopen cheque' }))
      reopen.mutate(c);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Cheques" description="Cheques received from customers and issued to suppliers. A cheque counts against the party at once and reaches cash or bank when it clears." />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Received, to deposit"
          value={money(summary?.received.total)}
          hint={summary ? plural(summary.received.count, 'cheque') : undefined}
          tone="green"
          icon={<ArrowDownLeft className="h-5 w-5" />}
          onClick={() => set({ status: null, direction: 'in' })}
        />
        <StatCard
          label="Issued, not withdrawn yet"
          value={money(summary?.issued.total)}
          hint={summary ? plural(summary.issued.count, 'cheque') : undefined}
          tone="red"
          icon={<ArrowUpRight className="h-5 w-5" />}
          onClick={() => set({ status: null, direction: 'out' })}
        />
      </div>

      <Card className="min-w-0">
        <Tabs<Status>
          className="px-2"
          tabs={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Cleared' },
            { value: 'all', label: 'All' },
          ]}
          value={status}
          onChange={(v) => set({ status: v === 'open' ? null : v })}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              set({ q: v.trim() || null });
            }}
            placeholder="Party, document or cheque no."
            className="w-full sm:w-72"
          />
          <Select value={direction} onChange={(e) => set({ direction: e.target.value === 'all' ? null : e.target.value })} className="h-9 w-full sm:w-56" aria-label="Received or issued">
            <option value="all">Received and issued</option>
            <option value="in">Received</option>
            <option value="out">Issued</option>
          </Select>
        </div>

        {list.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title={status === 'open' ? 'No cheques waiting' : 'No cheques here'}
            description="Choose Cheque as the payment type on a Payment In, Payment Out, invoice or bill. It is listed here until you deposit or withdraw it."
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-2.5 py-2.5 pl-5 font-medium">Date</th>
                  <th className="px-2.5 py-2.5 font-medium">Cheque no.</th>
                  <th className="px-2.5 py-2.5 font-medium">Party</th>
                  <th className="px-2.5 py-2.5 font-medium">Document</th>
                  <th className="px-2.5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-2.5 py-2.5 font-medium">Status</th>
                  <th className="px-2.5 py-2.5 pr-5 text-right font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c._id} className="align-middle">
                    <td className="px-2.5 py-2.5 pl-5 whitespace-nowrap text-slate-600">{fmtDate(c.date)}</td>
                    <td className="px-2.5 py-2.5 font-medium whitespace-nowrap text-slate-900">{c.chequeNo || '—'}</td>
                    <td className="max-w-[220px] truncate px-2.5 py-2.5 text-slate-700">{c.partyName || '—'}</td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <Link href={href(txnHref(c.type, c._id))} className="text-blue-700 hover:underline">
                        {TXN[c.type].label} {c.number}
                      </Link>
                    </td>
                    <td className={cn('px-2.5 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums', c.direction === 'in' ? 'text-emerald-700' : 'text-rose-700')}>
                      {c.direction === 'in' ? '+' : '−'}
                      {money(c.amount)}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {c.status === 'OPEN' ? (
                        <Badge tone={c.direction === 'in' ? 'amber' : 'blue'}>{c.direction === 'in' ? 'To deposit' : 'Not withdrawn'}</Badge>
                      ) : (
                        <span className="text-xs text-slate-600">
                          {c.direction === 'in' ? 'Deposited into' : 'Withdrawn from'} <b className="font-medium text-slate-800">{c.account?.name}</b>
                          {c.closedOn ? ` on ${fmtDate(c.closedOn)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 pr-5 text-right whitespace-nowrap">
                      {manage &&
                        (c.status === 'OPEN' ? (
                          <Button size="sm" variant={c.direction === 'in' ? 'success' : 'outline'} onClick={() => setClosing(c)}>
                            {c.direction === 'in' ? 'Deposit' : 'Withdraw'}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => askReopen(c)} loading={reopen.isPending && reopen.variables?._id === c._id}>
                            <RotateCcw className="h-3.5 w-3.5" /> Reopen
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CloseChequeModal cheque={closing} onOpenChange={(o) => !o && setClosing(null)} />
    </div>
  );
}

/** Deposit a received cheque into an account, or withdraw an issued one from it. */
function CloseChequeModal({ cheque, onOpenChange }: { cheque: ChequeRow | null; onOpenChange: (o: boolean) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const accounts = useAccountOptions();
  const [picked, setPicked] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const incoming = cheque?.direction === 'in';
  const list = accounts.data ?? [];
  // Cheques usually clear through a bank account, so the first bank is the default
  const account = picked || (list.find((a) => a.kind === 'bank') ?? list[0])?._id || '';
  const earliest = cheque ? isoDate(cheque.date) : '';

  useResetOn(cheque?._id ?? null, () => {
    setPicked('');
    setDate(today());
    setNote('');
  });

  const save = useMutation({
    mutationFn: () => api.post(`/finance/cheques/${cheque!._id}/close`, { account, date, description: note || undefined }),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      const name = list.find((a) => a._id === account)?.name ?? 'the account';
      toast.success(incoming ? `Cheque deposited into ${name}` : `Cheque withdrawn from ${name}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tooEarly = !!date && !!earliest && date < earliest;
  return (
    <Modal
      open={!!cheque}
      onOpenChange={onOpenChange}
      size="sm"
      title={incoming ? 'Deposit cheque' : 'Withdraw cheque'}
      description={
        cheque ? (
          <>
            {cheque.chequeNo ? `Cheque ${cheque.chequeNo} · ` : ''}
            {cheque.partyName ? `${cheque.partyName} · ` : ''}
            <span className="whitespace-nowrap">{money(cheque.amount)}</span>
          </>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={incoming ? 'success' : 'primary'} onClick={() => save.mutate()} loading={save.isPending} disabled={!account || !date || tooEarly}>
            {incoming ? 'Deposit' : 'Withdraw'} {cheque ? money(cheque.amount) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={incoming ? 'Deposit into' : 'Withdraw from'} required>
          <Select value={account} onChange={(e) => setPicked(e.target.value)}>
            {list.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={incoming ? 'Deposit date' : 'Withdrawal date'} required error={tooEarly ? `The cheque is dated ${fmtDate(earliest)}` : undefined}>
          <Input type="date" value={date} min={earliest} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={incoming ? 'e.g. Deposited at Camp branch' : 'e.g. Cleared in bank statement'} />
        </Field>
      </div>
    </Modal>
  );
}
