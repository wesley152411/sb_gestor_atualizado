import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'SB GESTOR - Gestão de Decoração e Locação B2B',
  description: 'Gerencie locações, controle seu estoque e integre com decoradoras parceiras. Tudo em uma plataforma cloud.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: extensões do navegador (ex.: ColorZilla) injetam
  // atributos como cz-shortcut-listen no <body> antes do React hidratar,
  // causando divergência servidor/cliente. Isso ignora só esse ruído.
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
