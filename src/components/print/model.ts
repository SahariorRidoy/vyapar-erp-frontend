import type { Company, CompanySettings, Txn, TxnType } from '@/lib/types';
import { TXN } from '@/lib/txn';
import { taxBreakup } from '@/lib/money';
import { amountInWords, round2 } from '@/lib/utils';
import { fileUrl } from '@/lib/api';

/** Everything a print template needs, already resolved: templates never touch settings or API shapes. */
export interface PrintParty {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  state?: string;
  address?: string;
}

export interface PrintLine {
  sn: number;
  name: string;
  description?: string;
  hsn?: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  discountPercent: number;
  taxRate: number;
  taxAmount: number;
  taxable: number;
  amount: number;
}

export interface TaxRow {
  rate: number;
  taxable: number;
  tax: number;
}

export interface PrintDoc {
  kind: 'document' | 'receipt';
  type: TxnType;
  title: string;
  number: string;
  numberLabel: string;
  date: string;
  dueDate?: string;
  refNo?: string;
  refLabel: string;
  deliveryDivision?: string;
  paymentType?: string;
  paymentRef?: string;
  category?: string;
  cancelled: boolean;
  seller: PrintParty & { logo?: string; signature?: string; website?: string; pan?: string };
  buyer: PrintParty;
  partyLabel: string;
  shipTo?: string;
  lines: PrintLine[];
  totals: {
    qty: number;
    itemDiscount: number;
    taxable: number;
    tax: number;
    subtotal: number;
    discount: number;
    discountPercent: number;
    charges: { label: string; amount: number }[];
    roundOff: number;
    total: number;
    settled: number;
    settledLabel: string;
    balance: number;
    previousBalance?: number;
    currentBalance?: number;
  };
  taxRows: TaxRow[];
  amountInWords: string;
  allocations: { number: string; amount: number }[];
  advance: number;
  description?: string;
  terms?: string;
  footerNote?: string;
  bankDetails?: string;
  /** bKash / Nagad number customers can pay to (Settings ▸ Print, stored as `upiId`) */
  walletNo?: string;
  theme: string;
  show: {
    logo: boolean;
    signature: boolean;
    hsn: boolean;
    taxBreakup: boolean;
    amountInWords: boolean;
    bankDetails: boolean;
    terms: boolean;
    prices: boolean;
    discount: boolean;
    tax: boolean;
    settlement: boolean;
    receiverSign: boolean;
  };
}

const TITLES: Partial<Record<TxnType, string>> = {
  SALE: 'Sales Invoice',
  ESTIMATE: 'Estimate / Quotation',
  PROFORMA: 'Proforma Invoice',
  SALE_ORDER: 'Sale Order',
  DELIVERY_CHALLAN: 'Delivery Challan',
  SALE_RETURN: 'Credit Note',
  PAYMENT_IN: 'Payment Receipt',
  PURCHASE: 'Purchase Bill',
  PURCHASE_ORDER: 'Purchase Order',
  PURCHASE_RETURN: 'Debit Note',
  PAYMENT_OUT: 'Payment Voucher',
  EXPENSE: 'Expense Voucher',
};

const NUMBER_LABEL: Partial<Record<TxnType, string>> = {
  SALE: 'Invoice No.', ESTIMATE: 'Estimate No.', PROFORMA: 'Proforma No.', SALE_ORDER: 'Order No.', DELIVERY_CHALLAN: 'Challan No.', SALE_RETURN: 'Credit Note No.', PAYMENT_IN: 'Receipt No.',
  PURCHASE: 'Bill No.', PURCHASE_ORDER: 'PO No.', PURCHASE_RETURN: 'Debit Note No.', PAYMENT_OUT: 'Voucher No.', EXPENSE: 'Voucher No.',
};

const PARTY_LABEL: Partial<Record<TxnType, string>> = {
  PURCHASE: 'Bill From', PURCHASE_ORDER: 'Order To', PURCHASE_RETURN: 'Return To', PAYMENT_IN: 'Received From', PAYMENT_OUT: 'Paid To', EXPENSE: 'Paid To', SALE_RETURN: 'Credit To',
};

const objOrNull = <T,>(v: unknown): T | null => (v && typeof v === 'object' ? (v as T) : null);

export function joinAddress(c: Pick<Company, 'address' | 'city' | 'state' | 'pincode'>) {
  const tail = [c.city, c.state].filter(Boolean).join(', ');
  return [c.address, [tail, c.pincode].filter(Boolean).join(' - ')].filter(Boolean).join('\n');
}

export function buildPrintDoc(t: Txn, company: Company, settings: CompanySettings, opts: { asChallan?: boolean; showPrices?: boolean; theme?: string } = {}): PrintDoc {
  const m = TXN[t.type];
  const p = settings.print;
  const party = objOrNull<{ name: string; phone?: string; email?: string; gstin?: string; billingAddress?: string; shippingAddress?: string; state?: string; balance?: number }>(t.party);
  const account = objOrNull<{ name: string }>(t.paymentAccount);
  const category = objOrNull<{ name: string }>(t.expenseCategory);
  const asChallan = !!opts.asChallan;
  const isReceipt = !!m.isPayment;

  const lines: PrintLine[] = t.items.map((l, i) => {
    const gross = round2(l.qty * l.price);
    return {
      sn: i + 1,
      name: l.name,
      description: l.description,
      hsn: l.hsn,
      qty: l.qty,
      unit: l.unitName ?? '',
      price: l.price,
      discount: l.discountAmount ?? 0,
      discountPercent: l.discountPercent ?? 0,
      taxRate: l.taxRate ?? 0,
      taxAmount: l.taxAmount ?? 0,
      taxable: round2(l.amount - (l.taxAmount ?? 0)),
      amount: l.amount ?? gross,
    };
  });

  const taxRows = taxBreakup(lines);
  const viaPayments = t.paidViaPayments ?? 0;
  const settled = round2(t.settled + viaPayments);
  const anyTax = lines.some((l) => l.taxAmount > 0);
  const showPrices = asChallan ? opts.showPrices !== false : true;

  let previousBalance: number | undefined;
  let currentBalance: number | undefined;
  if (p.showPreviousBalance && party && typeof party.balance === 'number' && (t.type === 'SALE' || t.type === 'PURCHASE')) {
    const sign = t.type === 'SALE' ? 1 : -1;
    currentBalance = round2(party.balance * sign);
    previousBalance = round2(currentBalance - (t.status === 'CANCELLED' ? 0 : t.balance));
  }

  const walletNo = p.upiId?.trim();
  return {
    kind: isReceipt ? 'receipt' : 'document',
    type: t.type,
    title: asChallan ? 'Delivery Challan' : (TITLES[t.type] ?? m.label),
    number: t.number,
    numberLabel: asChallan ? 'Challan No.' : (NUMBER_LABEL[t.type] ?? 'No.'),
    date: t.date,
    dueDate: asChallan ? undefined : t.dueDate,
    refNo: t.refNo,
    refLabel: t.type === 'PURCHASE' ? 'Supplier Bill No.' : t.type.endsWith('RETURN') ? 'Against Invoice' : 'Reference',
    deliveryDivision: t.stateOfSupply || undefined,
    paymentType: account?.name ?? t.paymentType,
    paymentRef: t.paymentRef,
    category: category?.name,
    cancelled: t.status === 'CANCELLED',
    seller: {
      name: company.name,
      phone: company.phone,
      email: company.email,
      gstin: company.gstin,
      state: company.state,
      address: joinAddress(company),
      website: company.website,
      pan: company.pan,
      logo: p.showLogo && company.logo ? fileUrl(company.logo) : undefined,
      signature: p.showSignature && company.signature ? fileUrl(company.signature) : undefined,
    },
    buyer: {
      name: party?.name ?? t.partyName ?? (t.type === 'EXPENSE' ? '' : 'Cash'),
      phone: t.phone || party?.phone,
      email: party?.email,
      gstin: party?.gstin,
      state: party?.state,
      address: t.billingAddress || party?.billingAddress,
    },
    partyLabel: PARTY_LABEL[t.type] ?? 'Bill To',
    shipTo: settings.parties.enableShippingAddress !== false && t.shippingAddress && t.shippingAddress !== t.billingAddress ? t.shippingAddress : undefined,
    lines,
    totals: {
      qty: round2(lines.reduce((s, l) => s + l.qty, 0)),
      itemDiscount: t.itemDiscount ?? 0,
      taxable: round2(lines.reduce((s, l) => s + l.taxable, 0)),
      tax: t.taxTotal ?? 0,
      subtotal: t.subtotal,
      discount: t.discountAmount ?? 0,
      discountPercent: t.discountPercent ?? 0,
      charges: t.additionalCharges ?? [],
      roundOff: t.roundOff ?? 0,
      total: t.total,
      settled,
      settledLabel: m.settledLabel || 'Paid',
      balance: t.balance,
      previousBalance,
      currentBalance,
    },
    taxRows,
    amountInWords: amountInWords(t.total),
    allocations: (t.allocations ?? []).map((a) => ({ number: a.number, amount: a.amount })),
    advance: isReceipt ? round2(t.total - (t.allocations ?? []).reduce((s, a) => s + a.amount, 0)) : 0,
    description: t.description,
    terms: t.terms || (isReceipt ? undefined : p.termsAndConditions) || undefined,
    footerNote: p.footerNote || undefined,
    bankDetails: p.bankDetails?.trim() || undefined,
    walletNo: walletNo || undefined,
    theme: opts.theme || p.themeColor || '#2563eb',
    show: {
      logo: !!(p.showLogo && company.logo),
      signature: p.showSignature !== false,
      hsn: p.showHsn !== false && settings.items.enableHsn !== false && lines.some((l) => l.hsn),
      taxBreakup: p.showTaxBreakup !== false && anyTax && showPrices,
      amountInWords: p.showAmountInWords !== false && showPrices,
      bankDetails: p.showBankDetails !== false && !asChallan && (t.type === 'SALE' || t.type === 'ESTIMATE' || t.type === 'PROFORMA' || t.type === 'SALE_ORDER'),
      terms: p.showTerms !== false,
      prices: showPrices,
      discount: lines.some((l) => l.discount > 0),
      tax: anyTax,
      settlement: m.settles && !isReceipt && !asChallan,
      receiverSign: asChallan || t.type === 'DELIVERY_CHALLAN',
    },
  };
}

