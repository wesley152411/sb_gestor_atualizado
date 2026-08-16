import type { Metadata } from 'next';
import { Manrope, Libre_Caslon_Text } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

// Fontes auto-hospedadas pelo Next (sem <link> solto): Manrope (UI/texto) e
// Libre Caslon Text (títulos editoriais). Expostas como variáveis CSS.
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const caslon = Libre_Caslon_Text({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const SITE_DESC =
  'Controle seu acervo, conecte-se com parceiras B2B e gerencie a logística de eventos em uma plataforma cloud desenhada para decoradoras de festas.';

export const metadata: Metadata = {
  title: 'SB GESTOR — Gestão Inteligente para Decoradoras de Festas',
  description: SITE_DESC,
  openGraph: {
    title: 'SB GESTOR — Gestão Inteligente para Decoradoras de Festas',
    description: SITE_DESC,
    type: 'website',
    locale: 'pt_BR',
    siteName: 'SB Gestor',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'SB Gestor' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: extensões do navegador (ex.: ColorZilla) injetam
  // atributos como cz-shortcut-listen no <body> antes do React hidratar,
  // causando divergência servidor/cliente. Isso ignora só esse ruído.
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${caslon.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
