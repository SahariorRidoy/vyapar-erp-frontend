'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, BadgeCheck, Boxes, Check, ChevronDown, ClipboardList, ExternalLink, Package, Pencil, Trash2, Undo2, UserRound, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { computeLine, computeTotals } from '@/lib/money';
import { invalidateCompany } from '@/lib/query';
import { TXN } from '@/lib/txn';
import type { TxnType } from '@/lib/types';
import { cn, fmtDate, fmtDateTime, money, qty } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { useQueryState } from '@/hooks/use-query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/misc';
import { ChangeList } from '@/components/audit/diff';

type Kind =
  | 'txn_update'
  | 'txn_delete'
  | 'txn_cancel'
  | 'stock_adjustment'
  | 'stock_adjustment_delete'
  | 'item_update'
  | 'item_delete'
  | 'party_update'
  | 'party_delete'
  | 'party_group_delete'
  | 'category_delete'
  | 'unit_delete'
  | 'unit_conversion_delete'
  | 'hr_request';
type Plain = Record<string, unknown>;

interface ApprovalRow {
  _id: string;
  kind: Kind;
  entity: string;
  entityId?: string;
  label: string;
  payload?: Plain;
  before?: Plain;
  reason?: string;
  requestedBy: { _id: string; name: string } | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: { _id: string; name: string } | null;
  reviewNote?: string;
  reviewedAt?: string;
  error?: string;
  createdAt: string;
}

const KIND: Record<Kind, { label: string; icon: typeof Pencil; tone: string }> = {
  txn_update: { label: 'Edit document', icon: Pencil, tone: 'bg-blue-50 text-blue-600' },
  txn_delete: { label: 'Delete document', icon: Trash2, tone: 'bg-rose-50 text-rose-600' },
  txn_cancel: { label: 'Cancel document', icon: Ban, tone: 'bg-amber-50 text-amber-600' },
  stock_adjustment: { label: 'Stock adjustment', icon: Boxes, tone: 'bg-violet-50 text-violet-600' },
  stock_adjustment_delete: { label: 'Remove stock adjustment', icon: Boxes, tone: 'bg-rose-50 text-rose-600' },
  item_update: { label: 'Edit item', icon: Package, tone: 'bg-blue-50 text-blue-600' },
  item_delete: { label: 'Delete item', icon: Package, tone: 'bg-rose-50 text-rose-600' },
  party_update: { label: 'Edit party', icon: UserRound, tone: 'bg-blue-50 text-blue-600' },
  party_delete: { label: 'Delete party', icon: UserRound, tone: 'bg-rose-50 text-rose-600' },
  party_group_delete: { label: 'Delete party group', icon: UserRound, tone: 'bg-rose-50 text-rose-600' },
  category_delete: { label: 'Delete item category', icon: Package, tone: 'bg-rose-50 text-rose-600' },
  unit_delete: { label: 'Delete unit', icon: Package, tone: 'bg-rose-50 text-rose-600' },
  unit_conversion_delete: { label: 'Delete unit conversion', icon: Package, tone: 'bg-rose-50 text-rose-600' },
  hr_request: { label: 'Leave / salary advance', icon: ClipboardList, tone: 'bg-emerald-50 text-emerald-600' },
};
const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const;
const STATUS_TEXT = { pending: 'Pending', approved: 'Approved', rejected: 'Declined' } as const;

/** What the edited document would look like, with totals worked out the same way the API will. */
function proposedTxn(before: Plain, payload: Plain, roundOffDefault: boolean): Plain {
  const type = before.type as TxnType | undefined;
  const isPayment = type ? !!TXN[type]?.isPayment : false;
  const items = Array.isArray(payload.items) ? (payload.items as Plain[]) : [];
  const lines = items.map((l) => {
    const c = computeLine({ qty: Number(l.qty) || 0, price: Number(l.price) || 0, discountPercent: Number(l.discountPercent) || 0, discountAmount: Number(l.discountAmount) || 0, taxRate: Number(l.taxRate) || 0, taxInclusive: !!l.taxInclusive });
    return { ...l, ...c };
  });
  const totals = isPayment
    ? { total: Number(payload.amount) || 0, taxTotal: 0, subtotal: Number(payload.amount) || 0 }
    : computeTotals(lines, {
        discountPercent: Number(payload.discountPercent) || 0,
        discountAmount: Number(payload.discountAmount) || 0,
        charges: (payload.additionalCharges as { amount: number }[]) ?? [],
        roundOff: typeof payload.roundOff === 'boolean' ? payload.roundOff : roundOffDefault,
      });
  const out: Plain = {};
  for (const k of Object.keys(payload)) if (k in before) out[k] = payload[k];
  return { ...out, items: lines, subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total };
}

function pick(obj: Plain, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

function ApprovalDetails({ a }: { a: ApprovalRow }) {
  const { settings } = useCompany();
  const p = a.payload ?? {};
  if (a.kind === 'txn_update' && a.before) {
    const after = proposedTxn(a.before, p, settings?.transaction.roundOff ?? true);
    return <ChangeList before={pick(a.before, Object.keys(after))} after={after} />;
  }
  if (a.kind === 'txn_delete' && a.before) {
    const b = a.before;
    const t = TXN[b.type as TxnType];
    return (
      <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <p>
          <span className="text-slate-500">Document:</span> {t?.label} {String(b.number ?? '')}
        </p>
        <p>
          <span className="text-slate-500">Date:</span> {fmtDate(b.date as string)}
        </p>
        <p>
          <span className="text-slate-500">Party:</span> {String(b.partyName ?? '—')}
        </p>
        <p>
          <span className="text-slate-500">Total:</span> {money(Number(b.total) || 0)}
          {Number(b.balance) ? ` · balance ${money(Number(b.balance))}` : ''}
        </p>
        {Array.isArray(b.items) && b.items.length > 0 && (
          <p className="sm:col-span-2">
            <span className="text-slate-500">Items:</span> {(b.items as Plain[]).map((l) => `${l.name} × ${qty(Number(l.qty))}`).join(', ')}
          </p>
        )}
      </div>
    );
  }
  if ((a.kind === 'item_update' || a.kind === 'party_update') && a.before) {
    // Only fields the form sent and that actually differ
    const changed = Object.keys(p).filter((k) => JSON.stringify(p[k] ?? null) !== JSON.stringify(a.before![k] ?? null));
    return <ChangeList before={pick(a.before, changed)} after={pick(p, changed)} />;
  }
  if (a.kind === 'item_delete' && a.before) {
    const b = a.before;
    return (
      <p className="text-xs text-slate-600">
        {String(b.name)}
        {b.code ? ` · code ${String(b.code)}` : ''} · stock {qty(Number(b.stock) || 0)} · sale {money(Number(b.salePrice) || 0)} · cost {money(Number(b.purchasePrice) || 0)}
      </p>
    );
  }
  if (a.kind === 'party_delete' && a.before) {
    const b = a.before;
    return (
      <p className="text-xs text-slate-600">
        {String(b.name)}
        {b.phone ? ` · ${String(b.phone)}` : ''} · balance {money(Number(b.balance) || 0)}
      </p>
    );
  }
  if (a.kind === 'category_delete' && a.before)
    return <p className="text-xs text-slate-600">{Number(a.before.items) ? `${a.before.items} item(s) in this category become uncategorised.` : 'No items use this category.'}</p>;
  if (a.kind === 'party_group_delete' && a.before)
    return <p className="text-xs text-slate-600">{Number(a.before.parties) ? `${a.before.parties} party(ies) in this group become ungrouped.` : 'No parties are in this group.'}</p>;
  if (a.kind === 'unit_delete') return <p className="text-xs text-slate-600">No item uses this unit. Its unit conversions are removed too.</p>;
  if (a.kind === 'stock_adjustment_delete' && a.before) {
    const b = a.before;
    return (
      <p className="text-xs text-slate-600">
        Undo: {b.kind === 'add' ? 'added' : 'reduced'} {qty(Number(b.qty))} on {fmtDate(b.date as string)}
        {b.details ? ` — ${String(b.details)}` : ''}. Stock goes back by the same amount.
      </p>
    );
  }
  if (a.kind === 'txn_cancel') return <p className="text-xs text-slate-600">{a.reason ? `Reason: ${a.reason}` : 'No reason given.'}</p>;
  if (a.kind === 'stock_adjustment')
    return (
      <p className="text-xs text-slate-600">
        {p.kind === 'add' ? 'Add' : 'Reduce'} {qty(Number(p.qty))} {Number(p.qty) === 1 ? 'unit' : 'units'}{p.price ? ` at ${money(Number(p.price))}` : ''}
        {p.date ? ` on ${fmtDate(p.date as string)}` : ''}
        {p.details ? ` — ${String(p.details)}` : ''}
      </p>
    );
  if (a.kind === 'hr_request')
    return (
      <p className="text-xs text-slate-600">
        {p.kind === 'leave' ? `Leave from ${fmtDate(p.fromDate as string)} to ${fmtDate(p.toDate as string)}` : `Salary advance of ${money(Number(p.amount))}`}
        {p.reason ? ` — ${String(p.reason)}` : ''}
      </p>
    );
  return null;
}

function entityLink(a: ApprovalRow) {
  if (!a.entityId) return null;
  if (a.entity === 'Transaction') return a.kind === 'txn_delete' && a.status === 'approved' ? null : `/txn/${a.entityId}`;
  const gone = a.status === 'approved' && (a.kind === 'item_delete' || a.kind === 'party_delete');
  if (a.entity === 'Item') return gone ? null : `/items?item=${a.entityId}`;
  if (a.entity === 'Party') return gone ? null : `/parties?party=${a.entityId}`;
  if (a.entity === 'HrRequest') return '/hr/requests';
  return null;
}

export default function ApprovalsPage() {
  const { cid, can, href } = useCompany();
  const { session } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { params, set } = useQueryState();
  const status = (['pending', 'approved', 'rejected', 'all'].includes(params.get('status') ?? '') ? params.get('status') : 'pending') as 'pending' | 'approved' | 'rejected' | 'all';
  const kind = params.get('kind') ?? '';
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const approver = can('approvals.manage');

  const q = useQuery({
    queryKey: [cid, 'approvals', status, kind, page],
    queryFn: async () => api.get<ApprovalRow[]>('/system/approvals', { status: status === 'all' ? undefined : status, kind: kind || undefined, page, limit: 30 }),
    placeholderData: (prev) => prev,
  });
  const counts = useQuery({
    queryKey: [cid, 'approvals', 'pending-count'],
    queryFn: async () => (await api.get<ApprovalRow[]>('/system/approvals', { status: 'pending', limit: 1 })).meta?.total as number,
  });
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);

  const decide = useMutation({
    mutationFn: (v: { a: ApprovalRow; decision: 'approve' | 'reject'; note?: string }) => api.post(`/system/approvals/${v.a._id}/decision`, { decision: v.decision, note: v.note }),
    onSuccess: (_r, v) => {
      invalidateCompany(qc, cid);
      toast.success(v.decision === 'approve' ? 'Approved and applied' : 'Request declined', { description: v.a.label });
    },
    onError: (e) => {
      invalidateCompany(qc, cid);
      toast.error('Could not apply this change', { description: errorMessage(e) });
    },
  });
  const withdraw = useMutation({
    mutationFn: (a: ApprovalRow) => api.post(`/system/approvals/${a._id}/withdraw`),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success('Request withdrawn');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ask = async (a: ApprovalRow, decision: 'approve' | 'reject') => {
    const res = await confirm({
      title: decision === 'approve' ? 'Approve this change?' : 'Decline this request?',
      message: decision === 'approve' ? `${a.label}. The change is applied immediately.` : `${a.label}. Nothing will change.`,
      confirmText: decision === 'approve' ? 'Approve' : 'Decline',
      danger: decision === 'reject' || a.kind.endsWith('_delete'),
      withReason: true,
      reasonLabel: decision === 'approve' ? 'Note (optional)' : 'Reason (shown to the requester)',
    });
    if (res) decide.mutate({ a, decision, note: res.reason || undefined });
  };

  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const meta = q.data?.meta as { total: number; pages: number } | undefined;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description={approver ? 'Changes your team asked for. Nothing changes until you approve it.' : 'Requests you sent for approval and their result.'}
      />
      {approver && can('settings.manage') && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Which actions need approval is set in
          <Link href={href('/settings?tab=approvals')} className="font-medium text-blue-600 hover:underline">
            Settings ▸ Approvals
          </Link>
          . Roles with “Skip approval” apply their changes directly.
        </p>
      )}
      <Card className="min-w-0">
        <Tabs
          className="px-2"
          value={status}
          onChange={(v) => {
            setPage(1);
            set({ status: v === 'pending' ? null : v });
          }}
          tabs={[
            { value: 'pending', label: 'Pending', count: counts.data ?? undefined },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Declined' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <Select
            value={kind}
            onChange={(e) => {
              setPage(1);
              set({ kind: e.target.value || null });
            }}
            className="w-full sm:w-56"
            aria-label="Request type"
          >
            <option value="">All request types</option>
            {(Object.keys(KIND) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </Select>
        </div>
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BadgeCheck className="h-6 w-6" />}
            title={status === 'pending' ? 'Nothing waiting for approval' : 'No requests here'}
            description={status === 'pending' ? (approver ? 'When staff edit, cancel or delete documents that need approval, the requests appear here.' : 'You have no pending requests.') : 'Try another tab or type.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((a) => {
              const k = KIND[a.kind] ?? KIND.txn_update;
              const Icon = k.icon;
              const link = entityLink(a);
              const mine = a.requestedBy?._id === session?.user._id;
              const expanded = open.has(a._id) || a.status === 'pending';
              return (
                <li key={a._id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', k.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{a.label}</p>
                        <Badge tone={STATUS_TONE[a.status]}>{STATUS_TEXT[a.status]}</Badge>
                        <span className="text-xs text-slate-400">{k.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Requested by <span className="font-medium text-slate-700">{a.requestedBy?.name ?? 'Unknown'}</span> · {fmtDateTime(a.createdAt)}
                        {a.reason && a.kind !== 'txn_cancel' ? ` · “${a.reason}”` : ''}
                      </p>
                      {a.status !== 'pending' && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {a.status === 'approved' ? 'Approved' : 'Declined'} by {a.reviewedBy?.name ?? '—'}
                          {a.reviewedAt ? ` · ${fmtDateTime(a.reviewedAt)}` : ''}
                          {a.reviewNote ? ` · “${a.reviewNote}”` : ''}
                        </p>
                      )}
                      {a.error && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-rose-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> Last attempt failed: {a.error}
                        </p>
                      )}
                      {expanded && (
                        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                          <ApprovalDetails a={a} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {link && (
                        <Link href={href(link)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </Link>
                      )}
                      {a.status !== 'pending' && (
                        <button type="button" onClick={() => toggle(a._id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                          <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} /> Details
                        </button>
                      )}
                      {a.status === 'pending' && mine && (
                        <Button variant="ghost" size="sm" onClick={() => withdraw.mutate(a)} loading={withdraw.isPending && withdraw.variables?._id === a._id}>
                          <Undo2 className="h-4 w-4" /> Withdraw
                        </Button>
                      )}
                      {a.status === 'pending' && approver && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => ask(a, 'reject')} disabled={decide.isPending}>
                            <X className="h-4 w-4 text-rose-600" /> Decline
                          </Button>
                          <Button variant="success" size="sm" onClick={() => ask(a, 'approve')} disabled={decide.isPending}>
                            <Check className="h-4 w-4" /> Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {meta && <Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
