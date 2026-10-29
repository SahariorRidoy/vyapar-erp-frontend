'use client';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Paperclip } from 'lucide-react';
import type { Txn } from '@/lib/types';
import { TXN } from '@/lib/txn';
import { api } from '@/lib/api';
import { cn, fmtDate, fmtDateTime, money } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/misc';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ACTION_TONE, TxnMenu, TxnQuickIcons, useTxnActions, type HistoryResponse } from './actions';

const hasFiles = (t: Txn) => !!t.attachments?.length || !!(t.docFiles?.po?.length || t.docFiles?.challan?.length || t.docFiles?.bill?.length);

const userName =(u: Txn['createdBy']) => (typeof u === 'object' && u ? u.name : '');

function UserLog({ txnId }: { txnId: string }) {
  const { cid } = useCompany();
  const q = useQuery({
    queryKey: [cid, 'transactions', 'history', txnId],
    queryFn: async () => (await api.get<HistoryResponse>(`/transactions/${txnId}/history`)).data,
  });
  if (q.isLoading) return <Spinner className="mt-1.5 h-4 w-4" />;
  const logs = q.data?.logs ?? [];
  if (!logs.length) return <p className="mt-1.5 text-[11px] text-slate-400">No history yet</p>;
  return (
    <ol className="mt-1.5 space-y-1.5 border-l border-slate-200 pl-2.5">
      {logs.map((l) => (
        <li key={l._id} className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <Badge tone={ACTION_TONE[l.action] ?? 'slate'} className="px-1.5 py-0 text-[10px] capitalize">{l.action.replace('_', ' ')}</Badge>
            <span className="text-xs font-medium text-slate-700">{l.userName ?? 'System'}</span>
          </span>
          <span className="text-[11px] text-slate-400">{fmtDateTime(l.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

function UserCell({ t }: { t: Txn }) {
  const [open, setOpen] = useState(false);
  const creator = userName(t.createdBy);
  const editor = userName(t.updatedBy);
  // Saving a new document stamps updatedAt a few ms after createdAt, so treat near-equal times as unedited
  const edited = !!editor && new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() > 2000;
  return (
    <div className="leading-tight" onClick={(e) => edited && e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <span className="font-medium text-slate-700">{creator || '—'}</span>
        {edited && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
            aria-label={open ? 'Hide history' : 'Show history'}
            aria-expanded={open}
            title="Show everyone who worked on this"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {edited && !open && (
        <span className="text-[11px] text-slate-400">
          {t.status === 'CANCELLED' ? 'Cancelled' : 'Edited'} by {editor === creator ? 'same user' : editor}
        </span>
      )}
      {open && <UserLog txnId={t._id} />}
    </div>
  );
}

export type TxnColumn = 'date' | 'number' | 'party' | 'type' | 'paymentType' | 'total' | 'settled' | 'balance' | 'status' | 'dueDate' | 'category' | 'ref' | 'createdBy' | 'linked';

const HEAD: Record<TxnColumn, { label: string; right?: boolean }> = {
  date: { label: 'Date' },
  number: { label: 'Number' },
  party: { label: 'Party name' },
  type: { label: 'Type' },
  paymentType: { label: 'Payment type' },
  total: { label: 'Amount', right: true },
  settled: { label: 'Received / Paid', right: true },
  balance: { label: 'Balance', right: true },
  status: { label: 'Status' },
  dueDate: { label: 'Due date' },
  category: { label: 'Category' },
  ref: { label: 'Reference' },
  createdBy: { label: 'Created by' },
  linked: { label: 'Linked to' },
};

function cell(c: TxnColumn, t: Txn): ReactNode {
  switch (c) {
    case 'date':
      return fmtDate(t.date);
    case 'number':
      return (
        <span className="inline-flex items-center gap-1 font-medium text-slate-900">
          {t.number}
          {hasFiles(t) && <Paperclip className="h-3 w-3 text-slate-400" />}
        </span>
      );
    case 'party':
      return <span className="block max-w-[220px] truncate">{t.partyName || '—'}</span>;
    case 'type':
      return TXN[t.type]?.label;
    case 'paymentType':
      return t.paymentType || '—';
    case 'total':
      return money(t.total);
    case 'settled':
      return money(t.settled + (t.paidViaPayments ?? 0));
    case 'balance':
      return TXN[t.type]?.settles && !TXN[t.type]?.isPayment && t.status !== 'CANCELLED' ? <span className={t.balance > 0 ? 'font-medium text-rose-600' : ''}>{money(t.balance)}</span> : '—';
    case 'status':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadge txn={t} />
          {t.links?.length > 0 && t.status === 'CONVERTED' && <span className="text-[11px] text-violet-700">→ {t.links.map((l) => l.number).join(', ')}</span>}
        </span>
      );
    case 'dueDate':
      return fmtDate(t.dueDate) || '—';
    case 'category':
      return typeof t.expenseCategory === 'object' && t.expenseCategory ? t.expenseCategory.name : '—';
    case 'ref':
      return t.refNo || t.paymentRef || '—';
    case 'createdBy':
      return <UserCell t={t} />;
    case 'linked':
      return t.allocations?.length ? <span className="text-xs text-slate-600">{t.allocations.map((a) => a.number).join(', ')}</span> : <span className="text-xs text-slate-400">Unlinked</span>;
  }
}

/** Phone layout of one row: who and how much first, then number, date, status and what is still due. */
function MobileRow({ t, columns, onOpen }: { t: Txn; columns: TxnColumn[]; onOpen: () => void }) {
  const m = TXN[t.type];
  const category = typeof t.expenseCategory === 'object' && t.expenseCategory ? t.expenseCategory.name : '';
  const title = (columns.includes('party') && t.partyName) || (columns.includes('category') && category) || m?.label;
  const due = columns.includes('balance') && m?.settles && !m.isPayment && t.status !== 'CANCELLED' && t.balance > 0;
  return (
    <li className={cn('flex items-start gap-1 py-1 pr-2 pl-4', t.status === 'CANCELLED' && 'text-slate-400')}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-2 text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('truncate font-medium', t.status === 'CANCELLED' ? 'line-through' : 'text-slate-900')}>{title}</span>
          <span className="shrink-0 font-semibold tabular-nums">{money(t.total)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
            {t.number}
            {hasFiles(t) && <Paperclip className="h-3 w-3 text-slate-400" />}
          </span>
          <span>{fmtDate(t.date)}</span>
          {columns.includes('type') && <span>{m?.label}</span>}
          {columns.includes('status') && <StatusBadge txn={t} />}
          {due && <span className="font-medium text-rose-600">Due {money(t.balance)}</span>}
        </span>
      </button>
      <div className="pt-1.5">
        <TxnMenu txn={t} />
      </div>
    </li>
  );
}

export function TxnTable({ rows, columns, empty, className, onRowClick }: { rows: Txn[]; columns: TxnColumn[]; empty?: ReactNode; className?: string; onRowClick?: (t: Txn) => void }) {
  const { run } = useTxnActions();
  const wide = useMediaQuery('(min-width: 640px)');
  if (!rows.length) return <>{empty}</>;
  const open = (t: Txn) => (onRowClick ? onRowClick(t) : run('view', t));
  if (!wide)
    return (
      <ul className={cn('divide-y divide-slate-100', className)}>
        {rows.map((t) => (
          <MobileRow key={t._id} t={t} columns={columns} onOpen={() => open(t)} />
        ))}
      </ul>
    );
  return (
    <div className={cn('relative overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c} className={cn('px-2.5 py-2.5 font-medium whitespace-nowrap first:pl-5', HEAD[c].right && 'text-right')}>
                {HEAD[c].label}
              </th>
            ))}
            <th className="relative w-20 px-2 py-2.5 pr-4">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((t) => (
            <tr key={t._id} onClick={() => open(t)} className={cn('cursor-pointer hover:bg-blue-50/40', t.status === 'CANCELLED' && 'text-slate-400')}>
              {columns.map((c) => (
                <td key={c} className={cn('px-2.5 py-2.5 whitespace-nowrap first:pl-5', c === 'createdBy' && 'align-top', HEAD[c].right && 'text-right tabular-nums', c !== 'number' && c !== 'total' && 'text-slate-600')}>
                  {cell(c, t)}
                </td>
              ))}
              <td className="px-2 py-1 pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <TxnQuickIcons txn={t} />
                <TxnMenu txn={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
