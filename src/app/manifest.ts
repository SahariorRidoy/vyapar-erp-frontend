import type { MetadataRoute } from 'next';

/** Lets the app be installed to a phone's home screen or a desktop's app list, opening without browser bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sumon Trade Corporation',
    short_name: 'Sumon Trade',
    description: 'Billing, accounting, inventory and HR for every business you run.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1e3a8a',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
