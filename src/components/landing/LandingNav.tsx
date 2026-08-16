'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const LINKS = [
  { id: 'beneficios', label: 'Benefícios' },
  { id: 'como-funciona', label: 'Como Funciona' },
  { id: 'marketplace', label: 'Marketplace' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  // Estado ativo conforme a seção visível (rolagem suave é do CSS scroll-behavior).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <Link href="/" className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="SB Gestor" />
          <span>SB GESTOR</span>
        </Link>

        <div className="lp-nav-links">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} className={`lp-nav-link ${active === l.id ? 'active' : ''}`}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="lp-nav-cta">
          <Link href="/login" className="lp-btn lp-btn-ghost">Entrar</Link>
          <Link href="/signup" className="lp-btn lp-btn-accent">Criar Conta Grátis</Link>
        </div>

        <button
          className="lp-nav-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <div className={`lp-mobile-menu ${open ? 'open' : ''}`}>
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`} className="lp-nav-link" onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <Link href="/login" className="lp-btn lp-btn-outline" onClick={() => setOpen(false)}>Entrar</Link>
        <Link href="/signup" className="lp-btn lp-btn-accent" onClick={() => setOpen(false)}>Criar Conta Grátis</Link>
      </div>
    </nav>
  );
}
