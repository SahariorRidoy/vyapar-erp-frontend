'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, PenLine } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Company, CompanySettings } from '@/lib/types';
import { BD_DIVISIONS, BIN_RE, BUSINESS_CATEGORIES, BUSINESS_TYPES, TIN_RE } from '@/lib/constants';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ImagePicker } from '@/components/ui/image-picker';
import { SaveBar, SettingsCard } from './section';

type Profile = Pick<Company, 'name' | 'phone'> & Record<'email' | 'website' | 'address' | 'city' | 'state' | 'pincode' | 'gstin' | 'pan' | 'businessType' | 'businessCategory', string> & { logo: string | null; signature: string | null };

const toForm = (c: Company): Profile => ({
  name: c.name, phone: c.phone, email: c.email ?? '', website: c.website ?? '', address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', pincode: c.pincode ?? '',
  gstin: c.gstin ?? '', pan: c.pan ?? '', businessType: c.businessType ?? '', businessCategory: c.businessCategory ?? '', logo: c.logo ?? null, signature: c.signature ?? null,
});

export function BusinessTab({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const { cid, company } = useCompany();
  const qc = useQueryClient();
  const saved = useMemo(() => (company ? toForm(company) : null), [company]);
  const [f, setF] = useState<Profile | null>(saved);
  const [touched, setTouched] = useState(false);
  useResetOn(saved, () => setF(saved));
  const dirty = !!f && !!saved && JSON.stringify(f) !== JSON.stringify(saved);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async () => (await api.put<Company>('/settings/company', { ...f, gstin: f!.gstin.trim(), pan: f!.pan.trim() })).data,
    onSuccess: (next) => {
      qc.setQueryData<{ company: Company; settings: CompanySettings }>([cid, 'settings'], (old) => (old ? { ...old, company: next } : old));
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Business profile saved', { description: 'New documents and prints use these details.' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!f) return null;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const errors = {
    name: f.name.trim().length < 2 ? 'Enter the business name' : undefined,
    phone: f.phone.trim().length < 5 ? 'Enter a phone number' : undefined,
    email: f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? 'Enter a valid email' : undefined,
    gstin: f.gstin && !BIN_RE.test(f.gstin.trim()) ? 'BIN has 9 digits, optionally with a branch suffix, like 000123456-0101' : undefined,
    pan: f.pan && !TIN_RE.test(f.pan.trim()) ? 'TIN has 12 digits' : undefined,
  };
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const submit = () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return toast.error('Please fix the highlighted fields');
    save.mutate();
  };

  return (
    <div className="space-y-4">
      <SettingsCard title="Business details" description="Printed on invoices, receipts, salary slips and emails.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Business name" required error={err('name')}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!err('name')} />
          </Field>
          <Field label="Phone" required error={err('phone')}>
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" aria-invalid={!!err('phone')} />
          </Field>
          <Field label="Email" error={err('email')}>
            <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!err('email')} />
          </Field>
          <Field label="Website">
            <Input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="www.example.com" />
          </Field>
          <Field label="BIN (VAT registration)" error={err('gstin')} hint="Business Identification Number from the NBR VAT portal">
            <Input value={f.gstin} onChange={(e) => set('gstin', e.target.value.replace(/[^\d-]/g, ''))} maxLength={14} inputMode="numeric" placeholder="000123456-0101" aria-invalid={!!err('gstin')} />
          </Field>
          <Field label="TIN" error={err('pan')}>
            <Input value={f.pan} onChange={(e) => set('pan', e.target.value.replace(/\D/g, ''))} maxLength={12} inputMode="numeric" placeholder="12 digit e-TIN" aria-invalid={!!err('pan')} />
          </Field>
          <Field label="Business type">
            <Select value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
              <option value="">Select</option>
              {[...new Set([...BUSINESS_TYPES, f.businessType].filter(Boolean))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Business category">
            <Select value={f.businessCategory} onChange={(e) => set('businessCategory', e.target.value)}>
              <option value="">Select</option>
              {[...new Set([...BUSINESS_CATEGORIES, f.businessCategory].filter(Boolean))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Address" description="Printed under the business name on every document.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Address" className="md:col-span-2">
            <Textarea value={f.address} onChange={(e) => set('address', e.target.value)} rows={2} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Division">
              <Select value={f.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">Select</option>
                {BD_DIVISIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Postal code">
              <Input value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="1205" />
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Logo and signature" description="Shown on prints when Settings ▸ Print has them switched on. PNG with a transparent background looks best.">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Business logo</p>
            <ImagePicker value={f.logo} onChange={(v) => set('logo', v)} context="logo" shape="wide" label="Upload logo" hint="Square or wide, at least 300 px" placeholder={<Building2 className="h-6 w-6 text-slate-300" />} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Authorised signature</p>
            <ImagePicker value={f.signature} onChange={(v) => set('signature', v)} context="signature" shape="wide" label="Upload signature" hint="Sign on white paper and take a photo" placeholder={<PenLine className="h-6 w-6 text-slate-300" />} />
          </div>
        </div>
      </SettingsCard>

      <SaveBar dirty={dirty} saving={save.isPending} onSave={submit} onDiscard={() => setF(saved)} />
    </div>
  );
}
