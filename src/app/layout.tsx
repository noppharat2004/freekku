// app/layout.tsx
// ---------------------------------------------------------------
// Root layout: sets metadata, Google Fonts, and the app shell.
// ---------------------------------------------------------------
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ศาลาแจกของ — ของฟรี มหาวิทยาลัย',
  description:
    'บอร์ดแจ้งของแจกฟรีจากศาลาแบบเรียลไทม์ อัพเดทสถานะได้ทันที ไม่ต้องรอแอดมินอนุมัติ',
  keywords: ['ของแจก', 'ศาลา', 'มหาวิทยาลัย', 'ฟรี', 'อาหาร', 'เครื่องดื่ม'],
  openGraph: {
    title: 'ศาลาแจกของ — ของฟรี มหาวิทยาลัย',
    description: 'บอร์ดแจ้งของแจกฟรีแบบเรียลไทม์',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Prevent unwanted zoom on input focus (mobile)
  themeColor: '#b94a3c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        {/* Noto Sans Thai for correct Thai glyph rendering */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {/* App-level max-width constraint for large screens */}
        <div className="mx-auto max-w-lg min-h-dvh relative">
          {children}
        </div>
      </body>
    </html>
  );
}
