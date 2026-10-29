'use client';
import { money } from '@/lib/utils';
import { ImportWizard, type ImportColumn, type ImportRow } from '@/components/import/import-wizard';

interface PartyRow extends ImportRow {
  phone?: string;
  email?: string;
  gstin?: string;
  gstType: 'unregistered' | 'regular' | 'composition' | 'consumer';
  state?: string;
  billingAddress?: string;
  shippingAddress?: string;
  group?: string;
  partyType: 'customer' | 'supplier' | 'both';
  openingBalance: number;
  openingType: 'receive' | 'pay';
  creditLimit?: number;
  notes?: string;
}

const VAT_LABEL: Record<PartyRow['gstType'], string> = { unregistered: 'Unregistered', consumer: 'Consumer', regular: 'VAT Registered', composition: 'Turnover Tax' };
const TYPE_LABEL: Record<PartyRow['partyType'], string> = { customer: 'Customer', supplier: 'Supplier', both: 'Customer & supplier' };

const COLUMNS: ImportColumn<PartyRow>[] = [
  { label: 'Party name', render: (r) => <span className="font-medium text-slate-900">{r.name || <span className="text-rose-600 italic">missing</span>}</span> },
  {
    label: 'Contact',
    render: (r) => (
      <span className="block text-xs text-slate-600">
        {r.phone || '—'}
        {r.email && <span className="block text-slate-500">{r.email}</span>}
      </span>
    ),
  },
  {
    label: 'VAT',
    render: (r) => (
      <span className="block text-xs text-slate-600">
        {VAT_LABEL[r.gstType]}
        {r.gstin && <span className="block font-mono text-slate-500">{r.gstin}</span>}
      </span>
    ),
  },
  { label: 'Division', render: (r) => <span className="text-slate-600">{r.state || '—'}</span> },
  { label: 'Group', render: (r) => <span className="text-slate-600">{r.group || '—'}</span> },
  { label: 'Type', render: (r) => <span className="text-xs text-slate-600">{TYPE_LABEL[r.partyType]}</span> },
  {
    label: 'Opening balance',
    align: 'right',
    render: (r) =>
      r.openingBalance ? (
        <span className={r.openingType === 'pay' ? 'text-rose-600' : 'text-emerald-600'}>
          {money(r.openingBalance)} <span className="text-[11px]">{r.openingType === 'pay' ? 'to pay' : 'to receive'}</span>
        </span>
      ) : (
        '—'
      ),
  },
  { label: 'Credit limit', align: 'right', render: (r) => (r.creditLimit ? money(r.creditLimit) : '—') },
];

export default function ImportPartiesPage() {
  return (
    <ImportWizard<PartyRow>
      resource="parties"
      noun={{ one: 'party', many: 'parties' }}
      title="Import parties from Excel"
      description="Bring in your customers and suppliers with their opening balances in one go. Groups that don't exist yet are created for you."
      templateHelp={
        <>
          Fill one party per row. Only <b>Party Name</b> is required. <b>Balance Type</b> is &quot;To receive&quot; when the party owes you and &quot;To pay&quot; when you owe them. A party with a
          <b> BIN</b> and no VAT Type is treated as VAT registered. <b>Division</b> takes Bangladesh&apos;s divisions, such as Dhaka or Chattogram.
        </>
      }
      doneNote="Opening balances are recorded as of today and show in each party's balance and statement."
      columns={COLUMNS}
      minWidth={1100}
    />
  );
}
