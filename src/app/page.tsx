'use client';

import Link from 'next/link';
import { Package, ShoppingBag, BarChart3, MessageSquare, ClipboardList, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-logo">
          <div style={{
            width: 38, height: 38,
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: 'white'
          }}>SB</div>
          <span>SB GESTOR</span>
        </div>
        <div className="landing-nav-links">
          <Link href="/login">
            <Button variant="secondary">Entrar</Button>
          </Link>
          <Link href="/signup">
            <Button>Criar Conta Grátis</Button>
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-content">
          <h1>Gestão Inteligente para Decoradoras de Festas</h1>
          <p>
            Controle seu acervo, conecte-se com parceiras B2B, gerencie 
            contratos e logística de eventos — tudo em uma plataforma cloud moderna.
          </p>
          <Link href="/signup">
            <Button size="lg">Começar Agora — É Grátis</Button>
          </Link>
        </div>
      </section>

      <section className="landing-features">
        <h2>Tudo que você precisa em um só lugar</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Package className="w-7 h-7" /></div>
            <h3>Acervo Digital</h3>
            <p>Cadastre e organize todas as peças do seu inventário com fotos, preços e controle de estoque.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><ShoppingBag className="w-7 h-7" /></div>
            <h3>Marketplace B2B</h3>
            <p>Alugue peças de outras decoradoras da sua região e amplie seu catálogo sem investimento.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><BarChart3 className="w-7 h-7" /></div>
            <h3>Dashboard Analítico</h3>
            <p>Acompanhe faturamento, margem de lucro, temas mais solicitados e volume de eventos em tempo real.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><ClipboardList className="w-7 h-7" /></div>
            <h3>Checklist de Festas</h3>
            <p>Crie contratos com detecção automática de conflitos de estoque e gere PDFs logísticos para a equipe.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><MessageSquare className="w-7 h-7" /></div>
            <h3>Chat entre Parceiras</h3>
            <p>Comunique-se diretamente com outras decoradoras para negociar locações e parcerias.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Shield className="w-7 h-7" /></div>
            <h3>Segurança Cloud</h3>
            <p>Seus dados protegidos com autenticação Supabase e criptografia de ponta a ponta.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} SB GESTOR — Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
