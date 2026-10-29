'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Calculator, DatabaseBackup, FileSpreadsheet, History, Upload } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button, buttonClass } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { SettingsCard } from './section';

function Row({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function DataTab() {
  const { cid, can, href } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const backup = useMutation({
    mutationFn: () => api.download('/settings/backup', undefined, 'backup.json'),
    onSuccess: () => toast.success('Backup downloaded', { description: 'Keep the file somewhere safe. Passwords are not included.' }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const recalc = useMutation({
    mutationFn: async () => (await api.post<{ documents: number; parties: number; items: number }>('/settings/recalculate')).data,
    onSuccess: (r) => {
      invalidateCompany(qc, cid);
      toast.success('Balances recalculated', { description: `${plural(r.documents, 'document')}, ${plural(r.parties, 'party')} and ${plural(r.items, 'item')} checked.` });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <SettingsCard title="Backup" description="Your data lives in your own MongoDB database and hosting storage. Download a copy any time.">
        <div className="divide-y divide-slate-100">
          <Row
            icon={<DatabaseBackup className="h-5 w-5" />}
            title="Download full backup"
            description="Every party, item, document, payment, employee and setting of this company as one JSON file. Email passwords are left out."
            action={
              <Button onClick={() => backup.mutate()} loading={backup.isPending}>
                Download backup
              </Button>
            }
          />
          {can('reports.view') && (
            <Row
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="Export to Excel"
              description="Every report (sales, purchases, party statements, stock, VAT, day book and more) downloads as Excel."
              action={
                <Link href={href('/reports')} className={buttonClass({ variant: 'outline' })}>
                  Open reports
                </Link>
              }
            />
          )}
          {can('items.import') && (
            <Row
              icon={<Upload className="h-5 w-5" />}
              title="Import items from Excel"
              description="Bring in your item list with prices, stock, units and tax in one go."
              action={
                <Link href={href('/items/import')} className={buttonClass({ variant: 'outline' })}>
                  Import items
                </Link>
              }
            />
          )}
        </div>
      </SettingsCard>
      <SettingsCard title="Maintenance">
        <div className="divide-y divide-slate-100">
          <Row
            icon={<Calculator className="h-5 w-5" />}
            title="Recalculate balances"
            description="Rebuilds every party balance, item stock and document status from the documents themselves. Safe to run at any time."
            action={
              <Button
                variant="outline"
                loading={recalc.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Recalculate all balances?', message: 'Party balances, stock and invoice statuses are rebuilt from your documents. This can take a minute for large companies.', confirmText: 'Recalculate' })) recalc.mutate();
                }}
              >
                Recalculate
              </Button>
            }
          />
          {can('audit.view') && (
            <Row
              icon={<History className="h-5 w-5" />}
              title="Activity log"
              description="See who changed what, including every settings change, with before and after values."
              action={
                <Link href={href('/activity?entity=Settings')} className={buttonClass({ variant: 'outline' })}>
                  Open activity log
                </Link>
              }
            />
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
