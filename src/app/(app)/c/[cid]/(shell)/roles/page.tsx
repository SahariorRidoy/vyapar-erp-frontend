'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Lock, Plus, Save, ShieldAlert, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useQueryState } from '@/hooks/use-query-state';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, NoAccess, PageHeader, Skeleton } from '@/components/ui/misc';
import { usePermissionCatalog, useRoles, type PermissionGroup, type RoleRow } from '@/components/users/types';

const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'manage', 'adjust_stock', 'import', 'export', 'use'];
const ACTION_LABEL: Record<string, string> = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', manage: 'Manage', adjust_stock: 'Adjust stock', import: 'Import', export: 'Export', use: 'Use',
};
const ACTION_HINT: Record<string, string> = {
  manage: 'Full control of the module',
};

export default function RolesPage() {
  const { can, href } = useCompany();
  const { params, set } = useQueryState();
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const list = useMemo(() => roles.data ?? [], [roles.data]);
  const selectedId = params.get('role') ?? list[0]?._id ?? null;
  const selected = selectedId === 'new' ? null : (list.find((r) => r._id === selectedId) ?? null);

  if (!can('roles.manage', 'users.manage')) return <NoAccess what="roles & permissions" />;
  const readOnly = !can('roles.manage');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles & permissions"
        description="A role is a set of permissions. Every user gets one role inside this company."
        actions={
          <>
            {can('users.manage') && (
              <Link href={href('/users')} className={buttonClass({ variant: 'outline' })}>
                <Users className="h-4 w-4" /> Users
              </Link>
            )}
            {!readOnly && (
              <Button onClick={() => set({ role: 'new' })}>
                <Plus className="h-4 w-4" /> New role
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="self-start">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Roles</div>
          <div className="p-1.5">
            {roles.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="m-2 h-12" />
              ))}
            {list.map((r) => (
              <button
                key={r._id}
                type="button"
                onClick={() => set({ role: r._id })}
                className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left', r._id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50')}
              >
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', r.isSystem ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600')}>
                  {r.isSystem ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', r._id === selectedId ? 'font-semibold text-blue-800' : 'font-medium text-slate-800')}>{r.name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.description || plural(r.permissions.length, 'permission')}</span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" title="Users with this role">
                  {r.users}
                </span>
              </button>
            ))}
            {selectedId === 'new' && (
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-blue-800">New role</span>
              </div>
            )}
          </div>
        </Card>
        {catalog.isLoading || roles.isLoading ? (
          <Skeleton className="h-96" />
        ) : selectedId === 'new' || selected ? (
          <RoleEditor key={selectedId ?? 'none'} role={selected} roles={list} catalog={catalog.data ?? []} readOnly={readOnly} onSaved={(id) => set({ role: id })} onDeleted={() => set({ role: null })} />
        ) : (
          <Card>
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Select a role" description="Choose a role on the left to see and change its permissions." />
          </Card>
        )}
      </div>
    </div>
  );
}

function RoleEditor({ role, roles, catalog, readOnly, onSaved, onDeleted }: { role: RoleRow | null; roles: RoleRow[]; catalog: PermissionGroup[]; readOnly: boolean; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const all = useMemo(() => catalog.flatMap((g) => g.actions.map((a) => `${g.resource}.${a}`)), [catalog]);
  const locked = readOnly || !!role?.isSystem;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [chosen, setPerms] = useState<Set<string>>(() => new Set(role?.permissions ?? ['dashboard.view']));
  const [approval, setApproval] = useState<Set<string>>(() => new Set(role?.approvalRequired ?? []));
  // A system role always holds every permission, including ones added in later versions.
  const perms = useMemo(() => (role?.isSystem ? new Set(all) : chosen), [role?.isSystem, all, chosen]);
  const approvable = useMemo(() => new Set(catalog.flatMap((g) => (g.approvable ?? []).map((a) => `${g.resource}.${a}`))), [catalog]);
  // Only granted permissions can wait for approval
  const gated = useMemo(() => new Set([...approval].filter((p) => perms.has(p))), [approval, perms]);
  const saved = new Set(role?.approvalRequired ?? []);

  const columns = ACTION_ORDER.filter((a) => catalog.some((g) => g.actions.includes(a)));
  const dirty =
    !role ||
    name.trim() !== role.name ||
    (description || '') !== (role.description || '') ||
    perms.size !== role.permissions.length ||
    role.permissions.some((p) => !perms.has(p)) ||
    gated.size !== saved.size ||
    [...gated].some((p) => !saved.has(p));

  const toggle = (keys: string[], on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      // Anything you can change, you can also see.
      if (on) for (const k of keys) if (!k.endsWith('.view')) { const v = `${k.split('.')[0]}.view`; if (all.includes(v)) n.add(v); }
      return n;
    });

  const toggleApproval = (keys: string[], on: boolean) =>
    setApproval((s) => {
      const n = new Set(s);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), description: description.trim(), permissions: [...perms], approvalRequired: [...gated] };
      return (role ? await api.put<RoleRow>(`/roles/${role._id}`, body) : await api.post<RoleRow>('/roles', body)).data;
    },
    onSuccess: (r) => {
      invalidateCompany(qc, cid);
      toast.success(role ? `${r.name} updated` : `Role ${r.name} created`, { description: role ? 'Users with this role get the new permissions on their next page load.' : undefined });
      onSaved(r._id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/roles/${role!._id}`),
    onSuccess: () => {
      invalidateCompany(qc, cid, role!._id);
      toast.success('Role deleted');
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="min-w-0">
      <div className="space-y-4 border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{role ? role.name : 'New role'}</h2>
            {role?.isSystem && <Badge tone="violet">System role</Badge>}
            {role && (
              <Badge tone="slate">
                {role.users} user{role.users === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          {!locked && (
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-slate-400" />
              <Select
                value=""
                onChange={(e) => {
                  const from = roles.find((r) => r._id === e.target.value);
                  if (from) {
                    setPerms(new Set(from.isSystem ? all : from.permissions));
                    setApproval(new Set(from.approvalRequired ?? []));
                  }
                }}
                className="h-8 w-48 text-xs"
                aria-label="Copy permissions from"
              >
                <option value="">Copy permissions from…</option>
                {roles
                  .filter((r) => r._id !== role?._id)
                  .map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </div>
          )}
        </div>
        {role?.isSystem ? (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">The Admin role always has every permission in this company and cannot be changed or deleted.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Role name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} placeholder="e.g. Cashier" autoFocus={!role} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} placeholder="What people with this role do" />
            </Field>
          </div>
        )}
        {!role?.isSystem && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <input type="checkbox" checked readOnly className="h-3.5 w-3.5 accent-blue-600" tabIndex={-1} aria-hidden /> Allowed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5" />
              </span>
              Allowed, but waits for approval
            </span>
            <span className="text-slate-500">Click the shield under a ticked Edit, Delete or Adjust stock to require approval. Creating never needs approval. Items ▸ Delete also covers categories, units and unit conversions; Parties ▸ Delete also covers party groups. Cancelling a document applies at once only if the role can Delete it without approval.</span>
          </div>
        )}
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-medium">Module</th>
              {columns.map((a) => {
                const keys = catalog.filter((g) => g.actions.includes(a)).map((g) => `${g.resource}.${a}`);
                const on = keys.every((k) => perms.has(k));
                return (
                  <th key={a} className="px-1 py-2.5 text-center align-bottom leading-tight font-medium" title={ACTION_HINT[a]}>
                    <label className={cn('inline-flex max-w-[60px] flex-col items-center gap-1', !locked && 'cursor-pointer')}>
                      {ACTION_LABEL[a] ?? a}
                      <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={on} disabled={locked} onChange={(e) => toggle(keys, e.target.checked)} aria-label={`All ${ACTION_LABEL[a] ?? a}`} />
                    </label>
                  </th>
                );
              })}
              <th className="px-2 py-2.5 text-center align-bottom font-medium">All</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {catalog.map((g) => {
              const keys = g.actions.map((a) => `${g.resource}.${a}`);
              const count = keys.filter((k) => perms.has(k)).length;
              return (
                <tr key={g.resource} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium whitespace-nowrap text-slate-800">{g.label}</td>
                  {columns.map((a) => {
                    const k = `${g.resource}.${a}`;
                    return (
                      <td key={a} className="px-1 py-2 text-center align-top">
                        {g.actions.includes(a) ? (
                          <span className="inline-flex flex-col items-center gap-1">
                            <input type="checkbox" className="h-4 w-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed" checked={perms.has(k)} disabled={locked} onChange={(e) => toggle([k], e.target.checked)} aria-label={`${g.label}: ${ACTION_LABEL[a] ?? a}`} />
                            {approvable.has(k) && perms.has(k) && !role?.isSystem && (
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => toggleApproval([k], !gated.has(k))}
                                aria-pressed={gated.has(k)}
                                aria-label={`${g.label}: ${ACTION_LABEL[a] ?? a} ${gated.has(k) ? 'needs approval' : 'applies at once'}`}
                                title={gated.has(k) ? 'Waits for approval — click to allow at once' : 'Applies at once — click to require approval'}
                                className={cn(
                                  'flex h-5 w-5 items-center justify-center rounded transition disabled:cursor-not-allowed',
                                  gated.has(k) ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500',
                                )}
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
                      checked={count === keys.length}
                      ref={(el) => {
                        if (el) el.indeterminate = count > 0 && count < keys.length;
                      }}
                      disabled={locked}
                      onChange={(e) => toggle(keys, e.target.checked)}
                      aria-label={`All permissions for ${g.label}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <p className="mr-auto text-xs text-slate-500">
          {perms.size} of {all.length} permissions{gated.size > 0 && ` · ${gated.size} need approval`}
        </p>
        {role && !locked && (
          <Button
            variant="outline"
            onClick={async () => {
              if (await confirm({ title: `Delete role ${role.name}?`, message: role.users ? `${role.users} user(s) still have this role. Move them to another role first.` : 'This cannot be undone.', confirmText: 'Delete role', danger: true })) remove.mutate();
            }}
            loading={remove.isPending}
          >
            <Trash2 className="h-4 w-4 text-rose-600" /> Delete
          </Button>
        )}
        {!locked && (
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || name.trim().length < 2}>
            {!save.isPending && <Save className="h-4 w-4" />} {role ? 'Save changes' : 'Create role'}
          </Button>
        )}
      </div>
    </Card>
  );
}
