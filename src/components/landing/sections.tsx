import Image from 'next/image';
import Link from 'next/link';
import {
  Package, ShoppingBag, BarChart3, MessageSquare, ClipboardList, Shield,
  Boxes, Store, ShieldCheck, CheckCircle2,
} from 'lucide-react';

const ANCHOR = { scrollMarginTop: 80 } as const;

/* ---------------- Hero ---------------- */
export function LandingHero() {
  return (
    <section className="lp-hero">
      <div className="lp-hero-inner">
        <div>
          <h1>Gestão Inteligente para Decoradoras de Festas</h1>
          <p>
            Controle seu acervo, conecte-se com parceiras B2B e gerencie sua logística
            em uma única plataforma cloud desenhada para o mercado de eventos.
          </p>
          <div className="lp-hero-cta">
            <Link href="/signup" className="lp-btn lp-btn-accent lp-btn-lg">Começar Agora — É Grátis</Link>
          </div>
        </div>
        <div className="lp-hero-media">
          <Image
            src="/landing/hero.jpg"
            alt="Mesa de evento decorada com arranjos, velas e louças"
            width={1200}
            height={900}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
          <div className="lp-hero-badge">
            <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--lp-primary)' }} />
            <div>
              <span>Status do acervo</span>
              <b>100% Sincronizado</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Faixa de valor (3 pilares, sem números) ---------------- */
// Parametrizada por lista: no futuro pode voltar a exibir métricas reais do banco
// sem refazer a seção — basta trocar a fonte dos itens.
const PILLARS = [
  { icon: Boxes, title: 'Acervo sempre organizado', desc: 'Suas peças catalogadas, com fotos, valores e disponibilidade em tempo real.' },
  { icon: Store, title: 'Marketplace entre decoradoras', desc: 'Alugue peças de parceiras da sua região e atenda festas maiores sem ampliar o estoque.' },
  { icon: ShieldCheck, title: 'Seus dados protegidos', desc: 'Tudo na nuvem, com acesso de qualquer lugar e backup automático.' },
];
export function LandingValueBand() {
  return (
    <section className="lp-value" aria-label="Pilares do produto">
      <div className="lp-value-inner">
        {PILLARS.map((p) => (
          <div className="lp-value-item" key={p.title}>
            <span className="lp-value-ico"><p.icon className="w-7 h-7" /></span>
            <h3>{p.title}</h3>
            <p>{p.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Benefícios ---------------- */
const BENEFITS = [
  { icon: Package, title: 'Acervo Digital', desc: 'Catalogue todas as suas peças com fotos, medidas e valores de locação de forma elegante e acessível.' },
  { icon: ShoppingBag, title: 'Marketplace B2B', desc: 'Sublogue peças de parceiras de confiança diretamente pela plataforma, expandindo seu portfólio sem custos de estoque.' },
  { icon: BarChart3, title: 'Dashboard Analítico', desc: 'Visualize quais peças rendem mais e controle seu fluxo de caixa para tomar decisões com dados visuais claros.' },
  { icon: ClipboardList, title: 'Checklist de Festas', desc: 'Monte seus projetos de decoração vinculando o acervo, gerando romaneios de separação automáticos e impecáveis.' },
  { icon: MessageSquare, title: 'Chat entre Parceiras', desc: 'Comunicação integrada para combinar retiradas, devoluções e negociar sublocações sem sair do ambiente de gestão.' },
  { icon: Shield, title: 'Seus dados protegidos', desc: 'Suas informações financeiras protegidas com criptografia de ponta a ponta em servidores de alta disponibilidade.' },
];
export function LandingBenefits() {
  return (
    <section id="beneficios" className="lp-section" style={ANCHOR}>
      <h2 className="lp-section-title">Tudo o que você precisa em um só lugar</h2>
      <p className="lp-section-sub">
        A união perfeita entre organização impecável e um design que entende a estética do seu negócio.
      </p>
      <div className="lp-benefits-grid">
        {BENEFITS.map((b) => (
          <div className="lp-benefit" key={b.title}>
            <div className="lp-benefit-ico"><b.icon className="w-6 h-6" /></div>
            <h3>{b.title}</h3>
            <p>{b.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Como funciona ---------------- */
const STEPS = [
  { t: 'Cadastre seu Acervo', d: 'Fotografe as peças, adicione categorias, quantidades e valores. Crie um banco de dados visual e organizado do seu maior patrimônio.' },
  { t: 'Conecte-se com Parceiras', d: 'Navegue pelo Marketplace B2B e encontre aquela peça específica que falta para o seu projeto no acervo de colegas da região.' },
  { t: 'Gerencie seus Eventos', d: 'Monte a lista de separação para o fim de semana. O sistema bloqueia as datas automaticamente e gera os relatórios logísticos.' },
];
export function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="lp-section" style={ANCHOR}>
      <div className="lp-how">
        <div className="lp-how-media">
          <Image
            src="/landing/how.jpg"
            alt="Decoradora organizando o acervo de peças"
            width={1000}
            height={760}
            loading="lazy"
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        <div>
          <h2>Como a mágica acontece</h2>
          {STEPS.map((s, i) => (
            <div className="lp-step" key={s.t}>
              <div className={`lp-step-num ${i === STEPS.length - 1 ? 'filled' : ''}`}>{i + 1}</div>
              <div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Faixa Marketplace ---------------- */
export function LandingMarketplaceBanner() {
  return (
    <section id="marketplace" className="lp-mkt" style={ANCHOR}>
      <div className="lp-mkt-inner">
        <div>
          <span className="lp-mkt-tag">Marketplace Exclusivo</span>
          <h2>Sua loja sem estoque físico</h2>
          <p>
            Multiplique suas possibilidades de locação acessando o acervo de decoradoras da sua região.
            Alugue de forma segura e aumente seu faturamento.
          </p>
          <div className="lp-mkt-btn">
            <Link href="/marketplace" className="lp-btn lp-btn-onteal lp-btn-lg">Explorar Marketplace</Link>
          </div>
        </div>
        <div className="lp-mkt-media">
          <Image
            src="/landing/marketplace.jpg"
            alt="Catálogo do Marketplace B2B em um tablet"
            width={1000}
            height={720}
            loading="lazy"
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------- CTA final ---------------- */
export function LandingCTA() {
  return (
    <section className="lp-cta">
      <h2>Pronta para profissionalizar sua gestão?</h2>
      <p>
        Organize seu acervo, conecte-se com parceiras e comece a operar com mais eficiência hoje mesmo.
      </p>
      <div className="lp-cta-btn">
        <Link href="/signup" className="lp-btn lp-btn-accent lp-btn-lg">Criar Conta Grátis</Link>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <div className="lp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="SB Gestor" />
            <span>SB GESTOR</span>
          </div>
          <p>Soluções inteligentes de gestão para decoradoras de festas.</p>
        </div>
        <div className="lp-footer-col">
          <h5>Produto</h5>
          <a href="#beneficios">Benefícios</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#marketplace">Marketplace</a>
        </div>
        <div className="lp-footer-col">
          <h5>Conta</h5>
          <Link href="/login">Entrar</Link>
          <Link href="/signup">Criar conta grátis</Link>
        </div>
        <div className="lp-footer-col">
          <h5>Legal</h5>
          <Link href="/privacidade">Política de Privacidade</Link>
          <Link href="/termos">Termos de Uso</Link>
        </div>
      </div>
      <div className="lp-footer-bottom">
        © {new Date().getFullYear()} SB Gestor — Todos os direitos reservados.
      </div>
    </footer>
  );
}
