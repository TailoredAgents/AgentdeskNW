import type { Metadata, Viewport } from 'next';
import './globals.css';
import './presentation.css';
import './intelligence.css';
import './commerce.css';
import './inbox.css';
import './work.css';
import './phone.css';
import './inbox-conversation.css';
import './brand.css';
import './management.css';
import './polish.css';
export const metadata: Metadata = {
  title: 'AgentDesk NW — Your work, moving forward',
  description: 'Your personal assistant, backed by a specialized AI workforce. A private concept demonstration by Tailored Agents.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AgentDesk NW' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#2c2c2c' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
