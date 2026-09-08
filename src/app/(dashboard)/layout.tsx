import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { FaixaDeAviso } from '@/components/layout/FaixaDeAviso';
import { AssinaturaProvider } from '@/components/providers/AssinaturaProvider';
import { AssinaturaGate } from '@/components/providers/AssinaturaGate';
import { AuthProvider } from '@/components/providers/AuthProvider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AssinaturaProvider>
        {/* Quem nunca assinou não entra: o portão cobre a casca inteira, menos as
            próprias telas de assinatura, que são a saída dele. */}
        <AssinaturaGate>
        <div className="app-layout">
          <Sidebar />
          <main className="main-area">
            <Header />
            <div className="main-content">
              {/* UM slot de faixa. A prioridade está em FaixaDeAviso. */}
              <FaixaDeAviso />
              {children}
            </div>
          </main>
        </div>
        </AssinaturaGate>
      </AssinaturaProvider>
    </AuthProvider>
  );
}
