'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, isoDate, today } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useEmployees, type EmployeeRow } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';
import { ImagePicker } from '@/components/ui/image-picker';

interface UserOption {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: { name: string } | null;
  employee?: { _id: string; name: string } | null;
}

interface FormState {
  name: string;
  code: string;
  phone: string;
  email: string;
  designation: string;
  department: string;
  joinDate: string;
  status: 'active' | 'inactive';
  salaryType: 'monthly' | 'daily';
  salary: number;
  allowances: number;
  deductions: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  address: string;
  emergencyContact: string;
  user: string | null;
  photo: string | null;
}

const empty = (): FormState => ({
  name: '', code: '', phone: '', email: '', designation: '', department: '', joinDate: today(), status: 'active', salaryType: 'monthly', salary: 0, allowances: 0, deductions: 0,
  bankName: '', accountNumber: '', ifsc: '', address: '', emergencyContact: '', user: null, photo: null,
});

const fromEmployee = (e: EmployeeRow): FormState => ({
  name: e.name, code: e.code ?? '', phone: e.phone ?? '', email: e.email ?? '', designation: e.designation ?? '', department: e.department ?? '', joinDate: isoDate(e.joinDate) || today(),
  status: e.status, salaryType: e.salaryType, salary: e.salary ?? 0, allowances: e.allowances ?? 0, deductions: e.deductions ?? 0, bankName: e.bankName ?? '', accountNumber: e.accountNumber ?? '',
  ifsc: e.ifsc ?? '', address: e.address ?? '', emergencyContact: e.emergencyContact ?? '', user: typeof e.user === 'object' && e.user ? e.user._id : ((e.user as string | null) ?? null), photo: e.photo ?? null,
});

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** Add or edit an employee: profile, salary structure, bank details and the optional app login link. */
export function EmployeeModal({ open, onOpenChange, employee, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: EmployeeRow | null; onSaved?: (e: EmployeeRow) => void }) {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const [f, setF] = useState(() => (employee ? fromEmployee(employee) : empty()));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const all = useEmployees(open);
  const canLink = can('users.manage');
  const users = useQuery({
    queryKey: [cid, 'users', 'list'],
    queryFn: async () => (await api.get<UserOption[]>('/users')).data,
    enabled: open && canLink,
  });

  useResetOn(open ? (employee?._id ?? 'new') : null, () => {
    if (!open) return;
    setF(employee ? fromEmployee(employee) : empty());
    setTouched(false);
  });

  const departments = useMemo(() => [...new Set((all.data ?? []).map((e) => e.department).filter((d): d is string => !!d))].sort(), [all.data]);
  const designations = useMemo(() => [...new Set((all.data ?? []).map((e) => e.designation).filter((d): d is string => !!d))].sort(), [all.data]);
  const userOptions = useMemo(
    () =>
      (users.data ?? []).map((u) => ({
        value: u._id,
        label: u.name,
        hint: [u.email || u.phone, u.role?.name].filter(Boolean).join(' · '),
        right: u.employee && u.employee._id !== employee?._id ? `linked to ${u.employee.name}` : undefined,
        keywords: `${u.email ?? ''} ${u.phone ?? ''}`,
      })),
    [users.data, employee?._id],
  );

  const nameError = touched && f.name.trim().length < 2 ? 'Enter the employee name' : undefined;
  const emailError = touched && f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? 'Enter a valid email' : undefined;

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, name: f.name.trim(), code: f.code.trim(), ifsc: f.ifsc.trim(), user: f.user ?? '', photo: f.photo ?? '' };
      return (employee ? await api.put<EmployeeRow>(`/hr/employees/${employee._id}`, body) : await api.post<EmployeeRow>('/hr/employees', body)).data;
    },
    onSuccess: (e) => {
      invalidateCompany(qc, cid);
      toast.success(employee ? `${e.name} updated` : `${e.name} added as ${e.code}`);
      onSaved?.(e);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    setTouched(true);
    if (f.name.trim().length < 2 || (f.email && !/^\S+@\S+\.\S+$/.test(f.email))) return;
    save.mutate();
  };

  const perDay = f.salaryType === 'daily';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={employee ? `Edit ${employee.name}` : 'Add employee'}
      description="Salary is calculated from attendance when you generate payroll."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {employee ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Section title="Profile">
          <ImagePicker value={f.photo} onChange={(v) => set('photo', v)} shape="circle" context="employee" label="Upload photo" hint="Square photo, PNG or JPG up to 5 MB." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required error={nameError}>
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!nameError} placeholder="e.g. Ramesh Jadhav" autoFocus />
            </Field>
            <Field label="Employee code" hint={employee ? undefined : 'Leave blank to number automatically (EMP0001…)'}>
              <Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="Auto" />
            </Field>
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="10 digit mobile" />
            </Field>
            <Field label="Email" error={emailError}>
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!emailError} />
            </Field>
            <Field label="Designation">
              <Input value={f.designation} onChange={(e) => set('designation', e.target.value)} list="hr-designations" placeholder="e.g. Sales Executive" />
            </Field>
            <Field label="Department">
              <Input value={f.department} onChange={(e) => set('department', e.target.value)} list="hr-departments" placeholder="e.g. Sales" />
            </Field>
            <Field label="Joining date">
              <Input type="date" value={f.joinDate} onChange={(e) => set('joinDate', e.target.value)} />
            </Field>
            {employee && (
              <Field label="Status" hint={f.status === 'inactive' ? 'Inactive employees are left out of attendance and payroll.' : undefined}>
                <Select value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive (left the company)</option>
                </Select>
              </Field>
            )}
          </div>
          <datalist id="hr-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <datalist id="hr-designations">
            {designations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Section>

        <Section title="Salary structure">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(['monthly', 'daily'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('salaryType', t)}
                className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition', f.salaryType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
              >
                {t === 'monthly' ? 'Monthly salary' : 'Daily wages'}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={perDay ? 'Wage per day' : 'Salary per month'} hint={perDay ? 'Paid for each payable day' : 'Pro-rated by payable days'}>
              <NumberInput value={f.salary} onValueChange={(v) => set('salary', v)} min={0} />
            </Field>
            <Field label="Fixed allowances / month" hint="HRA, travel, phone…">
              <NumberInput value={f.allowances} onValueChange={(v) => set('allowances', v)} min={0} />
            </Field>
            <Field label="Fixed deductions / month" hint="PF, ESI, loan EMI…">
              <NumberInput value={f.deductions} onValueChange={(v) => set('deductions', v)} min={0} />
            </Field>
          </div>
        </Section>

        <Section title="Bank account for salary">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bank name">
              <Input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </Field>
            <Field label="Account number">
              <Input value={f.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Routing number">
              <Input value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.replace(/\D/g, ''))} maxLength={9} inputMode="numeric" placeholder="090260434" />
            </Field>
          </div>
        </Section>

        <Section title="Other details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address">
              <Textarea value={f.address} onChange={(e) => set('address', e.target.value)} rows={2} />
            </Field>
            <Field label="Emergency contact" hint="Name and phone number">
              <Textarea value={f.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} rows={2} />
            </Field>
          </div>
        </Section>

        {canLink && (
          <Section title="App login">
            <Field hint="A linked login can check in and out, request leave or a salary advance and download salary slips.">
              <Combobox value={f.user} onChange={(v) => set('user', v)} options={userOptions} placeholder="Not linked" searchPlaceholder="Search users" clearable emptyText={users.isLoading ? 'Loading users…' : 'No users found'} />
            </Field>
          </Section>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
