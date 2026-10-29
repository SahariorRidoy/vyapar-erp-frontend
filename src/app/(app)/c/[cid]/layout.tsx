'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { CompanyProvider, useCompany } from '@/providers/company';
import { PageLoader } from '@/components/ui/misc';
import { buttonClass } from '@/components/ui/button';

function CompanyGate({ children }: { children: ReactNode }) {
  const { company, loading } = useCompany();
  if (loading) return <PageLoader label="Opening company…" />;
  if (!company)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <p className="text-lg font-semibold text-slate-900">This company is not available</p>
        <p className="max-w-sm text-sm text-slate-500">It may have been archived or removed.</p>
        <Link href="/companies" className={buttonClass({ variant: 'outline' })}>
          Choose another company
        </Link>
      </div>
    );
  return <>{children}</>;
}

/** Everything under /c/[cid] runs in the context of one company (header, settings, permissions). */
export default function CompanyLayout({ children }: { children: ReactNode }) {
  const { cid } = useParams<{ cid: string }>();
  return (
    <CompanyProvider key={cid} cid={cid}>
      <CompanyGate>{children}</CompanyGate>
    </CompanyProvider>
  );
}
