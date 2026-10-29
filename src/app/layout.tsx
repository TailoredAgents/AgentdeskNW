import type { Metadata, Viewport } from 'next';
import './globals.css';
import './presentation.css';
export const metadata: Metadata = {
  title: 'AgentDesk NW — Your work, moving forward',
  description: 'Your personal assistant, backed by a specialized AI workforce. A private concept demonstration by Tailored Agents.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AgentDesk NW' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#163c2e' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
