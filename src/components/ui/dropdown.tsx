'use client';
import * as DM from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={4}
        collisionPadding={8}
        className={cn('z-50 max-h-[70vh] min-w-[200px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function DropdownItem({ children, onSelect, icon, danger, disabled }: { children: ReactNode; onSelect?: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
        danger ? 'text-rose-600 data-[highlighted]:bg-rose-50' : 'text-slate-700 data-[highlighted]:bg-slate-100',
      )}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center opacity-70">{icon}</span>}
      {children}
    </DM.Item>
  );
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-slate-100" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5 text-xs font-semibold text-slate-400 uppercase">{children}</DM.Label>;
}
