'use client';
import type { ReactNode } from 'react';
import { BadgeCheck, Banknote, Boxes, BriefcaseBusiness, FileBarChart2, History, Home, Mail, Receipt, Settings, ShoppingCart, Users, UsersRound, Wrench } from 'lucide-react';
import { useCompany } from '@/providers/company';

export interface NavLeaf {
  label: string;
  href: string;
  perm?: string[];
  show?: boolean;
  badge?: number;
}
export interface NavGroup {
  label: string;
  icon: ReactNode;
  href?: string;
  perm?: string[];
  children?: NavLeaf[];
  badge?: number;
}

/** The company menu, shared by the sidebar and the quick search. Hrefs are company-relative. */
export function useNav(): NavGroup[] {
  const { settings } = useCompany();
  const t = settings?.transaction;
  return [
    { label: 'Home', icon: <Home className="h-[18px] w-[18px]" />, href: '/dashboard', perm: ['dashboard.view'] },
    { label: 'Parties', icon: <Users className="h-[18px] w-[18px]" />, href: '/parties', perm: ['parties.view'] },
    { label: 'Items', icon: <Boxes className="h-[18px] w-[18px]" />, href: '/items', perm: ['items.view'] },
    {
      label: 'Sale',
      icon: <Receipt className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Sale Invoices', href: '/sale/invoices', perm: ['sale_invoice.view'] },
        { label: 'Estimate / Quotation', href: '/sale/estimates', perm: ['estimate.view'], show: t?.enableEstimate !== false },
        { label: 'Proforma Invoice', href: '/sale/proforma', perm: ['proforma_invoice.view'], show: t?.enableProforma !== false },
        { label: 'Payment In', href: '/sale/payment-in', perm: ['payment_in.view'] },
        { label: 'Sale Order', href: '/sale/orders', perm: ['sale_order.view'], show: t?.enableSaleOrder !== false },
        { label: 'Delivery Challan', href: '/sale/delivery-challans', perm: ['delivery_challan.view'], show: t?.enableDeliveryChallan !== false },
        { label: 'Sale Return / Cr. Note', href: '/sale/returns', perm: ['sale_return.view'] },
      ],
    },
    {
      label: 'Purchase & Expense',
      icon: <ShoppingCart className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Purchase Bills', href: '/purchase/bills', perm: ['purchase_bill.view'] },
        { label: 'Payment Out', href: '/purchase/payment-out', perm: ['payment_out.view'] },
        { label: 'Expenses', href: '/purchase/expenses', perm: ['expense.view'] },
        { label: 'Purchase Order', href: '/purchase/orders', perm: ['purchase_order.view'], show: t?.enablePurchaseOrder !== false },
        { label: 'Purchase Return / Dr. Note', href: '/purchase/returns', perm: ['purchase_return.view'] },
      ],
    },
    {
      label: 'Cash & Bank',
      icon: <Banknote className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Bank & Cash Accounts', href: '/cash-bank', perm: ['cash_bank.view'] },
        { label: 'Cheques', href: '/cash-bank/cheques', perm: ['cash_bank.view'] },
        { label: 'Loan Accounts', href: '/cash-bank/loans', perm: ['cash_bank.view'] },
      ],
    },
    { label: 'Reports', icon: <FileBarChart2 className="h-[18px] w-[18px]" />, href: '/reports', perm: ['reports.view'] },
    {
      label: 'HR & Payroll',
      icon: <BriefcaseBusiness className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Employees', href: '/hr/employees', perm: ['employees.view', 'employees.manage'] },
        { label: 'Attendance', href: '/hr/attendance', perm: ['attendance.view', 'attendance.manage'] },
        { label: 'Payroll', href: '/hr/payroll', perm: ['payroll.view', 'payroll.manage'] },
        { label: 'Salary & Leave Requests', href: '/hr/requests', perm: ['hr_requests.manage'] },
        { label: 'My Attendance & Pay', href: '/hr/me' },
      ],
    },
    { label: 'Approvals', icon: <BadgeCheck className="h-[18px] w-[18px]" />, href: '/approvals' },
    { label: 'Email', icon: <Mail className="h-[18px] w-[18px]" />, href: '/email', perm: ['email.use'] },
    {
      label: 'Users & Roles',
      icon: <UsersRound className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Users', href: '/users', perm: ['users.manage'] },
        { label: 'Roles & Permissions', href: '/roles', perm: ['roles.manage', 'users.manage'] },
      ],
    },
    { label: 'Activity Log', icon: <History className="h-[18px] w-[18px]" />, href: '/activity', perm: ['audit.view'] },
    {
      label: 'Utilities',
      icon: <Wrench className="h-[18px] w-[18px]" />,
      children: [
        { label: 'Import Items', href: '/items/import', perm: ['items.import'] },
        { label: 'Import Parties', href: '/parties/import', perm: ['parties.import'] },
        { label: 'Update Items in Bulk', href: '/items/bulk-update', perm: ['items.edit'] },
        { label: 'Barcode Labels', href: '/print/barcodes', perm: ['items.view'], show: settings?.items.enableItemCode !== false },
        { label: 'Backup & Data', href: '/settings?tab=data', perm: ['settings.manage'] },
      ],
    },
    { label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" />, href: '/settings', perm: ['settings.manage'] },
  ];
}

/**
 * The menu entry for the current page: the longest link that is the page itself or a parent of it, so
 * /cash-bank/cheques lights up Cheques and not Bank & Cash Accounts. Links with a query never match.
 */
export function activeNavHref(nav: NavGroup[], pathname: string, href: (path: string) => string) {
  let best: string | null = null;
  for (const h of nav.flatMap((g) => (g.children ? g.children.map((c) => c.href) : g.href ? [g.href] : []))) {
    if (h.includes('?')) continue;
    const full = href(h);
    if ((pathname === full || pathname.startsWith(`${full}/`)) && (!best || h.length > best.length)) best = h;
  }
  return best;
}

/** Quick create entries (top bar Create menu and quick search) the user's role allows. */
export function useQuickCreate() {
  const { can } = useCompany();
  return [
    { label: 'Sale Invoice', href: '/sale/invoices/new', perm: 'sale_invoice.create' },
    { label: 'Purchase Bill', href: '/purchase/bills/new', perm: 'purchase_bill.create' },
    { label: 'Payment In', href: '/sale/payment-in?new=1', perm: 'payment_in.create' },
    { label: 'Payment Out', href: '/purchase/payment-out?new=1', perm: 'payment_out.create' },
    { label: 'Expense', href: '/purchase/expenses/new', perm: 'expense.create' },
    { label: 'Estimate', href: '/sale/estimates/new', perm: 'estimate.create' },
    { label: 'Party', href: '/parties?new=1', perm: 'parties.create' },
    { label: 'Item', href: '/items?new=1', perm: 'items.create' },
  ].filter((q) => can(q.perm));
}
