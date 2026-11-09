import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const plex = localFont({
  variable: '--font-plex',
  display: 'swap',
  src: [
    { path: './fonts/IBMPlexSansArabic-Regular.woff2', weight: '400' },
    { path: './fonts/IBMPlexSansArabic-Medium.woff2', weight: '500' },
    { path: './fonts/IBMPlexSansArabic-SemiBold.woff2', weight: '600' },
  ],
});
const messiri = localFont({
  variable: '--font-messiri',
  display: 'swap',
  src: [{ path: './fonts/ElMessiri-Variable.woff2', weight: '400 700' }],
});

export const metadata: Metadata = {
  title: { default: 'Dalora للصالونات', template: '%s · Dalora' },
  description: 'إدارة حجوزات الصالون: الجدول، العميلات، المال والتقارير.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#FBF7F3', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${messiri.variable}`}>
      <body>{children}</body>
    </html>
  );
}
