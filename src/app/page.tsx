'use client';

import Link from 'next/link';
import { Package, ShoppingBag, BarChart3, MessageSquare, ClipboardList, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { icon: Package, title: 'Acervo Digital', desc: 'Cadastre e organize todas as peças do seu inventário com fotos, preços e controle de estoque.' },
  { icon: ShoppingBag, title: 'Marketplace B2B', desc: 'Alugue peças de outras decoradoras da sua região e amplie seu catálogo sem investimento.' },
  { icon: BarChart3, title: 'Dashboard Analítico', desc: 'Acompanhe faturamento, margem de lucro, temas mais solicitados e volume de eventos em tempo real.' },
  { icon: ClipboardList, title: 'Checklist de Festas', desc: 'Crie contratos com detecção automática de conflitos de estoque e gere PDFs logísticos para a equipe.' },
  { icon: MessageSquare, title: 'Chat entre Parceiras', desc: 'Comunique-se diretamente com outras decoradoras para negociar locações e parcerias.' },
  { icon: Shield, title: 'Segurança Cloud', desc: 'Seus dados protegidos com autenticação Supabase e criptografia de ponta a ponta.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navegação */}
      <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-brand-400 rounded-xl flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-brand-500/20">
            SB
          </div>
          <span className="font-bold text-lg text-slate-800 tracking-tight">SB GESTOR</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="secondary" size="sm">Entrar</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Criar Conta Grátis</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center px-8 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-600 text-sm font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse-dot" />
          Plataforma #1 para Decoradoras
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
          Gestão Inteligente para{' '}
          <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
            Decoradoras de Festas
          </span>
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          Controle seu acervo, conecte-se com parceiras B2B, gerencie
          contratos e logística de eventos — tudo em uma plataforma cloud moderna.
        </p>
        <Link href="/signup">
          <Button size="lg">Começar Agora — É Grátis</Button>
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-8 pb-24">
        <h2 className="text-2xl font-extrabold text-center text-slate-800 mb-12">
          Tudo que você precisa em um só lugar
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center mb-4 group-hover:bg-brand-100 transition-colors">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-6 text-center">
        <p className="text-sm text-slate-400">
          © {new Date().getFullYear()} SB GESTOR — Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
