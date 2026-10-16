import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bodega FC',
  description: 'Gestión de precios de proveedor, catálogo y listas de compras',
  appleWebApp: {
    capable: true,
    title: 'Bodega FC',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2D6A4F',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-VE" className={nunito.variable}>
      <body className="antialiased min-h-screen bg-[var(--color-fondo)] text-[var(--color-texto-principal)]">
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: {
              fontFamily: 'var(--font-nunito)',
              fontSize: '14px',
              borderRadius: '12px',
            },
          }}
        />
        <main className="max-w-[448px] mx-auto min-h-screen flex flex-col bg-[var(--color-fondo)]">
          {children}
        </main>
      </body>
    </html>
  );
}
