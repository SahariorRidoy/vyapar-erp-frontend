'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, FileQuestion, Home, RotateCcw } from 'lucide-react';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, buttonClass } from './button';
import { NoAccess } from './misc';

function Panel({ icon, tone, title, children, actions, className }: { icon: ReactNode; tone: 'slate' | 'rose'; title: string; children: ReactNode; actions: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center px-4 py-16', className)}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={cn('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full', tone === 'rose' ? 'bg-rose-50 text-rose-500' : 'bg-slate-100 text-slate-400')}>{icon}</div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <div className="mt-2 text-sm text-slate-500">{children}</div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

/** 404 card. `home` is where "Go to home" leads: the dashboard inside a company, the entry page elsewhere. */
export function NotFoundView({ home = '/', homeLabel = 'Go to home', className }: { home?: string; homeLabel?: string; className?: string }) {
  const router = useRouter();
  return (
    <Panel
      className={className}
      tone="slate"
      icon={<FileQuestion className="h-7 w-7" />}
      title="Page not found"
      actions={
        <>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Go back
          </Button>
          <Link href={home} className={buttonClass()}>
            <Home className="h-4 w-4" /> {homeLabel}
          </Link>
        </>
      }
    >
      The link may be old or mistyped, or the record was deleted.
    </Panel>
  );
}

/** What to show when loading one record fails: not found (deleted, mistyped or another company's), no access, or a retry. */
export function LoadError({ error, what = 'this record', home = '/', homeLabel, onRetry }: { error: unknown; what?: string; home?: string; homeLabel?: string; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 404 || status === 400) return <NotFoundView home={home} homeLabel={homeLabel} />;
  if (status === 403) return <NoAccess what={what} />;
  return (
    <Panel
      tone="rose"
      icon={<AlertTriangle className="h-7 w-7" />}
      title={`Could not open ${what}`}
      actions={
        onRetry && (
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        )
      }
    >
      {errorMessage(error)}
    </Panel>
  );
}

/** Error boundary content: explains, offers a retry and shows the reference to quote to support. */
export function ErrorView({ error, reset, home = '/', homeLabel = 'Go to home', className }: { error: Error & { digest?: string }; reset: () => void; home?: string; homeLabel?: string; className?: string }) {
  return (
    <Panel
      className={className}
      tone="rose"
      icon={<AlertTriangle className="h-7 w-7" />}
      title="Something went wrong"
      actions={
        <>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          <Link href={home} className={buttonClass({ variant: 'outline' })}>
            <Home className="h-4 w-4" /> {homeLabel}
          </Link>
        </>
      }
    >
      <p>This page hit an unexpected problem. Your saved data is safe. Try again, and if it keeps happening, share the reference below with your administrator.</p>
      {(error.digest || error.message) && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs break-words text-slate-500">{error.digest ? `Ref ${error.digest}` : error.message}</p>}
    </Panel>
  );
}
