import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCompany } from '@/providers/company';

export interface UserRow {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: { _id: string; name: string } | null;
  employee?: { _id: string; name: string; designation?: string } | null;
  status: 'active' | 'inactive';
  lastLoginAt?: string;
  createdAt: string;
}

export interface RoleRow {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
  /** Permissions this role may only use through an approval request. */
  approvalRequired: string[];
  isSystem?: boolean;
  users: number;
}

export interface PermissionGroup {
  resource: string;
  label: string;
  actions: string[];
  /** Actions that can be granted "with approval". */
  approvable: string[];
}

export function useRoles(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'roles', 'list'],
    queryFn: async () => (await api.get<RoleRow[]>('/roles')).data,
    enabled: enabled && can('roles.manage', 'users.manage'),
  });
}

export function useUsers(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'users', 'list'],
    queryFn: async () => (await api.get<UserRow[]>('/users')).data,
    enabled: enabled && can('users.manage'),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['meta', 'permissions'],
    queryFn: async () => (await api.get<PermissionGroup[]>('/meta/permissions')).data,
    staleTime: Infinity,
  });
}

/** Random, readable temporary password (no look-alike characters). */
export function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '@#$%&*';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  const out = Array.from(buf, (n, i) => (i === 3 ? symbols[n % symbols.length] : chars[n % chars.length]));
  return out.join('');
}
