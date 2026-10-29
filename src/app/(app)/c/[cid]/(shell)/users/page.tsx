'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, MoreVertical, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserCog, UserX, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { useUrlFlag } from '@/hooks/use-url-flag';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Avatar, EmptyState, NoAccess, PageHeader, SearchInput, Skeleton } from '@/components/ui/misc';
import { ResetPasswordModal, UserModal } from '@/components/users/user-modal';
import { useRoles, useUsers, type UserRow } from '@/components/users/types';

export default function UsersPage() {
  const { cid, can, href, company } = useCompany();
  const { session } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const users = useUsers();
  const roles = useRoles();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<{ open: boolean; user?: UserRow | null }>({ open: false });
  const [reset, setReset] = useState<UserRow | null>(null);
  const [now] = useState(() => Date.now());
  useUrlFlag('new', can('users.manage'), () => setModal({ open: true, user: null }));

  const toggle = useMutation({
    mutationFn: async (u: UserRow) =>
      api.put(`/users/${u._id}`, { name: u.name, email: u.email ?? '', phone: u.phone ?? '', role: u.role?._id, status: u.status === 'active' ? 'inactive' : 'active', employee: u.employee?._id ?? '' }),
    onSuccess: (_r, u) => {
      invalidateCompany(qc, cid);
      toast.success(u.status === 'active' ? `${u.name} can no longer sign in` : `${u.name} can sign in again`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (u: UserRow) => api.del(`/users/${u._id}`),
    onSuccess: (_r, u) => {
      invalidateCompany(qc, cid);
      toast.success(`${u.name} deleted`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const all = useMemo(() => users.data ?? [], [users.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((u) => (!role || u.role?._id === role) && (!status || u.status === status) && (!q || `${u.name} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(q)));
  }, [all, search, role, status]);

  if (!can('users.manage')) return <NoAccess what="user management" />;
  const active = all.filter((u) => u.status === 'active').length;
  const seenWeek = all.filter((u) => u.lastLoginAt && now - new Date(u.lastLoginAt).getTime() < 7 * 86400000).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description={`People who can sign in to ${company?.name ?? 'this company'}. Their role decides what they can see and do.`}
        actions={
          <>
            {can('roles.manage') && (
              <Link href={href('/roles')} className={buttonClass({ variant: 'outline' })}>
                <ShieldCheck className="h-4 w-4" /> Roles & permissions
              </Link>
            )}
            <Button onClick={() => setModal({ open: true, user: null })}>
              <Plus className="h-4 w-4" /> Add user
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Users" value={all.length} tone="blue" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active" value={active} hint={all.length - active ? `${all.length - active} blocked` : 'Nobody blocked'} tone="green" icon={<UserCheck className="h-5 w-5" />} />
        <StatCard label="Signed in this week" value={seenWeek} tone="violet" icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="Roles" value={roles.data?.length ?? 0} hint="Admin, Manager, Accountant…" tone="amber" icon={<UserCog className="h-5 w-5" />} href={can('roles.manage') ? href('/roles') : undefined} />
      </div>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone" className="w-full sm:w-64" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-full sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {(roles.data ?? []).map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-36" aria-label="Status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Blocked</option>
          </Select>
        </div>
        {users.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={all.length ? 'No user matches' : 'No users yet'} description={all.length ? 'Try another search or filter.' : 'Add your staff so they can sign in.'} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Last sign in</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="relative w-12 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => {
                  const self = u._id === session?.user._id;
                  return (
                    <tr key={u._id} className={cn('hover:bg-slate-50/60', u.status === 'inactive' && 'opacity-60')}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">
                              {u.name}
                              {self && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{[u.email, u.phone].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={u.role?.name === 'Admin' ? 'violet' : 'blue'}>{u.role?.name ?? 'No role'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {u.employee ? (
                          <Link href={href(`/hr/employees?employee=${u.employee._id}`)} className="hover:text-blue-600 hover:underline">
                            {u.employee.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600" title={u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : undefined}>
                        {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="text-slate-400">Never · added {fmtDate(u.createdAt)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status === 'active' ? 'Active' : 'Blocked'}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Dropdown>
                          <DropdownTrigger asChild>
                            <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Actions for ${u.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownTrigger>
                          <DropdownContent>
                            <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setModal({ open: true, user: u })}>
                              Edit user
                            </DropdownItem>
                            {!self && (
                              <DropdownItem icon={<KeyRound className="h-4 w-4" />} onSelect={() => setReset(u)}>
                                Reset password
                              </DropdownItem>
                            )}
                            {!self && (
                              <DropdownItem
                                icon={u.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                onSelect={async () => {
                                  if (
                                    u.status === 'inactive' ||
                                    (await confirm({ title: `Block ${u.name}?`, message: 'They are signed out at once and cannot sign in until you activate them again. Their records stay.', confirmText: 'Block user', danger: true }))
                                  )
                                    toggle.mutate(u);
                                }}
                              >
                                {u.status === 'active' ? 'Block sign in' : 'Activate'}
                              </DropdownItem>
                            )}
                            {!self && (
                              <>
                                <DropdownSeparator />
                                <DropdownItem
                                  danger
                                  icon={<Trash2 className="h-4 w-4" />}
                                  onSelect={async () => {
                                    if (await confirm({ title: `Delete ${u.name}?`, message: 'The login is removed permanently. Documents they created keep their name. To keep the login for later, block it instead.', confirmText: 'Delete user', danger: true }))
                                      remove.mutate(u);
                                  }}
                                >
                                  Delete user
                                </DropdownItem>
                              </>
                            )}
                          </DropdownContent>
                        </Dropdown>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserModal open={modal.open} user={modal.user} onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))} />
      <ResetPasswordModal user={reset} onOpenChange={(o) => !o && setReset(null)} />
    </div>
  );
}
