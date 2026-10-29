export type TxnType =
  | 'SALE' | 'ESTIMATE' | 'PROFORMA' | 'SALE_ORDER' | 'DELIVERY_CHALLAN' | 'SALE_RETURN' | 'PAYMENT_IN'
  | 'PURCHASE' | 'PURCHASE_ORDER' | 'PURCHASE_RETURN' | 'PAYMENT_OUT' | 'EXPENSE';

export type TxnStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'OPEN' | 'CONVERTED' | 'CANCELLED' | 'CLOSED' | 'COMPLETED';

export interface Ref<T = string> {
  _id: string;
  name: T;
}

export interface Unit {
  _id: string;
  name: string;
  shortName: string;
}

export interface Party {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  gstType?: string;
  state?: string;
  billingAddress?: string;
  shippingAddress?: string;
  group?: { _id: string; name: string } | string | null;
  partyType?: 'customer' | 'supplier' | 'both';
  openingBalance: number;
  openingBalanceDate?: string;
  creditLimit?: number;
  balance: number;
  notes?: string;
  isActive?: boolean;
  stats?: { _id: TxnType; total: number; balance: number; count: number }[];
}

export interface Item {
  _id: string;
  type: 'product' | 'service';
  name: string;
  code?: string;
  hsn?: string;
  category?: { _id: string; name: string } | null;
  baseUnit?: Unit | null;
  secondaryUnit?: Unit | null;
  conversionRate: number;
  salePrice: number;
  saleTaxInclusive?: boolean;
  wholesalePrice: number;
  minWholesaleQty: number;
  purchasePrice: number;
  purchaseTaxInclusive?: boolean;
  mrp?: number;
  taxRate: number;
  openingQty: number;
  openingPrice: number;
  openingDate?: string;
  minStock: number;
  location?: string;
  stock: number;
  stockValue?: number;
  description?: string;
  images?: string[] | { _id: string }[];
  isActive?: boolean;
}

export interface TxnLine {
  _id?: string;
  item?: string | null;
  name: string;
  hsn?: string;
  description?: string;
  qty: number;
  unit?: string | null;
  unitName?: string;
  baseQty?: number;
  price: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxInclusive?: boolean;
  taxAmount: number;
  amount: number;
}

export interface TxnRef {
  transaction: string;
  type: TxnType;
  number: string;
}

export type DocFileKind = 'po' | 'challan' | 'bill';

export interface Txn {
  _id: string;
  type: TxnType;
  number: string;
  date: string;
  dueDate?: string;
  party?: string | (Party & { _id: string }) | null;
  partyName?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  stateOfSupply?: string;
  refNo?: string;
  expenseCategory?: { _id: string; name: string } | string | null;
  items: TxnLine[];
  subtotal: number;
  itemDiscount: number;
  discountPercent: number;
  discountAmount: number;
  taxTotal: number;
  additionalCharges: { label: string; amount: number }[];
  roundOff: number;
  total: number;
  settled: number;
  paidViaPayments: number;
  balance: number;
  paymentType?: string;
  paymentAccount?: string | { _id: string; name: string; kind?: string; bankName?: string; accountNumber?: string; ifsc?: string; upiId?: string } | null;
  paymentRef?: string;
  /** Present when the payment was made by cheque: OPEN until it is deposited or withdrawn */
  cheque?: { status: 'OPEN' | 'CLOSED'; account?: { _id: string; name: string } | string | null; closedOn?: string } | null;
  allocations: { transaction: string; number: string; amount: number }[];
  status: TxnStatus;
  source?: TxnRef;
  links: TxnRef[];
  description?: string;
  terms?: string;
  attachments?: (string | { _id: string; originalName: string; mime: string; size: number })[];
  docFiles?: Partial<Record<DocFileKind, (string | { _id: string; originalName: string; mime: string; size: number })[]>>;
  confirmations?: { _id: string; file: string | { _id: string; originalName: string; mime: string }; kind: string; note?: string; uploadedAt: string; uploadedBy?: { name: string } | string }[];
  deliveryStatus?: 'pending' | 'delivered' | 'confirmed';
  cancelReason?: string;
  createdBy?: { _id: string; name: string } | string;
  updatedBy?: { _id: string; name: string } | string;
  createdAt: string;
  updatedAt: string;
  pendingApprovals?: { _id: string; kind: string; label: string }[];
}

export interface BankAccount {
  _id: string;
  name: string;
  kind: 'cash' | 'bank' | 'wallet';
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  holderName?: string;
  upiId?: string;
  openingBalance: number;
  openingDate?: string;
  isDefault?: boolean;
  printOnInvoice?: boolean;
  balance?: number;
}

type NamedRef = { _id: string; name: string } | null;

/** A business loan with what is still owed (GET /finance/loans). */
export interface LoanAccount {
  _id: string;
  name: string;
  lender?: string;
  accountNumber?: string;
  description?: string;
  /** % a year */
  interestRate: number;
  termMonths: number;
  /** The amount borrowed, or what was owed on the opening date */
  openingBalance: number;
  openingDate: string;
  receivedIn?: NamedRef;
  processingFee?: number;
  feePaidFrom?: NamedRef;
  balance: number;
  principalPaid: number;
  interestPaid: number;
  chargesPaid: number;
  payments: number;
}

export type LoanEntryKind = 'payment' | 'increase' | 'charge';

/** One line of a loan statement; `entry` rows are EMIs, extra loan and charges, the rest belong to the loan itself. */
export interface LoanStatementRow {
  _id: string;
  kind: 'opening' | 'fee' | LoanEntryKind;
  label: string;
  date: string;
  account: NamedRef;
  principal: number;
  interest: number;
  amount: number;
  change: number;
  balance: number;
  description?: string | null;
  entry: boolean;
}

export interface Company {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  businessType?: string;
  businessCategory?: string;
  website?: string;
  logo?: string;
  signature?: string;
  isActive: boolean;
  createdAt?: string;
  stats?: { users: number; parties: number; receivable: number; monthSales: number; monthInvoices: number };
}

export interface CompanySettings {
  general: { currencySymbol: string; currencyCode: string; dateFormat: string; decimalPlaces: number; financialYearStartMonth: number; multiFirm: boolean; timezone: string };
  transaction: {
    prefixes: Record<string, string>;
    enableEstimate: boolean; enableProforma: boolean; enableSaleOrder: boolean; enableDeliveryChallan: boolean; enablePurchaseOrder: boolean;
    roundOff: boolean; itemwiseDiscount: boolean; itemwiseTax: boolean; billDiscount: boolean; additionalCharges: boolean;
    dueDates: boolean; defaultDueDays: number; cashSaleByDefault: boolean; allowNegativeStock: boolean; showProfitOnInvoice: boolean; stateOfSupply: boolean;
  };
  print: {
    defaultTemplate: string; templates: Record<string, string>; themeColor: string; paperSize: string;
    showLogo: boolean; showSignature: boolean; showHsn: boolean; showTaxBreakup: boolean; showAmountInWords: boolean; showBankDetails: boolean; showTerms: boolean; showPreviousBalance: boolean;
    termsAndConditions: string; footerNote: string; bankDetails: string; upiId: string;
  };
  taxes: { enableGst: boolean; rates: { name: string; rate: number }[] };
  items: { enableStock: boolean; enableCategories: boolean; enableUnits: boolean; enableWholesalePrice: boolean; enableItemCode: boolean; enableHsn: boolean; enableMrp: boolean; lowStockAlert: boolean; defaultTaxRate: number };
  parties: { enableGroups: boolean; enableShippingAddress: boolean; enableCreditLimit: boolean; enableGstin: boolean };
  email: {
    smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string; fromName: string; fromEmail: string;
    imapHost: string; imapPort: number; imapSecure: boolean; imapUser: string; imapPass: string;
    autoSendInvoice: boolean; paymentReminders: boolean; reminderDaysAfterDue: number; dailySummary: boolean; dailySummaryTo: string;
  };
  hr: { workingDaysPerMonth: number; weeklyOff: number[]; halfDayFactor: number; paidLeavePerMonth: number };
}

export interface SessionUser {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  isSuperAdmin: boolean;
  company?: string | null;
  role?: { _id: string; name: string } | null;
}

export interface Session {
  user: SessionUser;
  permissions: string[];
  company: (Company & { settings: CompanySettings }) | null;
  home: string;
}

export interface Paged<T> {
  data: T[];
  meta?: { total: number; page: number; limit: number; pages: number; summary?: Record<string, number>; [k: string]: unknown };
}
