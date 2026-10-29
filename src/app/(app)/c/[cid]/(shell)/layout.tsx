'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/shell';
import { TxnActionsProvider } from '@/components/txn/actions';

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <TxnActionsProvider>{children}</TxnActionsProvider>
    </AppShell>
  );
}
