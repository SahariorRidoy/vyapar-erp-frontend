'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, ArrowRight, Building2, ChevronDown, Mail, MapPin, MoreVertical, Pencil, Phone, Plus, RotateCcw, Settings, ShieldCheck, UserPlus, Users,
} from 'lucide-react';
import { api, errorMessage, fileUrl } from '@/lib/api';
import type { Company } from '@/lib/types';
import { BD_DIVISIONS, BUSINESS_CATEGORIES, BUSINESS_TYPES } from '@/lib/constants';
import { cn, fmtDate, fmtDateTime, money, plural } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useResetOn } from '@/hooks/use-reset-on';
import { useSession } from '@/providers/session';
import { PlatformHeader } from '@/components/layout/platform-header';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, PageLoader, SearchInput, Tabs } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';

type CompanyForm = { name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string; businessType: string; businessCategory: string };
const companyForm = (c?: Company | null): CompanyForm => ({
  name: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '', address: c?.address ?? '', city: c?.city ?? '', state: c?.state ?? '',
  pincode: c?.pincode ?? '', gstin: c?.gstin ?? '', businessType: c?.businessType ?? '', businessCategory: c?.businessCategory ?? '',
});

function CompanyModal({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company?: Company | null }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState(() => companyForm(company));
  const [more, setMore] = useState(!!company);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});
  useResetOn(open ? (company?._id ?? 'new') : null, () => {
    if (!open) return;
    setErrors({});
    setForm(companyForm(company));
    setMore(!!company);
  });

  const set = (k: keyof CompanyForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || undefined]));
      return company ? (await api.put<Company>(`/companies/${company._id}`, body)).data : (await api.post<Company>('/companies', body)).data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      onOpenChange(false);
      if (company) toast.success('Company details updated');
      else {
        toast.success(`${c.name} is ready`, { description: 'Opening the company dashboard…' });
        router.push(`/c/${c._id}/dashboard`);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.name.trim().length < 2) errs.name = 'Business name is required';
    if (form.phone.trim().length < 5) errs.phone = 'Phone number is required';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={company ? 'Edit company' : 'Create a new company'}
      description={company ? company.name : 'Only the business name and phone are required. You can fill in the rest later from Settings.'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" loading={save.isPending}>
            {company ? 'Save changes' : 'Create & open'}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={submit} className="space-y-4">
        <Field label="Business name" required error={errors.name}>
          <Input value={form.name} onChange={set('name')} placeholder="e.g. Sharma Traders" aria-invalid={!!errors.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" required error={errors.phone}>
            <Input value={form.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" inputMode="tel" aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Email (optional)" error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="accounts@business.com" aria-invalid={!!errors.email} />
          </Field>
        </div>
        <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
          <ChevronDown className={cn('h-4 w-4 transition-transform', more && 'rotate-180')} /> {more ? 'Hide' : 'Add'} address, BIN and business details
        </button>
        {more && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Field label="Address">
              <Textarea value={form.address} onChange={set('address')} rows={2} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City">
                <Input value={form.city} onChange={set('city')} />
              </Field>
              <Field label="Division">
                <Select value={form.state} onChange={set('state')}>
                  <option value="">Select division</option>
                  {BD_DIVISIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Postal code">
                <Input value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 4) }))} inputMode="numeric" placeholder="1205" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="BIN">
                <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.replace(/[^\d-]/g, '') }))} maxLength={14} inputMode="numeric" placeholder="000123456-0101" />
              </Field>
              <Field label="Business type">
                <Select value={form.businessType} onChange={set('businessType')}>
                  <option value="">Select</option>
                  {BUSINESS_TYPES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={form.businessCategory} onChange={set('businessCategory')}>
                  <option value="">Select</option>
                  {BUSINESS_CATEGORIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function CompanyCard({ c, onEdit, isSuper, current }: { c: Company; onEdit: () => void; isSuper: boolean; current: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toggle = useMutation({
    mutationFn: () => api.patch(`/companies/${c._id}/status`, { isActive: !c.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success(c.isActive ? `${c.name} archived` : `${c.name} restored`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = async () => {
    const ok = await confirm({
      title: c.isActive ? 'Archive this company?' : 'Restore this company?',
      message: c.isActive ? 'Nobody except super admins can open this company until it is restored, and its own staff cannot sign in. No data is deleted.' : 'Staff will be able to sign in and open it again.',
      confirmText: c.isActive ? 'Archive' : 'Restore',
      danger: c.isActive,
    });
    if (ok) toggle.mutate();
  };
  const open = () => router.push(`/c/${c._id}/dashboard`);
  const s = c.stats;
  return (
    <Card className={cn('group flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg', !c.isActive && 'opacity-70')}>
      <div className="flex items-start gap-3 p-5 pb-4">
        {c.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(c.logo)} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-contain" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">{c.name.slice(0, 1).toUpperCase()}</span>
        )}
        <button onClick={open} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 font-semibold text-slate-900 group-hover:text-blue-700">
            <span className="truncate">{c.name}</span>
            {current && <Badge tone="blue">Your company</Badge>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            <Phone className="h-3 w-3" /> {c.phone}
          </p>
          {c.email && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <Mail className="h-3 w-3" /> {c.email}
            </p>
          )}
          {(c.city || c.state) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin className="h-3 w-3" /> {[c.city, c.state].filter(Boolean).join(', ')}
            </p>
          )}
        </button>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Company actions">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={<ArrowRight className="h-4 w-4" />} onSelect={open}>
              Open dashboard
            </DropdownItem>
            {isSuper && (
              <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={onEdit}>
                Edit details
              </DropdownItem>
            )}
            <DropdownItem icon={<UserPlus className="h-4 w-4" />} onSelect={() => router.push(`/c/${c._id}/users`)}>
              Manage users
            </DropdownItem>
            <DropdownItem icon={<Settings className="h-4 w-4" />} onSelect={() => router.push(`/c/${c._id}/settings`)}>
              Settings
            </DropdownItem>
            {isSuper && (
              <>
                <DropdownSeparator />
                <DropdownItem icon={c.isActive ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} danger={c.isActive} onSelect={archive}>
                  {c.isActive ? 'Archive company' : 'Restore company'}
                </DropdownItem>
              </>
            )}
          </DropdownContent>
        </Dropdown>
      </div>
      {s && (
      <>
      <div className="grid grid-cols-3 gap-px border-y border-slate-100 bg-slate-100 text-center">
        <div className="bg-white px-2 py-3">
          <p className="text-[11px] text-slate-500 uppercase">Sales (month)</p>
          <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{money(s?.monthSales)}</p>
        </div>
        <div className="bg-white px-2 py-3">
          <p className="text-[11px] text-slate-500 uppercase">Receivable</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-emerald-700 tabular-nums">{money(s?.receivable)}</p>
        </div>
        <div className="bg-white px-2 py-3">
          <p className="text-[11px] text-slate-500 uppercase">Invoices</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{s?.monthInvoices ?? 0}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-5 py-3 text-xs text-slate-500">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {plural(s?.users ?? 0, 'user')}
          </span>
          <span>{plural(s?.parties ?? 0, 'party')}</span>
        </span>
        {c.isActive ? <span>Since {fmtDate(c.createdAt)}</span> : <Badge tone="amber">Archived</Badge>}
      </div>
      </>
      )}
      <div className={cn('px-5 pb-5', !s && 'mt-auto')}>
        <Button variant={c.isActive ? 'primary' : 'outline'} className="w-full" onClick={open}>
          Open company <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

interface PlatformAdmin {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive';
  lastLoginAt?: string;
  createdAt: string;
}

function PlatformAdmins() {
  const qc = useQueryClient();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const q = useQuery({ queryKey: ['platform-admins'], queryFn: async () => (await api.get<PlatformAdmin[]>('/companies/platform/admins')).data });
  const create = useMutation({
    mutationFn: () => api.post('/companies/platform/admins', { ...form, phone: form.phone || undefined }),
    onSuccess: () => {
      toast.success('Super admin added');
      setOpen(false);
      setForm({ name: '', email: '', phone: '', password: '' });
      qc.invalidateQueries({ queryKey: ['platform-admins'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (a: PlatformAdmin) => api.patch(`/companies/platform/admins/${a._id}/status`, { status: a.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-admins'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <PageLoader />;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="font-semibold text-slate-900">Super admins</p>
          <p className="text-xs text-slate-500">They can open every company, create companies and manage users anywhere.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add super admin
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 font-medium">Email / phone</th>
              <th className="px-5 py-2.5 font-medium">Last login</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {q.data?.map((a) => (
              <tr key={a._id}>
                <td className="px-5 py-3 font-medium">{a.name}</td>
                <td className="px-5 py-3 text-slate-600">
                  {a.email}
                  {a.phone && <span className="block text-xs text-slate-400">{a.phone}</span>}
                </td>
                <td className="px-5 py-3 text-slate-600">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</td>
                <td className="px-5 py-3">{a.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="px-5 py-3 text-right">
                  {a._id !== session?.user._id && (
                    <Button size="xs" variant="outline" loading={toggle.isPending && toggle.variables?._id === a._id} onClick={() => toggle.mutate(a)}>
                      {a.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add super admin"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!form.name || !form.email || form.password.length < 8}>
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Password" required hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

export default function CompaniesPage() {
  const { session } = useSession();
  const [tab, setTab] = useState<'companies' | 'admins'>('companies');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [modal, setModal] = useState<{ open: boolean; company?: Company | null }>({ open: false });
  const isSuper = !!session?.user.isSuperAdmin;

  const q = useQuery({
    queryKey: ['companies', status, debounced],
    queryFn: async () => (await api.get<Company[]>('/companies', { status, search: debounced })).data,
    enabled: !!session,
  });

  if (!session) return <PageLoader />;
  const companies = q.data ?? [];
  const totals = companies.reduce((t, c) => ({ sales: t.sales + (c.stats?.monthSales ?? 0), receivable: t.receivable + (c.stats?.receivable ?? 0), users: t.users + (c.stats?.users ?? 0) }), { sales: 0, receivable: 0, users: 0 });

  return (
    <div className="min-h-screen">
      <PlatformHeader />
      <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-sm text-blue-100">Welcome back, {session?.user.name.split(' ')[0]}</p>
          <h1 className="mt-1 text-2xl font-semibold">{isSuper ? 'Your companies' : 'Choose a company to work in'}</h1>
          {isSuper && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-xs text-blue-100 uppercase">Companies</p>
              <p className="mt-1 text-xl font-semibold">{companies.length}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-xs text-blue-100 uppercase">Sales this month (all)</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{money(totals.sales)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-xs text-blue-100 uppercase">Total receivable</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{money(totals.receivable)}</p>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {isSuper && (
          <Tabs
            className="mb-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'companies', label: <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Companies</span> },
              { value: 'admins', label: <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Super admins</span> },
            ]}
          />
        )}
        {isSuper && tab === 'admins' ? (
          <PlatformAdmins />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by name, phone or email" className="w-full sm:w-80" />
              {isSuper && (
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All companies</option>
                </Select>
              )}
              <div className="flex-1" />
              {isSuper && (
                <Button onClick={() => setModal({ open: true, company: null })}>
                  <Plus className="h-4 w-4" /> Create company
                </Button>
              )}
            </div>
            {q.isLoading ? (
              <PageLoader />
            ) : companies.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Building2 className="h-6 w-6" />}
                  title={debounced ? 'No company matches your search' : 'No companies yet'}
                  description={isSuper ? 'Create your first company. You only need the business name and phone number.' : 'Ask the super admin to create a company.'}
                  action={
                    isSuper && (
                      <Button onClick={() => setModal({ open: true, company: null })}>
                        <Plus className="h-4 w-4" /> Create company
                      </Button>
                    )
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((c) => (
                  <CompanyCard key={c._id} c={c} isSuper={isSuper} current={String(session.user.company) === c._id} onEdit={() => setModal({ open: true, company: c })} />
                ))}
                {isSuper && (
                <button
                  onClick={() => setModal({ open: true, company: null })}
                  className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600"
                >
                  <Plus className="h-7 w-7" />
                  <span className="text-sm font-medium">Create another company</span>
                </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <CompanyModal open={modal.open} company={modal.company} onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))} />
    </div>
  );
}
