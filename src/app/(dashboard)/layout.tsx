import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { CnpjBanner } from '@/components/layout/CnpjBanner';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-area">
          <Header />
          <div className="main-content">
            <CnpjBanner />
            {children}
            <PublicLegalFooter />
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
