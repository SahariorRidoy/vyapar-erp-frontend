'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowRight, Cog, Eye, EyeOff, Layers, Link2, Lock, Mail, MapPin, Phone, ShieldCheck, User, Wrench } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Session } from '@/lib/types';

const services = [
  { icon: Layers, label: 'SS, MS & GI Materials' },
  { icon: Link2, label: 'Pipes, Fittings & Hardware' },
  { icon: ShieldCheck, label: 'Fire Safety Solutions' },
  { icon: Cog, label: 'Pneumatic Systems & Components' },
  { icon: Wrench, label: 'Industrial Maintenance & Technical Support' },
];

function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 120 80" className="absolute inset-0 h-full w-full" aria-hidden>
        <ellipse cx="62" cy="40" rx="44" ry="34" fill="none" stroke="url(#stc-ring)" strokeWidth="5" strokeDasharray="190 60" transform="rotate(-25 62 40)" />
        <defs>
          <linearGradient id="stc-ring" x1="0" x2="1">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>
      </svg>
      <span className="relative text-5xl font-black tracking-tighter text-white italic drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">STC</span>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<Session>('/auth/login', { identifier, password });
      qc.setQueryData(['session'], data);
      const next = params.get('next');
      const allowed = next && next.startsWith('/') && !next.startsWith('//') && (next.startsWith('/c/') || next === '/companies' || next === '/profile');
      router.replace(allowed ? next : data.home);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const inputClass =
    'h-14 w-full rounded-xl border border-slate-200 bg-white pl-14 text-[15px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15';

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label className="mb-2.5 block text-[15px] font-semibold text-[#0b1f4d]" htmlFor="identifier">Email or Phone</label>
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input id="identifier" autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required className={`${inputClass} pr-4`} placeholder="Enter your email or phone" />
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-semibold text-[#0b1f4d]" htmlFor="password">Password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputClass} pr-12`} placeholder="Enter your password" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-500 hover:text-slate-800" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-lg font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-700 hover:to-blue-600 disabled:opacity-70"
      >
        {loading ? 'Signing in…' : <>Sign In <ArrowRight className="h-5 w-5" /></>}
      </button>
      <p className="text-sm text-slate-500">Forgot your password? Contact your system administrator.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:h-screen lg:grid-cols-[57%_43%] lg:overflow-hidden">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[#0a2a8c] text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b3bd1] via-[#0a2a8c] to-[#061a5e]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[45%] bg-gradient-to-l from-sky-400/25 via-blue-500/10 to-transparent" />
        <div className="pointer-events-none absolute -right-40 top-1/3 h-[140%] w-40 rotate-[28deg] bg-gradient-to-b from-sky-300/40 to-blue-500/0 blur-sm" />
        <div className="pointer-events-none absolute -bottom-24 -right-10 h-72 w-[120%] -rotate-[18deg] bg-gradient-to-r from-transparent via-blue-500/40 to-sky-400/50" />
        <div className="pointer-events-none absolute -left-20 bottom-1/3 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative flex h-full flex-col px-[7%] py-[4vh]">
          <div className="flex items-center gap-6">
            <Logo className="h-[clamp(3.5rem,9vh,6rem)] w-[clamp(5.5rem,13vh,9rem)] shrink-0" />
            <div className="h-[clamp(3.5rem,9vh,6rem)] w-px bg-white/50" />
            <div>
              <p className="text-[clamp(1.4rem,3.6vh,2.25rem)] leading-[1.05] font-extrabold tracking-wide">SUMON TRADE<br />CORPORATION</p>
              <p className="mt-[0.8vh] text-[clamp(0.65rem,1.4vh,0.875rem)] font-medium tracking-wide text-blue-100">INDUSTRIAL SUPPLY &amp; ENGINEERING SOLUTIONS</p>
            </div>
          </div>

          <h1 className="mt-[4vh] text-[clamp(1.3rem,3.3vh,2.1rem)] leading-snug">
            Your Trusted Partner for
            <br />
            <span className="font-bold">Construction</span> <span className="font-bold text-sky-300">&amp; Garments Industries.</span>
          </h1>

          <ul className="mt-[2.5vh] max-w-xl">
            {services.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-6 py-[0.5vh]">
                <span className="flex h-[clamp(2.25rem,5.6vh,3.5rem)] w-[clamp(2.25rem,5.6vh,3.5rem)] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg ring-2 ring-sky-300/40">
                  <Icon className="h-1/2 w-1/2" />
                </span>
                <span className="flex-1 border-b border-white/15 py-[1.2vh] text-[clamp(0.9rem,2vh,1.125rem)] font-semibold">{label}</span>
              </li>
            ))}
          </ul>

          <div className="mt-[2.5vh] h-1 w-20 rounded bg-sky-400" />
          <p className="mt-[1.5vh] text-[clamp(1.1rem,2.6vh,1.5rem)] font-bold italic">
            Reliable Supply. <span className="text-sky-300">Trusted Service.</span>
          </p>
          <div className="mt-[1.5vh] h-px max-w-xl bg-white/20" />

          <div className="mt-[2.5vh] flex flex-wrap gap-y-3 text-[clamp(0.75rem,1.55vh,0.875rem)]">
            <div className="flex items-start gap-3 pr-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500"><Phone className="h-4 w-4" /></span>
              <div><a href="tel:01711222014" className="font-semibold hover:underline">01711222014</a><p className="text-xs text-blue-200">Contact Number</p></div>
            </div>
            <div className="flex items-start gap-3 border-l border-white/25 px-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500"><Mail className="h-4 w-4" /></span>
              <div><a href="mailto:sumomtradecorporation@gmail.com" className="font-semibold hover:underline">sumomtradecorporation@gmail.com</a><p className="text-xs text-blue-200">Email Address</p></div>
            </div>
            <div className="flex items-start gap-3 border-l border-white/25 pl-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500"><MapPin className="h-4 w-4" /></span>
              <div><p className="font-semibold">7 no bangshal Nawabpur road<br />Dhaka 1100</p><p className="text-xs text-blue-200">Office Address</p></div>
            </div>
          </div>

          <p className="mt-auto pt-[2vh] text-[clamp(0.75rem,1.55vh,0.875rem)] text-blue-100">© {new Date().getFullYear()} Sumon Trade Corporation</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col overflow-x-hidden overflow-y-auto bg-white">
        <div className="pointer-events-none fixed inset-y-0 right-0 overflow-hidden lg:w-[43%] max-lg:inset-x-0">
          <div className="absolute -top-40 -right-40 h-112 w-md rounded-full border-48 border-blue-50" />
          <div className="absolute -right-10 -top-10 h-60 w-60 rounded-full bg-blue-50/70" />
          <div className="absolute -right-48 -bottom-48 h-120 w-120 rounded-full border-56 border-blue-50/80" />
        </div>

        <div className="relative flex flex-1 items-center px-6 py-12 sm:px-12 xl:px-16">
          <div className="w-full max-w-xl">
            <div className="mb-10 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#0b3bd1] to-[#061a5e] p-4 text-white lg:hidden">
              <Logo className="h-14 w-20 shrink-0 [&_span]:text-3xl" />
              <div>
                <p className="text-lg leading-tight font-extrabold">SUMON TRADE CORPORATION</p>
                <p className="text-[10px] tracking-wide text-blue-100">INDUSTRIAL SUPPLY &amp; ENGINEERING SOLUTIONS</p>
              </div>
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-[#0b1f4d] sm:text-5xl">
              Welcome <span className="text-blue-600">Back</span>
            </h2>
            <p className="mt-3 mb-[5vh] text-lg text-slate-500 sm:text-xl">Sign in to manage your business.</p>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
            <p className="mt-8 border-t border-slate-100 pt-5 text-sm text-slate-500">
              Developed by{' '}
              <a href="https://techgeniuslabs.vercel.app/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">
                Tech Genius Labs
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
