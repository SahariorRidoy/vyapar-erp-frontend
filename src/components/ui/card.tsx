import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-xs', className)}>{children}</div>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function StatCard({ label, value, hint, tone = 'slate', icon, onClick, href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'red' | 'amber' | 'violet'; icon?: ReactNode; onClick?: () => void; href?: string }) {
  const tones = {
    slate: 'from-slate-50 to-white text-slate-700 ring-slate-200',
    blue: 'from-blue-50 to-white text-blue-700 ring-blue-100',
    green: 'from-emerald-50 to-white text-emerald-700 ring-emerald-100',
    red: 'from-rose-50 to-white text-rose-700 ring-rose-100',
    amber: 'from-amber-50 to-white text-amber-700 ring-amber-100',
    violet: 'from-violet-50 to-white text-violet-700 ring-violet-100',
  };
  const className = cn('block rounded-xl bg-gradient-to-br p-4 ring-1 shadow-xs', tones[tone], (onClick || href) && 'cursor-pointer transition hover:shadow-md');
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        {icon && <span className="opacity-80">{icon}</span>}
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  if (href)
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  return (
    <div onClick={onClick} className={className}>
      {body}
    </div>
  );
}
