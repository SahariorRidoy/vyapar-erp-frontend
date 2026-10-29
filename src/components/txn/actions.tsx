'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowRightLeft, Ban, Copy, Download, Eye, FileCheck2, FileText, History, Mail, MessageCircle, MoreVertical, Printer, Receipt, Share2, Smartphone,
  Trash2, Truck, Undo2, Upload, Wallet,
} from 'lucide-react';
import { api, errorMessage, fileUrl } from '@/lib/api';
import type { Txn, TxnType } from '@/lib/types';
import { RETURN_OF, TXN, newTxnHref, printHref, txnHref, type TxnAction } from '@/lib/txn';
import { invalidateCompany, isPending, reportWrite } from '@/lib/query';
import { cn, fmtDate, fmtDateTime, money } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useConfirm } from '@/components/ui/confirm';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Select, Textarea } from '@/components/ui/input';
import { FileUpload, type FileRef } from '@/components/ui/file-upload';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { ChangeList } from '@/components/audit/diff';
import { PaymentModal, type PaymentType } from './payment-modal';

/** The minimum a row needs to offer document actions. */
export interface TxnLike {
  _id: string;
  type: TxnType;
  number: string;
  status: string;
  party?: string | { _id: string; name?: string; phone?: string; email?: string } | null;
  partyName?: string;
  phone?: string;
  balance?: number;
  total?: number;
  date?: string;
  dueDate?: string;
}

const partyId = (t: TxnLike) => (t.party && typeof t.party === 'object' ? t.party._id : (t.party ?? null));

interface Ctx {
  run: (action: TxnAction, t: TxnLike) => void;
  actionsFor: (t: TxnLike) => { action: TxnAction; label: string; icon: ReactNode; danger?: boolean; group: number }[];
  openPayment: (type: PaymentType, opts?: { id?: string; duplicateOf?: string; party?: string | null; allocation?: { transaction: string; amount: number } }) => void;
}

const ActionsCtx = createContext<Ctx | null>(null);

const OPEN_DOC = ['OPEN'];

export function TxnActionsProvider({ children }: { children: ReactNode }) {
  const { cid, href, can, settings } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [history, setHistory] = useState<TxnLike | null>(null);
  const [uploads, setUploads] = useState<TxnLike | null>(null);
  const [share, setShare] = useState<TxnLike | null>(null);
  const [payment, setPayment] = useState<{ open: boolean; type: PaymentType; id?: string; duplicateOf?: string; party?: string | null; allocation?: { transaction: string; amount: number } }>({ open: false, type: 'PAYMENT_IN' });

  const openPayment: Ctx['openPayment'] = useCallback((type, opts = {}) => {
    setPayment({ open: true, type, id: opts.id, duplicateOf: opts.duplicateOf, party: opts.party ?? null, allocation: opts.allocation });
  }, []);

  const actionsFor = useCallback<Ctx['actionsFor']>(
    (t) => {
      const m = TXN[t.type];
      const p = m.perm;
      const cancelled = t.status === 'CANCELLED';
      const out: ReturnType<Ctx['actionsFor']> = [];
      const add = (action: TxnAction, label: string, icon: ReactNode, group: number, ok = true, danger = false) => {
        if (ok && m.actions.includes(action)) out.push({ action, label, icon, group, danger });
      };
      const i = (n: ReactNode) => n;
      add('view', cancelled || !can(`${p}.edit`) ? 'View' : 'View / Edit', i(<Eye className="h-4 w-4" />), 0, can(`${p}.view`, `${p}.edit`));
      add('toSale', 'Convert to sale', i(<ArrowRightLeft className="h-4 w-4" />), 1, OPEN_DOC.includes(t.status) && can('sale_invoice.create'));
      add('toSaleOrder', 'Convert to sale order', i(<ArrowRightLeft className="h-4 w-4" />), 1, OPEN_DOC.includes(t.status) && can('sale_order.create') && settings?.transaction.enableSaleOrder !== false);
      add('toPurchase', 'Convert to purchase', i(<ArrowRightLeft className="h-4 w-4" />), 1, OPEN_DOC.includes(t.status) && can('purchase_bill.create'));
      add('toReturn', 'Convert to return', i(<Undo2 className="h-4 w-4" />), 1, !cancelled && !!RETURN_OF[t.type] && can(`${TXN[RETURN_OF[t.type]!].perm}.create`));
      add(
        'receive',
        t.type === 'PURCHASE' ? 'Make payment' : 'Receive payment',
        i(<Wallet className="h-4 w-4" />),
        1,
        !cancelled && (t.balance ?? 0) > 0 && can(t.type === 'PURCHASE' ? 'payment_out.create' : 'payment_in.create'),
      );
      add('preview', 'Preview', i(<FileText className="h-4 w-4" />), 2, can(`${p}.view`));
      add('receipt', t.type === 'PAYMENT_IN' ? 'Open receipt' : 'Open voucher', i(<Receipt className="h-4 w-4" />), 2, can(`${p}.view`));
      add('print', 'Print', i(<Printer className="h-4 w-4" />), 2, can(`${p}.view`));
      add('pdf', 'Open PDF', i(<Download className="h-4 w-4" />), 2, can(`${p}.view`));
      add('challan', 'Preview as delivery challan', i(<Truck className="h-4 w-4" />), 2, can(`${p}.view`));
      add('email', 'Email document', i(<Mail className="h-4 w-4" />), 2, can(`${p}.view`));
      add('share', 'Share', i(<Share2 className="h-4 w-4" />), 2, can(`${p}.view`));
      add('confirm', t.type === 'PURCHASE' ? 'Bill / challan uploads' : 'Challan confirmation uploads', i(<FileCheck2 className="h-4 w-4" />), 3, !cancelled && can(`${p}.view`));
      add('duplicate', 'Duplicate', i(<Copy className="h-4 w-4" />), 3, can(`${p}.create`));
      add('history', 'View history', i(<History className="h-4 w-4" />), 3, can(`${p}.view`));
      add('cancel', t.type === 'SALE' ? 'Cancel invoice' : `Cancel ${m.label.toLowerCase()}`, i(<Ban className="h-4 w-4" />), 4, !cancelled && t.status !== 'CONVERTED' && can(`${p}.edit`), true);
      add('delete', 'Delete', i(<Trash2 className="h-4 w-4" />), 4, can(`${p}.delete`), true);
      // 'share' always available from the row icon even if not in the type's menu
      return out;
    },
    [can, settings],
  );

  const cancelMut = useMutation({
    mutationFn: ({ t, reason }: { t: TxnLike; reason: string }) => api.post(`/transactions/${t._id}/cancel`, { reason }),
    onSuccess: (res, { t }) => {
      reportWrite(res, `${TXN[t.type].label} ${t.number} cancelled`);
      invalidateCompany(qc, cid);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deleteMut = useMutation({
    mutationFn: ({ t, reason }: { t: TxnLike; reason: string }) => api.del(`/transactions/${t._id}`, { reason }),
    onSuccess: (res, { t }) => {
      reportWrite(res, `${TXN[t.type].label} ${t.number} deleted`);
      if (isPending(res)) return invalidateCompany(qc, cid);
      // Deleted from its own page: go back to the list instead of reloading a document that is gone
      if (pathname.endsWith(`/${t._id}`)) router.replace(href(TXN[t.type].route));
      invalidateCompany(qc, cid, t._id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const run = useCallback<Ctx['run']>(
    async (action, t) => {
      const m = TXN[t.type];
      const open = (path: string) => window.open(href(path), '_blank', 'noopener');
      switch (action) {
        case 'view':
        case 'edit':
          if (m.isPayment) openPayment(t.type as PaymentType, { id: t._id });
          else router.push(href(txnHref(t.type, t._id)));
          break;
        case 'duplicate':
          if (m.isPayment) openPayment(t.type as PaymentType, { duplicateOf: t._id });
          else router.push(href(newTxnHref(t.type, { duplicate: t._id })));
          break;
        case 'toReturn':
          router.push(href(newTxnHref(RETURN_OF[t.type]!, { from: t._id })));
          break;
        case 'toSale':
          router.push(href(newTxnHref('SALE', { from: t._id })));
          break;
        case 'toSaleOrder':
          router.push(href(newTxnHref('SALE_ORDER', { from: t._id })));
          break;
        case 'toPurchase':
          router.push(href(newTxnHref('PURCHASE', { from: t._id })));
          break;
        case 'receive':
          openPayment(t.type === 'PURCHASE' ? 'PAYMENT_OUT' : 'PAYMENT_IN', { party: partyId(t), allocation: { transaction: t._id, amount: t.balance ?? 0 } });
          break;
        case 'preview':
        case 'receipt':
          open(printHref(t._id));
          break;
        case 'print':
          open(printHref(t._id, { autoprint: true }));
          break;
        case 'pdf':
          open(printHref(t._id, { pdf: true }));
          break;
        case 'challan':
          open(printHref(t._id, { as: 'challan' }));
          break;
        case 'email':
          open(printHref(t._id, { email: true }));
          break;
        case 'share':
          setShare(t);
          break;
        case 'history':
          setHistory(t);
          break;
        case 'confirm':
          setUploads(t);
          break;
        case 'cancel': {
          const r = await confirm({
            title: `Cancel ${m.label} ${t.number}?`,
            message:
              t.type === 'SALE' || t.type === 'PURCHASE'
                ? 'Stock and the party balance are reversed and linked payments are released as advance. The document stays in your records marked Cancelled.'
                : 'The document stays in your records marked Cancelled.',
            withReason: true,
            reasonLabel: 'Reason for cancelling',
            confirmText: 'Cancel document',
            cancelText: 'Keep it',
            danger: true,
          });
          if (r) cancelMut.mutate({ t, reason: r.reason });
          break;
        }
        case 'delete': {
          const r = await confirm({
            title: `Delete ${m.label} ${t.number}?`,
            message: 'This permanently removes the document. Stock, balances and linked payments are recalculated. This cannot be undone.',
            withReason: true,
            reasonLabel: 'Reason (shown to the approver if approval is required)',
            confirmText: 'Delete',
            danger: true,
          });
          if (r) deleteMut.mutate({ t, reason: r.reason });
          break;
        }
      }
    },
    [href, router, openPayment, confirm, cancelMut, deleteMut],
  );

  const value = useMemo<Ctx>(() => ({ run, actionsFor, openPayment }), [run, actionsFor, openPayment]);

  return (
    <ActionsCtx.Provider value={value}>
      {children}
      <HistoryModal txn={history} onClose={() => setHistory(null)} />
      <UploadsModal txn={uploads} onClose={() => setUploads(null)} />
      <ShareModal txn={share} onClose={() => setShare(null)} onEmail={(t) => run('email', t)} onPdf={(t) => run('pdf', t)} />
      <PaymentModal
        open={payment.open}
        onOpenChange={(o) => setPayment((p) => ({ ...p, open: o }))}
        type={payment.type}
        id={payment.id}
        duplicateOf={payment.duplicateOf}
        initialParty={payment.party}
        initialAllocation={payment.allocation}
      />
    </ActionsCtx.Provider>
  );
}

export function useTxnActions() {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useTxnActions must be used inside TxnActionsProvider');
  return v;
}

/** Three-dot menu with every action allowed for the document, its status and the user's role. */
export function TxnMenu({ txn, className, align = 'end' }: { txn: TxnLike; className?: string; align?: 'start' | 'end' }) {
  const { run, actionsFor } = useTxnActions();
  const items = actionsFor(txn);
  if (!items.length) return null;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn('rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-700', className)}
          aria-label={`Actions for ${txn.number}`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownTrigger>
      <DropdownContent align={align}>
        {items.map((a, idx) => (
          <div key={a.action}>
            {idx > 0 && items[idx - 1].group !== a.group && <DropdownSeparator />}
            <DropdownItem icon={a.icon} danger={a.danger} onSelect={() => run(a.action, txn)}>
              {a.label}
            </DropdownItem>
          </div>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

/** Print + share icons shown on list rows. */
export function TxnQuickIcons({ txn }: { txn: TxnLike }) {
  const { run } = useTxnActions();
  return (
    <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => run('print', txn)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Print" title="Print">
        <Printer className="h-4 w-4" />
      </button>
      <button onClick={() => run('share', txn)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Share" title="Share">
        <Share2 className="h-4 w-4" />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */

export interface HistoryResponse {
  logs: { _id: string; action: string; label: string; userName?: string; createdAt: string; before?: Record<string, unknown>; after?: Record<string, unknown> }[];
  approvals: {
    _id: string; kind: string; label: string; status: string; reason?: string; reviewNote?: string; createdAt: string; reviewedAt?: string;
    requestedBy?: { name: string }; reviewedBy?: { name: string }; error?: string;
  }[];
}

export const ACTION_TONE: Record<string, 'green' | 'blue' | 'red' | 'amber' | 'violet' | 'slate'> = {
  create: 'green', update: 'blue', delete: 'red', cancel: 'red', convert: 'violet', approve: 'green', reject: 'red', request_approval: 'amber', upload: 'blue', email: 'slate', pay: 'green',
};

function HistoryModal({ txn, onClose }: { txn: TxnLike | null; onClose: () => void }) {
  return (
    <Modal open={!!txn} onOpenChange={(o) => !o && onClose()} size="lg" title={`History · ${txn ? `${TXN[txn.type].label} ${txn.number}` : ''}`} description="Every change made to this document, who made it and when.">
      {txn && <TxnHistory txnId={txn._id} />}
    </Modal>
  );
}

/** Timeline of every change to one document: who did what and when, with approval requests on top. */
export function TxnHistory({ txnId }: { txnId: string }) {
  const { cid } = useCompany();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: [cid, 'transactions', 'history', txnId],
    queryFn: async () => (await api.get<HistoryResponse>(`/transactions/${txnId}/history`)).data,
  });
  return (
    <>
      {q.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          {!!q.data?.approvals.length && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 uppercase">Approval requests</p>
              <div className="space-y-2">
                {q.data.approvals.map((a) => (
                  <div key={a._id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{a.label}</span>
                      <Badge tone={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : 'amber'}>{a.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Requested by {a.requestedBy?.name ?? 'someone'} · {fmtDateTime(a.createdAt)}
                      {a.reviewedBy && ` · ${a.status} by ${a.reviewedBy.name} ${fmtDateTime(a.reviewedAt)}`}
                    </p>
                    {a.reason && <p className="mt-1 text-xs text-slate-600">Reason: {a.reason}</p>}
                    {a.reviewNote && <p className="mt-1 text-xs text-slate-600">Note: {a.reviewNote}</p>}
                    {a.error && <p className="mt-1 text-xs text-rose-600">{a.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase">Activity</p>
            {!q.data?.logs.length ? (
              <EmptyState title="No history yet" />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {q.data.logs.map((l) => (
                  <li key={l._id} className="relative">
                    <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ACTION_TONE[l.action] ?? 'slate'}>{l.action.replace('_', ' ')}</Badge>
                      <span className="text-sm text-slate-800">{l.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {l.userName ?? 'System'} · {fmtDateTime(l.createdAt)}
                    </p>
                    {l.before && l.after && (
                      <>
                        <button onClick={() => setOpen(open === l._id ? null : l._id)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
                          {open === l._id ? 'Hide changes' : 'Show changes'}
                        </button>
                        {open === l._id && <ChangeList before={l.before} after={l.after} className="mt-2 rounded-lg bg-slate-50 p-3" />}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = { confirmed_challan: 'Client confirmed challan', bill_challan: 'Bill challan', other: 'Other document' };

function UploadsModal({ txn, onClose }: { txn: TxnLike | null; onClose: () => void }) {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirmDlg = useConfirm();
  const [files, setFiles] = useState<FileRef[]>([]);
  const [kind, setKind] = useState('confirmed_challan');
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: [cid, 'transactions', 'detail', txn?._id],
    queryFn: async () => (await api.get<Txn>(`/transactions/${txn!._id}`)).data,
    enabled: !!txn,
  });
  const canEdit = !!txn && can(`${TXN[txn.type].perm}.edit`);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [cid, 'transactions'] });
  };
  const add = useMutation({
    mutationFn: async () => {
      for (const f of files) await api.post(`/transactions/${txn!._id}/confirmations`, { file: f._id, kind, note });
    },
    onSuccess: () => {
      toast.success('Document attached');
      setFiles([]);
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${txn!._id}/confirmations/${id}`),
    onSuccess: () => {
      toast.success('Removed');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const status = useMutation({
    mutationFn: (deliveryStatus: string) => api.patch(`/transactions/${txn!._id}/delivery-status`, { deliveryStatus }),
    onSuccess: () => {
      toast.success('Delivery status updated');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const list = q.data?.confirmations ?? [];
  return (
    <Modal
      open={!!txn}
      onOpenChange={(o) => {
        if (!o) {
          setFiles([]);
          onClose();
        }
      }}
      size="lg"
      title={`Confirmation documents · ${txn?.number ?? ''}`}
      description="Upload the client-signed (confirmed) challan and the bill challan as photos or PDFs. They stay attached to this document."
    >
      {q.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">Delivery status</span>
            <Select value={q.data?.deliveryStatus ?? 'pending'} disabled={!canEdit || status.isPending} onChange={(e) => status.mutate(e.target.value)} className="w-44">
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="confirmed">Confirmed by client</option>
            </Select>
          </div>
          {canEdit && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
                <Upload className="h-4 w-4 text-blue-600" /> Upload new
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Document type">
                  <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="confirmed_challan">Client confirmed challan</option>
                    <option value="bill_challan">Bill challan</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Note">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} placeholder="Optional" />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <FileUpload value={files} onChange={setFiles} context="confirmation" label="Choose image or PDF" max={5} />
                <Button size="sm" disabled={!files.length} loading={add.isPending} onClick={() => add.mutate()}>
                  Attach {files.length > 1 ? `${files.length} files` : ''}
                </Button>
              </div>
            </div>
          )}
          {list.length === 0 ? (
            <EmptyState title="Nothing uploaded yet" description="Signed challans and bills you upload appear here." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((c) => {
                const f = typeof c.file === 'object' ? c.file : { _id: c.file as string, originalName: 'File', mime: '' };
                const isImg = f.mime?.startsWith('image/');
                return (
                  <div key={c._id} className="overflow-hidden rounded-xl border border-slate-200">
                    <a href={fileUrl(f._id)} target="_blank" rel="noreferrer" className="block h-36 bg-slate-100">
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(f._id)} alt={f.originalName} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-rose-500">
                          <FileText className="h-10 w-10" />
                        </span>
                      )}
                    </a>
                    <div className="space-y-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={c.kind === 'confirmed_challan' ? 'green' : c.kind === 'bill_challan' ? 'blue' : 'slate'}>{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                        <span className="flex gap-1">
                          <a href={fileUrl(f._id, true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Download">
                            <Download className="h-4 w-4" />
                          </a>
                          {canEdit && (
                            <button
                              onClick={async () => {
                                if (await confirmDlg({ title: 'Remove this document?', danger: true, confirmText: 'Remove' })) remove.mutate(c._id);
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-600">{f.originalName}</p>
                      {c.note && <p className="text-xs text-slate-500">{c.note}</p>}
                      <p className="text-[11px] text-slate-400">
                        {typeof c.uploadedBy === 'object' ? c.uploadedBy?.name : ''} · {fmtDateTime(c.uploadedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ShareModal({ txn, onClose, onEmail, onPdf }: { txn: TxnLike | null; onClose: () => void; onEmail: (t: TxnLike) => void; onPdf: (t: TxnLike) => void }) {
  const { company } = useCompany();
  if (!txn) return <Modal open={false} onOpenChange={onClose} title="Share">{null}</Modal>;
  const m = TXN[txn.type];
  const phone = (txn.phone || (typeof txn.party === 'object' ? txn.party?.phone : '') || '').replace(/[^\d]/g, '');
  // Local Bangladeshi mobile numbers (01XXXXXXXXX) need the 880 country code for WhatsApp
  const intlPhone = phone.length === 11 && phone.startsWith('01') ? `880${phone.slice(1)}` : phone;
  const lines = [
    `Dear ${txn.partyName || 'Customer'},`,
    `${m.isPayment ? 'Payment' : m.label} ${txn.number}${txn.date ? ` dated ${fmtDate(txn.date)}` : ''}${txn.total !== undefined ? ` for ${money(txn.total)}` : ''}.`,
    ...(txn.balance && txn.balance > 0 && !m.isPayment ? [`Balance due: ${money(txn.balance)}${txn.dueDate ? ` (due ${fmtDate(txn.dueDate)})` : ''}.`] : []),
    `Thank you for your business.`,
    company?.name ? `— ${company.name}${company.phone ? `, ${company.phone}` : ''}` : '',
  ].filter(Boolean);
  const text = lines.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied');
    } catch {
      toast.error('Copy is not allowed in this browser');
    }
  };
  const tile = 'flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50/40';
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Share ${m.label} ${txn.number}`} size="md">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <a className={tile} href={`https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={onClose}>
          <MessageCircle className="h-6 w-6 text-emerald-600" /> WhatsApp
        </a>
        <button
          className={tile}
          onClick={() => {
            onClose();
            onEmail(txn);
          }}
        >
          <Mail className="h-6 w-6 text-blue-600" /> Email with PDF
        </button>
        <a className={tile} href={`sms:${phone}?body=${encodeURIComponent(text)}`} onClick={onClose}>
          <Smartphone className="h-6 w-6 text-violet-600" /> SMS
        </a>
        <button
          className={tile}
          onClick={() => {
            onClose();
            onPdf(txn);
          }}
        >
          <Download className="h-6 w-6 text-rose-600" /> Download PDF
        </button>
        <button className={tile} onClick={copy}>
          <Copy className="h-6 w-6 text-slate-600" /> Copy message
        </button>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs whitespace-pre-line text-slate-600">{text}</div>
      {!phone && <p className="mt-2 text-xs text-amber-700">This party has no phone number saved; WhatsApp will ask you to pick a contact.</p>}
    </Modal>
  );
}
