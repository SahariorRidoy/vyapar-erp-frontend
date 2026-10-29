import type { TxnType } from './types';

export type TxnAction =
  | 'view' | 'edit' | 'cancel' | 'delete' | 'duplicate' | 'pdf' | 'preview' | 'print' | 'challan'
  | 'toReturn' | 'receive' | 'history' | 'toSale' | 'toSaleOrder' | 'toPurchase' | 'receipt' | 'confirm' | 'share' | 'email';

export interface TxnMeta {
  type: TxnType;
  label: string;
  plural: string;
  perm: string;
  section: 'sale' | 'purchase';
  /** Route of the list page relative to /c/[cid] */
  route: string;
  newLabel: string;
  settles: boolean;
  settledLabel: string;
  isPayment?: boolean;
  hasDueDate?: boolean;
  actions: TxnAction[];
  partyLabel: string;
  printTitle: string;
}

const invoiceActions: TxnAction[] = ['view', 'toReturn', 'challan', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'receive', 'confirm', 'email', 'share', 'history'];
const paymentActions: TxnAction[] = ['view', 'receipt', 'print', 'pdf', 'delete', 'duplicate', 'email', 'share', 'history'];

export const TXN: Record<TxnType, TxnMeta> = {
  SALE: { type: 'SALE', label: 'Sale Invoice', plural: 'Sale Invoices', perm: 'sale_invoice', section: 'sale', route: '/sale/invoices', newLabel: 'Add Sale', settles: true, settledLabel: 'Received', hasDueDate: true, actions: invoiceActions, partyLabel: 'Customer', printTitle: 'Sales Invoice' },
  ESTIMATE: { type: 'ESTIMATE', label: 'Estimate', plural: 'Estimates / Quotations', perm: 'estimate', section: 'sale', route: '/sale/estimates', newLabel: 'Add Estimate', settles: false, settledLabel: '', actions: ['view', 'toSale', 'toSaleOrder', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Customer', printTitle: 'Estimate / Quotation' },
  PROFORMA: { type: 'PROFORMA', label: 'Proforma Invoice', plural: 'Proforma Invoices', perm: 'proforma_invoice', section: 'sale', route: '/sale/proforma', newLabel: 'Add Proforma', settles: false, settledLabel: '', actions: ['view', 'toSale', 'toSaleOrder', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Customer', printTitle: 'Proforma Invoice' },
  SALE_ORDER: { type: 'SALE_ORDER', label: 'Sale Order', plural: 'Sale Orders', perm: 'sale_order', section: 'sale', route: '/sale/orders', newLabel: 'Add Sale Order', settles: false, settledLabel: '', hasDueDate: true, actions: ['view', 'toSale', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Customer', printTitle: 'Sale Order' },
  DELIVERY_CHALLAN: { type: 'DELIVERY_CHALLAN', label: 'Delivery Challan', plural: 'Delivery Challans', perm: 'delivery_challan', section: 'sale', route: '/sale/delivery-challans', newLabel: 'Add Delivery Challan', settles: false, settledLabel: '', hasDueDate: true, actions: ['view', 'toSale', 'confirm', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Customer', printTitle: 'Delivery Challan' },
  SALE_RETURN: { type: 'SALE_RETURN', label: 'Credit Note', plural: 'Sale Returns / Credit Notes', perm: 'sale_return', section: 'sale', route: '/sale/returns', newLabel: 'Add Credit Note', settles: true, settledLabel: 'Paid back', actions: ['view', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Customer', printTitle: 'Credit Note' },
  PAYMENT_IN: { type: 'PAYMENT_IN', label: 'Payment In', plural: 'Payments In', perm: 'payment_in', section: 'sale', route: '/sale/payment-in', newLabel: 'Add Payment In', settles: true, settledLabel: 'Received', isPayment: true, actions: paymentActions, partyLabel: 'Party', printTitle: 'Payment Receipt' },
  PURCHASE: { type: 'PURCHASE', label: 'Purchase Bill', plural: 'Purchase Bills', perm: 'purchase_bill', section: 'purchase', route: '/purchase/bills', newLabel: 'Add Purchase', settles: true, settledLabel: 'Paid', hasDueDate: true, actions: ['view', 'toReturn', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'receive', 'confirm', 'email', 'share', 'history'], partyLabel: 'Supplier', printTitle: 'Purchase Bill' },
  PURCHASE_ORDER: { type: 'PURCHASE_ORDER', label: 'Purchase Order', plural: 'Purchase Orders', perm: 'purchase_order', section: 'purchase', route: '/purchase/orders', newLabel: 'Add Purchase Order', settles: false, settledLabel: '', hasDueDate: true, actions: ['view', 'toPurchase', 'cancel', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Supplier', printTitle: 'Purchase Order' },
  PURCHASE_RETURN: { type: 'PURCHASE_RETURN', label: 'Debit Note', plural: 'Purchase Returns / Debit Notes', perm: 'purchase_return', section: 'purchase', route: '/purchase/returns', newLabel: 'Add Debit Note', settles: true, settledLabel: 'Received back', actions: ['view', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'email', 'share', 'history'], partyLabel: 'Supplier', printTitle: 'Debit Note' },
  PAYMENT_OUT: { type: 'PAYMENT_OUT', label: 'Payment Out', plural: 'Payments Out', perm: 'payment_out', section: 'purchase', route: '/purchase/payment-out', newLabel: 'Add Payment Out', settles: true, settledLabel: 'Paid', isPayment: true, actions: paymentActions, partyLabel: 'Party', printTitle: 'Payment Voucher' },
  EXPENSE: { type: 'EXPENSE', label: 'Expense', plural: 'Expenses', perm: 'expense', section: 'purchase', route: '/purchase/expenses', newLabel: 'Add Expense', settles: true, settledLabel: 'Paid', actions: ['view', 'delete', 'duplicate', 'pdf', 'preview', 'print', 'share', 'history'], partyLabel: 'Paid to', printTitle: 'Expense Voucher' },
};

/** Resolves /sale/orders → SALE_ORDER, /purchase/orders → PURCHASE_ORDER, etc. */
export function typeFromPath(section: 'sale' | 'purchase', slug: string): TxnType | null {
  return Object.values(TXN).find((m) => m.route === `/${section}/${slug}`)?.type ?? null;
}

export const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PARTIAL: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  UNPAID: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  OVERDUE: 'bg-red-100 text-red-800 ring-red-600/30',
  OPEN: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  CONVERTED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-500/20 line-through',
  CLOSED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export function statusLabel(t: { status: string; type: TxnType; dueDate?: string; balance?: number }) {
  if ((t.status === 'UNPAID' || t.status === 'PARTIAL') && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString())) return 'OVERDUE';
  return t.status;
}

export const PAYMENT_TARGET: Partial<Record<TxnType, TxnType>> = { PAYMENT_IN: 'SALE', PAYMENT_OUT: 'PURCHASE' };

/** Return document type created from an invoice / bill. */
export const RETURN_OF: Partial<Record<TxnType, TxnType>> = { SALE: 'SALE_RETURN', PURCHASE: 'PURCHASE_RETURN' };

/** Company-relative link to open a document (payments open as a modal on their list page). */
export function txnHref(type: TxnType, id: string) {
  const m = TXN[type];
  return m.isPayment ? `${m.route}?edit=${id}` : `${m.route}/${id}`;
}

/** Company-relative link to create a document, optionally converting (from) or copying (duplicate) another one. */
export function newTxnHref(type: TxnType, opts: { from?: string; duplicate?: string; party?: string; category?: string } = {}) {
  const m = TXN[type];
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.duplicate) q.set('duplicate', opts.duplicate);
  if (opts.party) q.set('party', opts.party);
  if (opts.category) q.set('category', opts.category);
  if (m.isPayment) {
    q.set('new', '1');
    return `${m.route}?${q}`;
  }
  const s = q.toString();
  return `${m.route}/new${s ? `?${s}` : ''}`;
}

export function printHref(id: string, opts: { autoprint?: boolean; pdf?: boolean; as?: 'challan'; email?: boolean } = {}) {
  const q = new URLSearchParams();
  if (opts.autoprint) q.set('autoprint', '1');
  if (opts.pdf) q.set('pdf', '1');
  if (opts.as) q.set('as', opts.as);
  if (opts.email) q.set('email', '1');
  const s = q.toString();
  return `/print/${id}${s ? `?${s}` : ''}`;
}

/** Sign used to show a party balance: positive = receivable (to collect), negative = payable. */
export function balanceText(balance: number) {
  if (Math.abs(balance) < 0.005) return { label: 'Settled', tone: 'slate' as const };
  return balance > 0 ? { label: 'To receive', tone: 'green' as const } : { label: 'To pay', tone: 'red' as const };
}
