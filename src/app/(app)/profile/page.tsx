'use client';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, UserCircle2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useSession } from '@/providers/session';
import { useResetOn } from '@/hooks/use-reset-on';
import { PlatformHeader } from '@/components/layout/platform-header';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';

const profileOf = (s?: Session | null) => ({ name: s?.user.name ?? '', email: s?.user.email ?? '', phone: s?.user.phone ?? '' });

export default function ProfilePage() {
  const { session } = useSession();
  const qc = useQueryClient();
  const saved = profileOf(session);
  const [profile, setProfile] = useState(saved);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  // Refill the form when the saved details change (first load, after saving), not on every session refetch.
  useResetOn(JSON.stringify(saved), () => setProfile(saved));

  const saveProfile = useMutation({
    mutationFn: async () => (await api.put<Session>('/auth/profile', profile)).data,
    onSuccess: (s) => {
      qc.setQueryData(['session'], s);
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    onSuccess: () => {
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed', { description: 'Other devices have been signed out.' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pwError = pw.confirm && pw.confirm !== pw.newPassword ? 'Passwords do not match' : pw.newPassword && pw.newPassword.length < 8 ? 'At least 8 characters' : '';

  return (
    <div className="min-h-screen">
      <PlatformHeader />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href={session?.home ?? '/'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={session?.user.name} className="h-14 w-14 text-lg" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{session?.user.name}</h1>
            <p className="text-sm text-slate-500">
              {session?.user.isSuperAdmin ? 'Super admin' : session?.user.role?.name}
              {session?.company && ` · ${session.company.name}`}
            </p>
          </div>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><UserCircle2 className="h-4 w-4 text-blue-600" /> Profile</span>} description="Your name and sign-in details" />
            <CardBody>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveProfile.mutate();
                }}
              >
                <Field label="Full name" required className="sm:col-span-2">
                  <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={saveProfile.isPending} disabled={profile.name.trim().length < 2}>
                    Save profile
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-blue-600" /> Change password</span>} description="You stay signed in here; other devices are signed out." />
            <CardBody>
              <form
                className="grid gap-4 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!pwError) changePw.mutate();
                }}
              >
                <Field label="Current password" required>
                  <Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                </Field>
                <Field label="New password" required>
                  <Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                </Field>
                <Field label="Confirm new password" required error={pwError}>
                  <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                </Field>
                <div className="sm:col-span-3">
                  <Button type="submit" loading={changePw.isPending} disabled={!pw.currentPassword || !pw.newPassword || !!pwError || pw.confirm !== pw.newPassword}>
                    Update password
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
