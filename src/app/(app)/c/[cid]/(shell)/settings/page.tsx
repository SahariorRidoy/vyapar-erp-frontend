'use client';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Briefcase, Building2, Database, Mail, Package, Percent, Printer, Receipt, ShieldCheck, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useQueryState } from '@/hooks/use-query-state';
import { useConfirm } from '@/components/ui/confirm';
import { NoAccess, PageHeader, PageLoader } from '@/components/ui/misc';
import { BusinessTab } from '@/components/settings/business-tab';
import { ApprovalsTab, GeneralTab, HrTab, ItemsTab, PartiesTab, TaxTab, TransactionTab } from '@/components/settings/general-tabs';
import { PrintTab } from '@/components/settings/print-tab';
import { EmailTab } from '@/components/settings/email-tab';
import { DataTab } from '@/components/settings/data-tab';

type TabProps = { onDirtyChange: (d: boolean) => void };

const TABS: { key: string; label: string; hint: string; icon: LucideIcon; Component: ComponentType<TabProps> }[] = [
  { key: 'business', label: 'Business profile', hint: 'Name, BIN, address, logo', icon: Building2, Component: BusinessTab },
  { key: 'general', label: 'General', hint: 'Currency, dates, time zone', icon: SlidersHorizontal, Component: GeneralTab },
  { key: 'transactions', label: 'Transactions', hint: 'Documents, fields, numbering', icon: Receipt, Component: TransactionTab },
  { key: 'print', label: 'Print & templates', hint: 'Invoice and receipt designs', icon: Printer, Component: PrintTab },
  { key: 'taxes', label: 'Taxes & VAT', hint: 'VAT rates', icon: Percent, Component: TaxTab },
  { key: 'items', label: 'Items', hint: 'Stock, units, codes', icon: Package, Component: ItemsTab },
  { key: 'parties', label: 'Parties', hint: 'Groups, BIN, credit limit', icon: Users, Component: PartiesTab },
  { key: 'approvals', label: 'Approvals', hint: 'Changes that need approval', icon: ShieldCheck, Component: ApprovalsTab },
  { key: 'email', label: 'Email & automations', hint: 'SMTP, inbox, reminders', icon: Mail, Component: EmailTab },
  { key: 'hr', label: 'HR & payroll', hint: 'Weekly off, working days', icon: Briefcase, Component: HrTab },
  { key: 'data', label: 'Backup & data', hint: 'Backup, import, maintenance', icon: Database, Component: DataTab },
];

export default function SettingsPage() {
  const { can, company, settings } = useCompany();
  const confirm = useConfirm();
  const { params, set } = useQueryState();
  const active = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0]!;
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!can('settings.manage')) return <NoAccess what="company settings" />;
  if (!company || !settings) return <PageLoader />;

  const go = async (key: string) => {
    if (key === active.key) return;
    if (dirty && !(await confirm({ title: 'Leave without saving?', message: `Your changes in ${active.label} will be lost.`, confirmText: 'Leave', cancelText: 'Stay', danger: true }))) return;
    setDirty(false);
    set({ tab: key === 'business' ? null : key });
  };
  const Active = active.Component;

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description={`Changes apply to everyone in ${company.name}. Only admins can open this page.`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <ul className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-2">
            {TABS.map((t) => {
              const on = t.key === active.key;
              const Icon = t.icon;
              return (
                <li key={t.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(t.key)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors',
                      on ? 'bg-blue-50 font-semibold text-blue-700' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:border-0 lg:bg-transparent',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-blue-600' : 'text-slate-400')} />
                    <span className="min-w-0">
                      <span className="block">{t.label}</span>
                      <span className="hidden truncate text-[11px] font-normal text-slate-400 lg:block">{t.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          <Active key={active.key} onDirtyChange={onDirtyChange} />
        </div>
      </div>
    </div>
  );
}
