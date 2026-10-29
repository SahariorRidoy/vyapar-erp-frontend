'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Plus, Trash2 } from 'lucide-react';
import { MONTHS } from '@/lib/constants';
import type { CompanySettings, TxnType } from '@/lib/types';
import { TXN } from '@/lib/txn';
import { cn, inZone } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Select } from '@/components/ui/input';
import { SaveBar, SettingsCard, Toggle, ToggleList, useSection } from './section';

type DirtyProps = { onDirtyChange: (d: boolean) => void };

const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D MMM YYYY'];
const COMMON_ZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Karachi', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

function useTimeZones() {
  return useMemo(() => {
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([...COMMON_ZONES, ...all])];
  }, []);
}

export function GeneralTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('general', onDirtyChange);
  const zones = useTimeZones();
  const d = s.draft;
  if (!d) return null;
  const sample = 1234567.891;
  const preview = `${d.currencySymbol || ''} ${sample.toLocaleString('en-IN', { minimumFractionDigits: d.decimalPlaces, maximumFractionDigits: d.decimalPlaces })}`.trim();
  return (
    <div className="space-y-4">
      <SettingsCard title="Money and dates" description="How amounts and dates appear on every screen, report and print.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Currency symbol" hint={`Amounts look like ${preview}`}>
            <Input value={d.currencySymbol} onChange={(e) => s.set('currencySymbol', e.target.value.slice(0, 4))} />
          </Field>
          <Field label="Decimal places" hint="For amounts. Quantities always keep up to 3 decimals.">
            <Select value={d.decimalPlaces} onChange={(e) => s.set('decimalPlaces', Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'None (1,235)' : `${n} (${(1234.5).toFixed(n)})`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date format" hint={`Today is shown as ${dayjs().format(d.dateFormat)}`}>
            <Select value={d.dateFormat} onChange={(e) => s.set('dateFormat', e.target.value)}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f} ({dayjs().format(f)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Financial year starts in" hint='Used by the "This Financial Year" filter on reports and lists.'>
            <Select value={d.financialYearStartMonth} onChange={(e) => s.set('financialYearStartMonth', Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time zone" hint={`Now: ${inZone(new Date(), d.timezone, { dateStyle: 'medium', timeStyle: 'short' })}. Used for attendance check-in times and "today".`} className="md:col-span-2">
            <Select value={d.timezone} onChange={(e) => s.set('timezone', e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}

const PREFIX_TYPES: TxnType[] = ['SALE', 'ESTIMATE', 'PROFORMA', 'SALE_ORDER', 'DELIVERY_CHALLAN', 'SALE_RETURN', 'PAYMENT_IN', 'PURCHASE', 'PURCHASE_ORDER', 'PURCHASE_RETURN', 'PAYMENT_OUT', 'EXPENSE'];

export function TransactionTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('transaction', onDirtyChange);
  const d = s.draft;
  if (!d) return null;
  const t = <K extends keyof CompanySettings['transaction']>(k: K) => ({ checked: d[k] as boolean, onChange: (v: boolean) => s.set(k, v as CompanySettings['transaction'][K]) });
  return (
    <div className="space-y-4">
      <SettingsCard title="Documents you use" description="Switched off documents disappear from the menu. Existing ones stay in your records.">
        <ToggleList>
          <Toggle label="Estimate / Quotation" description="Send quotes and convert them into invoices" {...t('enableEstimate')} />
          <Toggle label="Proforma Invoice" description="Ask for an advance before the final invoice, then convert it" {...t('enableProforma')} />
          <Toggle label="Sale Order" description="Take orders before delivering" {...t('enableSaleOrder')} />
          <Toggle label="Delivery Challan" description="Send goods with a challan and bill later" {...t('enableDeliveryChallan')} />
          <Toggle label="Purchase Order" description="Order stock from suppliers" {...t('enablePurchaseOrder')} />
        </ToggleList>
      </SettingsCard>
      <SettingsCard title="Invoice form" description="Fields shown while creating sale and purchase documents.">
        <ToggleList>
          <Toggle label="Cash sale by default" description="New invoices start as cash sales without a party" {...t('cashSaleByDefault')} />
          <Toggle label="Item-wise discount" {...t('itemwiseDiscount')} />
          <Toggle label="Item-wise tax" {...t('itemwiseTax')} />
          <Toggle label="Discount on the whole bill" {...t('billDiscount')} />
          <Toggle label="Additional charges" description="Freight, packing, installation and similar" {...t('additionalCharges')} />
          <Toggle label="Round off totals" description="New documents round the total to the nearest taka" {...t('roundOff')} />
          <Toggle label="Delivery division" description="Pick the division goods are delivered to; printed on the document" {...t('stateOfSupply')} />
          <Toggle label="Show profit while making a sale" description="An estimate from purchase prices, only on screen and never printed" {...t('showProfitOnInvoice')} />
          <Toggle label="Allow negative stock" description="Sell even when the stock would go below zero" {...t('allowNegativeStock')} />
        </ToggleList>
      </SettingsCard>
      <SettingsCard title="Due dates" description="Payment terms for invoices, bills and orders.">
        <ToggleList>
          <Toggle label="Use due dates" {...t('dueDates')} />
        </ToggleList>
        {d.dueDates && (
          <Field label="Default credit period (days)" className="mt-3 max-w-xs" hint={d.defaultDueDays ? `An invoice dated today falls due on ${dayjs().add(d.defaultDueDays, 'day').format('D MMM YYYY')}` : 'Due on the invoice date'}>
            <NumberInput value={d.defaultDueDays} min={0} onValueChange={(v) => s.set('defaultDueDays', Math.max(0, Math.round(v)))} />
          </Field>
        )}
      </SettingsCard>
      <SettingsCard title="Document numbers" description="Each new document takes the prefix plus the next running number. Changing a prefix does not renumber old documents.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PREFIX_TYPES.map((type) => (
            <Field key={type} label={TXN[type].label} hint={`Next looks like ${d.prefixes[type] ?? ''}1`}>
              <Input value={d.prefixes[type] ?? ''} maxLength={12} onChange={(e) => s.set('prefixes', { ...d.prefixes, [type]: e.target.value.replace(/\s/g, '') })} />
            </Field>
          ))}
        </div>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}

export function TaxTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('taxes', onDirtyChange);
  const d = s.draft;
  if (!d) return null;
  const rates = d.rates;
  const setRate = (i: number, patch: Partial<{ name: string; rate: number }>) => s.set('rates', rates.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dupes = new Set(rates.map((r) => r.rate).filter((r, i, a) => a.indexOf(r) !== i));
  return (
    <div className="space-y-4">
      <SettingsCard title="VAT">
        <ToggleList>
          <Toggle label="Enable VAT" description="Charge VAT on items and invoices. When off, new documents carry no VAT." checked={d.enableGst} onChange={(v) => s.set('enableGst', v)} />
        </ToggleList>
      </SettingsCard>
      <SettingsCard
        title="VAT rates"
        description="Offered in the VAT column of item and invoice forms. Bangladesh's standard rate is 15%, with reduced rates of 5%, 7.5% and 10%."
        actions={
          <Button variant="outline" size="sm" onClick={() => s.set('rates', [...rates, { name: '', rate: 0 }])} disabled={rates.length >= 20}>
            <Plus className="h-4 w-4" /> Add rate
          </Button>
        }
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_120px_40px] gap-2 text-xs font-medium text-slate-500">
            <span>Name</span>
            <span className="text-right">Rate %</span>
            <span />
          </div>
          {rates.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_40px] items-center gap-2">
              <Input value={r.name} onChange={(e) => setRate(i, { name: e.target.value })} placeholder={`VAT ${r.rate}%`} aria-label="Tax name" />
              <NumberInput value={r.rate} min={0} onValueChange={(v) => setRate(i, { rate: Math.min(100, Math.max(0, v)) })} aria-label="Tax rate" className={cn(dupes.has(r.rate) && 'border-amber-400')} />
              <button type="button" onClick={() => s.set('rates', rates.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${r.name || `${r.rate}%`}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {dupes.size > 0 && <p className="text-xs text-amber-700">Two rates have the same percentage. Keep one so the list stays clear.</p>}
          {rates.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No tax rates. Add at least 0% (exempted).</p>}
        </div>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate({ ...d, rates: rates.map((r) => ({ name: r.name.trim() || `VAT ${r.rate}%`, rate: r.rate })) })} onDiscard={s.reset} />
    </div>
  );
}

export function ItemsTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('items', onDirtyChange);
  const { settings } = useCompany();
  const d = s.draft;
  if (!d) return null;
  const t = <K extends keyof CompanySettings['items']>(k: K) => ({ checked: d[k] as boolean, onChange: (v: boolean) => s.set(k, v as CompanySettings['items'][K]) });
  return (
    <div className="space-y-4">
      <SettingsCard title="Item details" description="Fields shown on the item form, lists and invoices.">
        <ToggleList>
          <Toggle label="Track stock" description="Keep stock quantities, low stock and stock value" {...t('enableStock')} />
          <Toggle label="Low stock alerts" description="Notify stock managers when items fall to their minimum stock" {...t('lowStockAlert')} disabled={!d.enableStock} />
          <Toggle label="Item categories" {...t('enableCategories')} />
          <Toggle label="Units and unit conversion" description="Sell in boxes and pieces with a conversion rate" {...t('enableUnits')} />
          <Toggle label="Item code / SKU" description="Codes are generated automatically and can be edited" {...t('enableItemCode')} />
          <Toggle label="HS code" description="Harmonized System code, printed on VAT invoices" {...t('enableHsn')} />
          <Toggle label="Wholesale price" description="A lower price applied from a minimum quantity" {...t('enableWholesalePrice')} />
          <Toggle label="MRP" description="Maximum retail price on the item" {...t('enableMrp')} />
        </ToggleList>
      </SettingsCard>
      <SettingsCard title="Defaults">
        <Field label="Default tax rate for new items" className="max-w-xs">
          <Select value={d.defaultTaxRate} onChange={(e) => s.set('defaultTaxRate', Number(e.target.value))}>
            {(settings?.taxes.rates ?? []).map((r) => (
              <option key={r.rate} value={r.rate}>
                {r.name} ({r.rate}%)
              </option>
            ))}
          </Select>
        </Field>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}

export function PartiesTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('parties', onDirtyChange);
  const d = s.draft;
  if (!d) return null;
  const t = <K extends keyof CompanySettings['parties']>(k: K) => ({ checked: d[k] as boolean, onChange: (v: boolean) => s.set(k, v as CompanySettings['parties'][K]) });
  return (
    <div className="space-y-4">
      <SettingsCard title="Party details" description="Fields shown on the party form and printed on documents.">
        <ToggleList>
          <Toggle label="Party groups" description="Group parties as wholesale, retail, suppliers and so on" {...t('enableGroups')} />
          <Toggle label="BIN and VAT type" {...t('enableGstin')} />
          <Toggle label="Shipping address" description="A separate delivery address, printed as Ship To" {...t('enableShippingAddress')} />
          <Toggle label="Credit limit" description="Warn when an invoice takes a customer over their limit" {...t('enableCreditLimit')} />
        </ToggleList>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}

export function ApprovalsTab() {
  const { href } = useCompany();
  const link = 'font-medium text-blue-600 hover:underline';
  return (
    <SettingsCard title="Changes that need approval" description="Approval is set per role, so each team can have its own rules.">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>
          Open{' '}
          <Link href={href('/roles')} className={link}>
            Roles & permissions
          </Link>{' '}
          and pick a role.
        </li>
        <li>Tick the actions the role may do. Under a ticked Edit, Delete or Adjust stock, click the shield to make it wait for approval.</li>
        <li>
          When someone with that role does it, the change waits in{' '}
          <Link href={href('/approvals')} className={link}>
            Approvals
          </Link>{' '}
          and applies only after an approver accepts it.
        </li>
      </ol>
      <ul className="mt-4 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <li>Approval can be required for editing, cancelling and deleting documents, editing and deleting items and parties, and adding or removing stock adjustments. Creating never needs approval.</li>
        <li>Items ▸ Delete also covers item categories, units and unit conversions. Parties ▸ Delete also covers party groups.</li>
        <li>Cancelling a document applies at once only if the role can Delete that document without approval; otherwise it waits for approval.</li>
        <li>Approvers are roles with Approvals ▸ Manage. They are notified in every company. The Admin role and super admins never need approval.</li>
        <li>Leave and salary advance requests always need approval.</li>
      </ul>
    </SettingsCard>
  );
}

export function HrTab({ onDirtyChange }: DirtyProps) {
  const s = useSection('hr', onDirtyChange);
  const d = s.draft;
  if (!d) return null;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toggleDay = (i: number) => s.set('weeklyOff', d.weeklyOff.includes(i) ? d.weeklyOff.filter((x) => x !== i) : [...d.weeklyOff, i].sort());
  return (
    <div className="space-y-4">
      <SettingsCard title="Working days" description="Used by attendance registers and to work out daily pay for monthly salaries.">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Weekly off</p>
            <div className="flex flex-wrap gap-2">
              {days.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(i)}
                  aria-pressed={d.weeklyOff.includes(i)}
                  className={cn('h-9 min-w-12 rounded-lg border px-3 text-sm font-medium transition-colors', d.weeklyOff.includes(i) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{d.weeklyOff.length ? 'Shown as W on the attendance register and never counted as absent.' : 'No weekly off: every day is a working day.'}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Working days per month" hint={`Monthly pay = salary × payable days ÷ ${d.workingDaysPerMonth || 26}`}>
              <NumberInput value={d.workingDaysPerMonth} min={1} onValueChange={(v) => s.set('workingDaysPerMonth', Math.min(31, Math.max(1, Math.round(v))))} />
            </Field>
            <Field label="Half day counts as" hint="Part of a full day's pay">
              <Select value={d.halfDayFactor} onChange={(e) => s.set('halfDayFactor', Number(e.target.value))}>
                {[0.25, 0.5, 0.75].map((n) => (
                  <option key={n} value={n}>
                    {n} day
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid leave per month" hint="Approved leave up to this many days a month is paid">
              <NumberInput value={d.paidLeavePerMonth} min={0} onValueChange={(v) => s.set('paidLeavePerMonth', Math.min(31, Math.max(0, v)))} />
            </Field>
          </div>
        </div>
      </SettingsCard>
      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}
