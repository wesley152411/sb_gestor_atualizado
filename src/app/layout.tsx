import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'SB GESTOR - Gestão de Decoração e Locação B2B',
  description: 'Gerencie locações, controle seu estoque e integre com decoradoras parceiras. Tudo em uma plataforma cloud.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
