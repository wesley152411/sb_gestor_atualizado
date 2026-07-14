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
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <main className="flex-1 ml-[260px] flex flex-col">
          <Header />
          <div className="flex-1 p-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
