'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { CompanySettings, TxnType } from '@/lib/types';
import { TXN } from '@/lib/txn';
import { cn } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { templatesFor, type TemplateDef } from '@/components/print/registry';
import { PrintPreview } from './print-preview';
import { SaveBar, SettingsCard, Toggle, ToggleList, useSection } from './section';

const SWATCHES = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#0f172a', '#4d7c0f', '#0369a1', '#a16207', '#db2777'];
const DOC_TYPES: TxnType[] = ['SALE', 'ESTIMATE', 'PROFORMA', 'SALE_ORDER', 'DELIVERY_CHALLAN', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_ORDER', 'PURCHASE_RETURN', 'EXPENSE'];
const RECEIPT_TYPES: TxnType[] = ['PAYMENT_IN', 'PAYMENT_OUT'];

function TemplateGrid({ list, value, onPick }: { list: TemplateDef[]; value: string; onPick: (key: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            aria-pressed={on}
            className={cn('relative rounded-lg border p-3 text-left transition-colors', on ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{t.name}</span>
              <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">{t.paper}</span>
              {on && <Check className="ml-auto h-4 w-4 text-blue-600" />}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">{t.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PrintTab({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const s = useSection('print', onDirtyChange);
  const { company, settings, href } = useCompany();
  const docs = templatesFor('document');
  const receipts = templatesFor('receipt');
  const [previewKind, setPreviewKind] = useState<'document' | 'receipt'>('document');
  const d = s.draft;
  const previewSettings = useMemo(() => (settings && d ? ({ ...settings, print: d } as CompanySettings) : null), [settings, d]);
  if (!d || !company || !previewSettings) return null;

  const docDefault = docs.find((t) => t.key === d.defaultTemplate)?.key ?? docs[0]!.key;
  const receiptDefault = receipts.find((t) => t.key === d.templates.RECEIPT)?.key ?? receipts[0]!.key;
  const setTemplate = (type: string, key: string) => {
    const next = { ...d.templates, [type]: key };
    if (!key) delete next[type];
    s.set('templates', next);
  };
  // Removed overrides are sent as "" so the server forgets them.
  const payload = () => ({ ...d, templates: { ...Object.fromEntries(Object.keys(s.saved?.templates ?? {}).map((k) => [k, ''])), ...d.templates } });
  const t = <K extends keyof CompanySettings['print']>(k: K) => ({ checked: d[k] as boolean, onChange: (v: boolean) => s.set(k, v as CompanySettings['print'][K]) });
  const overrides = [...DOC_TYPES, ...RECEIPT_TYPES].filter((type) => d.templates[type]).length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <SettingsCard title="Invoice template" description="Used for invoices, bills, orders, challans, returns and expenses.">
          <TemplateGrid
            list={docs}
            value={docDefault}
            onPick={(k) => {
              s.set('defaultTemplate', k);
              setPreviewKind('document');
            }}
          />
        </SettingsCard>
        <SettingsCard title="Receipt template" description="Used for Payment In receipts and Payment Out vouchers.">
          <TemplateGrid
            list={receipts}
            value={receiptDefault}
            onPick={(k) => {
              setTemplate('RECEIPT', k);
              setPreviewKind('receipt');
            }}
          />
        </SettingsCard>
        <SettingsCard title="Different template per document" description={overrides ? `${overrides} document type${overrides > 1 ? 's use their' : ' uses its'} own template.` : 'Optional. For example, the Thermal format for sale invoices only.'}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...DOC_TYPES, ...RECEIPT_TYPES].map((type) => {
              const receipt = RECEIPT_TYPES.includes(type);
              const list = receipt ? receipts : docs;
              const fallback = list.find((x) => x.key === (receipt ? receiptDefault : docDefault))!;
              return (
                <Field key={type} label={TXN[type].label}>
                  <Select
                    value={d.templates[type] ?? ''}
                    onChange={(e) => {
                      setTemplate(type, e.target.value);
                      setPreviewKind(receipt ? 'receipt' : 'document');
                    }}
                  >
                    <option value="">Same as default ({fallback.name})</option>
                    {list.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            })}
          </div>
        </SettingsCard>
        <SettingsCard title="Colour" description="Accent colour of headings, table headers and totals.">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => s.set('themeColor', c)}
                className={cn('h-8 w-8 rounded-full ring-offset-2 transition', d.themeColor.toLowerCase() === c ? 'ring-2 ring-slate-900' : 'hover:scale-110')}
                style={{ background: c }}
                aria-label={`Use colour ${c}`}
                aria-pressed={d.themeColor.toLowerCase() === c}
              />
            ))}
            <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
              <input type="color" value={d.themeColor} onChange={(e) => s.set('themeColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5" aria-label="Custom colour" />
              Custom
            </label>
          </div>
        </SettingsCard>
        <SettingsCard
          title="What to print"
          description={
            <>
              Logo and signature come from the{' '}
              <Link href={href('/settings?tab=business')} className="font-medium text-blue-600 hover:underline">
                business profile
              </Link>
              .
            </>
          }
        >
          <ToggleList>
            <Toggle label="Business logo" {...t('showLogo')} />
            <Toggle label="Authorised signature" {...t('showSignature')} />
            <Toggle label="HS code column" {...t('showHsn')} />
            <Toggle label="VAT summary table" description="Taxable value and VAT per rate" {...t('showTaxBreakup')} />
            <Toggle label="Amount in words" {...t('showAmountInWords')} />
            <Toggle label="Bank and bKash / Nagad details" description="On invoices, estimates and sale orders" {...t('showBankDetails')} />
            <Toggle label="Terms and conditions" {...t('showTerms')} />
            <Toggle label="Previous and current balance" description="The customer's running balance on sale invoices" {...t('showPreviousBalance')} />
          </ToggleList>
        </SettingsCard>
        <SettingsCard title="Text on documents">
          <div className="space-y-4">
            <Field label="Terms and conditions" hint="One per line. A document's own terms replace these.">
              <Textarea value={d.termsAndConditions} onChange={(e) => s.set('termsAndConditions', e.target.value)} rows={4} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Bank details" hint="Bank, branch, account name, number and routing number">
                <Textarea value={d.bankDetails} onChange={(e) => s.set('bankDetails', e.target.value)} rows={4} placeholder={'Dutch-Bangla Bank, Dhanmondi Branch\nA/c No: 105110…\nRouting No: 090260…'} />
              </Field>
              <div className="space-y-4">
                <Field label="bKash / Nagad number" hint="Printed so customers can pay the amount due">
                  <Input value={d.upiId} onChange={(e) => s.set('upiId', e.target.value.trim())} inputMode="tel" placeholder="01XXXXXXXXX" />
                </Field>
                <Field label="Footer note" hint="A short line at the bottom of every print">
                  <Input value={d.footerNote} onChange={(e) => s.set('footerNote', e.target.value)} placeholder="Thank you for your business!" />
                </Field>
              </div>
            </div>
          </div>
        </SettingsCard>
        <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(payload())} onDiscard={s.reset} />
      </div>
      <div className="order-first min-w-0 xl:sticky xl:top-4 xl:order-none xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Live preview</p>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
            {(['document', 'receipt'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setPreviewKind(k)} className={cn('rounded-md px-2.5 py-1', previewKind === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {k === 'document' ? 'Invoice' : 'Receipt'}
              </button>
            ))}
          </div>
        </div>
        <PrintPreview templateKey={previewKind === 'document' ? docDefault : receiptDefault} company={company} settings={previewSettings} width={354} />
      </div>
    </div>
  );
}
