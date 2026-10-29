'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { useEmployees } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, Input, Select } from '@/components/ui/input';
import { generatePassword, useRoles, type UserRow } from './types';

export function PasswordInput({ value, onChange, placeholder, autoFocus, invalid }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} autoComplete="new-password" className="pr-20" aria-invalid={invalid} />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
        <button type="button" onClick={() => setShow((s) => !s)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setShow(true);
          }}
          className="rounded p-1 text-slate-400 hover:text-slate-700"
          title="Generate a strong password"
          aria-label="Generate password"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Password copied'))}
            className="rounded p-1 text-slate-400 hover:text-slate-700"
            aria-label="Copy password"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  status: 'active' | 'inactive';
  employee: string | null;
}

const userForm = (user?: UserRow | null): FormState =>
  user
    ? { name: user.name, email: user.email ?? '', phone: user.phone ?? '', password: '', role: user.role?._id ?? '', status: user.status, employee: user.employee?._id ?? null }
    : { name: '', email: '', phone: '', password: generatePassword(), role: '', status: 'active', employee: null };

/** Create or edit a login of this company. Logins can never sign in to another company. */
export function UserModal({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: UserRow | null }) {
  const { cid, company } = useCompany();
  const { session } = useSession();
  const qc = useQueryClient();
  const roles = useRoles(open);
  const employees = useEmployees(open);
  const [f, setF] = useState<FormState>(() => userForm(user));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const self = !!user && user._id === session?.user._id;
  useResetOn(open ? (user?._id ?? 'new') : null, () => {
    if (!open) return;
    setTouched(false);
    setF(userForm(user));
  });
  // New users start on the least powerful role that is not Admin
  const defaultRole = roles.data?.find((r) => r.name === 'Salesman') ?? roles.data?.find((r) => !r.isSystem) ?? roles.data?.[0];
  const roleId = f.role || (user ? '' : (defaultRole?._id ?? ''));

  const employeeOptions = useMemo(
    () =>
      (employees.data ?? []).map((e) => {
        const linkedTo = typeof e.user === 'object' && e.user ? e.user : null;
        return { value: e._id, label: e.name, hint: [e.code, e.designation].filter(Boolean).join(' · '), right: linkedTo && linkedTo._id !== user?._id ? `login: ${linkedTo.name}` : undefined };
      }),
    [employees.data, user?._id],
  );

  const errors = {
    name: f.name.trim().length < 2 ? 'Enter the name' : undefined,
    email: !f.email.trim() && !f.phone.trim() ? 'Email or phone is needed to sign in' : f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? 'Enter a valid email' : undefined,
    password: !user && f.password.length < 8 ? 'At least 8 characters' : user && f.password && f.password.length < 8 ? 'At least 8 characters' : undefined,
    role: !roleId ? 'Choose a role' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, role: roleId, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), employee: f.employee ?? '' };
      return user ? api.put<UserRow>(`/users/${user._id}`, body) : api.post<UserRow>('/users', body);
    },
    onSuccess: () => {
      invalidateCompany(qc, cid);
      if (user) toast.success('User updated', { description: f.password ? 'The new password works from the next sign in. Other sessions were signed out.' : undefined });
      else
        toast.success(`${f.name.trim()} can now sign in`, {
          description: `Login: ${f.email.trim() || f.phone.trim()} · Share the password privately.`,
          duration: 8000,
        });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    setTouched(true);
    if (!invalid) save.mutate();
  };
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const role = roles.data?.find((r) => r._id === roleId);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Edit ${user.name}` : 'Add user'}
      description={`This login works only inside ${company?.name ?? 'this company'}.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Full name" required error={err('name')}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus aria-invalid={!!err('name')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" error={err('email')} hint="Used to sign in">
            <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" aria-invalid={!!err('email')} />
          </Field>
          <Field label="Phone" hint="Can also be used to sign in">
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="off" />
          </Field>
        </div>
        <Field label={user ? 'New password' : 'Password'} required={!user} error={err('password')} hint={user ? 'Leave empty to keep the current password' : 'Generated for you. Change it or copy it to share.'}>
          <PasswordInput value={f.password} onChange={(v) => set('password', v)} placeholder={user ? 'Unchanged' : ''} invalid={!!err('password')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role" required error={err('role')} hint={role?.description}>
            <Select value={roleId} onChange={(e) => set('role', e.target.value)} disabled={self} aria-invalid={!!err('role')}>
              <option value="">Choose role</option>
              {(roles.data ?? []).map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" hint={self ? 'You cannot change your own role or status' : f.status === 'inactive' ? 'Inactive users cannot sign in' : undefined}>
            <Select value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])} disabled={self}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (blocked)</option>
            </Select>
          </Field>
        </div>
        <Field label="Employee profile" hint="Link to an employee so this user can check in, request leave and see salary slips.">
          <Combobox value={f.employee} onChange={(v) => set('employee', v)} options={employeeOptions} placeholder="Not linked" searchPlaceholder="Search employees" clearable />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Sets a new password for another user and signs them out everywhere. */
export function ResetPasswordModal({ user, onOpenChange }: { user: UserRow | null; onOpenChange: (o: boolean) => void }) {
  const [password, setPassword] = useState(() => (user ? generatePassword() : ''));
  useResetOn(user?._id ?? null, () => user && setPassword(generatePassword()));
  const reset = useMutation({
    mutationFn: () => api.post(`/users/${user!._id}/reset-password`, { password }),
    onSuccess: () => {
      toast.success(`Password reset for ${user?.name}`, { description: 'They were signed out of every device. Share the new password privately.', duration: 8000 });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={!!user}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Reset password · ${user?.name ?? ''}`}
      description="The user is signed out everywhere and must use the new password."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => reset.mutate()} loading={reset.isPending} disabled={password.length < 8}>
            Reset password
          </Button>
        </>
      }
    >
      <Field label="New password" hint="At least 8 characters" error={password && password.length < 8 ? 'Too short' : undefined}>
        <PasswordInput value={password} onChange={setPassword} autoFocus />
      </Field>
    </Modal>
  );
}
