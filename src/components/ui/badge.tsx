import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { STATUS_STYLE, statusLabel } from '@/lib/txn';
import type { TxnType } from '@/lib/types';

const tones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

const STATUS_TEXT: Record<string, string> = { PARTIAL: 'Partial', UNPAID: 'Unpaid', PAID: 'Paid', OVERDUE: 'Overdue', OPEN: 'Open', CONVERTED: 'Converted', CANCELLED: 'Cancelled', CLOSED: 'Closed', COMPLETED: 'Completed' };

export function StatusBadge({ txn }: { txn: { status: string; type: TxnType; dueDate?: string; balance?: number } }) {
  const s = statusLabel(txn);
  let text = STATUS_TEXT[s] ?? s;
  if (txn.type === 'SALE_RETURN' || txn.type === 'PURCHASE_RETURN') text = s === 'PAID' ? 'Settled' : s === 'UNPAID' ? 'Adjusted' : text;
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[s] ?? tones.slate)}>{text}</span>;
}
