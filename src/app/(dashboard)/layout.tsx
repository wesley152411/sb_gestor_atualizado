import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { FaixaDeAviso } from '@/components/layout/FaixaDeAviso';
import { AssinaturaProvider } from '@/components/providers/AssinaturaProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AssinaturaProvider>
        <div className="app-layout">
          <Sidebar />
          <main className="main-area">
            <Header />
            <div className="main-content">
              {/* UM slot de faixa. A prioridade está em FaixaDeAviso. */}
              <FaixaDeAviso />
              {children}
              <PublicLegalFooter />
            </div>
          </main>
        </div>
      </AssinaturaProvider>
    </AuthProvider>
  );
}
