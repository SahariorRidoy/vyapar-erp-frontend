import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
import { QueryProvider } from '@/providers/query';
import { ConfirmProvider } from '@/components/ui/confirm';

export const metadata: Metadata = {
  title: { default: 'Sumon Trade Corporation', template: '%s · Sumon Trade Corporation' },
  description: 'Billing, accounting, inventory and HR for every business you run.',
  applicationName: 'Sumon Trade Corporation',
  // "Add to Home Screen" on iPhone and iPad opens the app full screen, like an installed app
  appleWebApp: { capable: true, title: 'Sumon Trade Corporation', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#1e3a8a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <QueryProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </QueryProvider>
        <Toaster position="top-right" richColors closeButton duration={3500} />
      </body>
    </html>
  );
}
