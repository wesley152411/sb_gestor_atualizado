import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AuthProvider } from '@/components/providers/AuthProvider';

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
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
