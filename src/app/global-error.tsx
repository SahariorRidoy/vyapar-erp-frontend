'use client';
import './globals.css';
import { ErrorView } from '@/components/ui/fallback';

/** Last resort when the root layout itself fails; it replaces the whole document. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <ErrorView error={error} reset={reset} className="min-h-screen" />
      </body>
    </html>
  );
}
