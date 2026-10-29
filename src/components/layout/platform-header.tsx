'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, LogOut, UserCircle2 } from 'lucide-react';
import { useSession } from '@/providers/session';
import { Avatar } from '@/components/ui/misc';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';

/** Top bar for pages outside a company (company list, profile). */
export function PlatformHeader() {
  const { session, logout } = useSession();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href={session?.home ?? '/'} className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">S</span>
          Sumon Trade Corporation
        </Link>
        <div className="flex-1" />
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100">
              <Avatar name={session?.user.name} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm leading-tight font-medium text-slate-800">{session?.user.name}</span>
                <span className="block text-[11px] leading-tight text-slate-500">{session?.user.isSuperAdmin ? 'Super admin' : session?.user.role?.name}</span>
              </span>
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{session?.user.email ?? session?.user.phone}</DropdownLabel>
            <DropdownItem icon={<UserCircle2 className="h-4 w-4" />} onSelect={() => router.push('/profile')}>
              My profile
            </DropdownItem>
            <DropdownItem icon={<Building2 className="h-4 w-4" />} onSelect={() => router.push('/companies')}>
              {session?.user.isSuperAdmin ? 'All companies' : 'Switch company'}
            </DropdownItem>
            {!session?.user.isSuperAdmin && session?.home && (
              <DropdownItem icon={<Building2 className="h-4 w-4" />} onSelect={() => router.push(session.home)}>
                My company
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem icon={<LogOut className="h-4 w-4" />} danger onSelect={logout}>
              Sign out
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  );
}
