'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, ShoppingCart, Users,
  Settings, LifeBuoy, ShoppingBag, Store, MessageSquare, CalendarDays, Menu, ExternalLink, X,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useMenuStore } from '@/stores/menu-store';
import { useInventory, useDecoratorChats } from '@/hooks/swr-hooks';
import {
  totalDePecas, rotuloDePecas, rotuloDeNaoLidas, formatarContador, contarNaoLidas,
} from '@/lib/menu-contadores';

// ============================================================================
// BARRA LATERAL.
//
// O visual segue o print de referência aprovado: itens agrupados em seções
// com rótulo, item ativo com fundo sólido, contadores com DADO REAL e bloco
// inferior separado. Os TEXTOS dos itens são os de sempre — o print é
// referência de estrutura, não de conteúdo. O cabeçalho (foto e nome da
// decoradora) continua exatamente como era: é o único lugar do app que diz
// em qual conta ela está.
//
// NO CELULAR (abaixo de 1024px) a barra sai da tela e vira um painel
// deslizante, aberto pelo ☰ do cabeçalho. Antes disso a barra sumia e não
// havia como abri-la: quem usava pelo celular não tinha menu nenhum.
// ============================================================================

type Contador = 'pecas' | 'naoLidas';

type ItemMenu = {
  href: string;
  label: string;
  icon: LucideIcon;
  contador?: Contador;
  /** Abre fora do sistema: ganha o ícone de link externo e nova aba. */
  externo?: boolean;
};

type Secao = { id: string; rotulo: string; tom?: 'rede'; itens: ItemMenu[] };

// A ordem mudou para formar os grupos; os rótulos dos itens, não.
// Nenhum item abre fora do sistema hoje, então nenhum leva `externo`.
const secoes: Secao[] = [
  {
    id: 'atelie',
    rotulo: 'Gestão do Ateliê',
    itens: [
      { href: '/analytics', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/inventory', label: 'Meu Acervo', icon: Package, contador: 'pecas' },
      { href: '/calendar', label: 'Calendário', icon: CalendarDays },
    ],
  },
  {
    id: 'comercial',
    rotulo: 'Comercial & Clientes',
    itens: [
      { href: '/clients', label: 'Clientes', icon: Users },
      { href: '/party-form', label: 'Formulário', icon: ShoppingCart },
      { href: '/marketplace/my-page', label: 'Minha Página', icon: Store },
    ],
  },
  {
    id: 'rede',
    rotulo: 'Rede & Parcerias',
    tom: 'rede',
    itens: [
      { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
      { href: '/chat', label: 'Chat', icon: MessageSquare, contador: 'naoLidas' },
    ],
  },
];

/** Mesmo limite do CSS (RESPONSIVE): abaixo dele a barra vira painel. */
const CONSULTA_CELULAR = '(max-width: 1024px)';

function estaAtivo(href: string, pathname: string): boolean {
  // /marketplace é prefixo de /marketplace/my-page: casa só o caminho exato.
  if (href === '/marketplace') return pathname === '/marketplace';
  return pathname === href || pathname.startsWith(href + '/');
}

/** Última visita ao Chat, gravada no navegador. Nulo = nunca registrada. */
function lerVisto(chave: string | null): number | null {
  if (!chave) return null;
  try {
    const valor = Number(localStorage.getItem(chave));
    return valor > 0 ? valor : null;
  } catch {
    return null; // modo privado ou armazenamento bloqueado
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { decorator } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const { aberto, fechar } = useMenuStore();
  const fecharRef = useRef<HTMLButtonElement>(null);

  // Mesma chave que o Acervo usa: o SWR divide o cache, sem requisição a mais.
  // Sem assinatura a rota devolve 402, a lista vem vazia e a pílula some.
  const { items } = useInventory(decorator?.id);
  const pecas = decorator?.id ? totalDePecas(items) : 0;

  // Não lidas: mensagens recebidas depois da última visita ao Chat. A leitura do
  // navegador é por useSyncExternalStore, como na FaixaDeAviso: o servidor não
  // tem localStorage, e ler dentro de um efeito com setState piscaria o número.
  const { chats } = useDecoratorChats(decorator?.id);
  const chaveVisto = decorator?.id ? `sbg:chat-seen:${decorator.id}` : null;
  const vistoEm = useSyncExternalStore(
    () => () => {},
    () => lerVisto(chaveVisto),
    () => null,
  );
  const noChat = pathname === '/chat' || pathname.startsWith('/chat/');

  useEffect(() => {
    if (!chaveVisto) return;
    try {
      // Dentro do Chat, tudo está sendo visto — inclusive o que chegar agora.
      // Na primeira vez que a conta passa por aqui, a referência nasce agora:
      // o histórico anterior não vira "não lido" de uma vez.
      if (noChat || !localStorage.getItem(chaveVisto)) {
        localStorage.setItem(chaveVisto, String(Date.now()));
      }
    } catch {
      /* armazenamento indisponível: o contador fica em zero, sem quebrar nada */
    }
  }, [chaveVisto, noChat, chats]);

  // ---- Painel no celular ----------------------------------------------------

  // Tocou num item: a página muda e o painel fecha sozinho. Sem isto, a
  // decoradora navegaria e continuaria vendo o menu por cima da página nova.
  useEffect(() => {
    fechar();
  }, [pathname, fechar]);

  useEffect(() => {
    if (!aberto) return;
    const celular = window.matchMedia(CONSULTA_CELULAR);
    // Aberto numa tela larga não tem o que fazer: a barra já está visível.
    if (!celular.matches) {
      fechar();
      return;
    }

    // A página de trás fica INERTE (nem teclado nem leitor de tela chegam nela)
    // e não rola sob o dedo. É o que faz o painel se comportar como um diálogo.
    const principal = document.querySelector<HTMLElement>('.main-area');
    const gatilho = document.getElementById('menu-abrir');
    const overflowAntes = document.body.style.overflow;
    principal?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();

    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    // Girou o tablet ou alargou a janela até virar desktop: o painel sai.
    const aoMudarTela = (e: MediaQueryListEvent) => {
      if (!e.matches) fechar();
    };
    document.addEventListener('keydown', aoTecla);
    celular.addEventListener('change', aoMudarTela);

    return () => {
      principal?.removeAttribute('inert');
      document.body.style.overflow = overflowAntes;
      document.removeEventListener('keydown', aoTecla);
      celular.removeEventListener('change', aoMudarTela);
      // O foco volta para quem abriu o menu, e não para o topo da página.
      gatilho?.focus();
    };
  }, [aberto, fechar]);

  const naoLidas = noChat ? 0 : contarNaoLidas(chats, decorator?.id, vistoEm);
  const configAtivo = pathname.startsWith('/settings');
  // Recolher é coisa do desktop. Com o painel aberto no celular, a barra vem
  // sempre inteira, com os textos, mesmo que tenha sido recolhida lá em cima.
  const recolhida = collapsed && !aberto;

  return (
    <>
      {/* Fundo escuro do painel: tocar fora fecha. Só aparece no celular. */}
      <div className={cn('menu-fundo', aberto && 'visivel')} onClick={fechar} aria-hidden="true" />

      <aside
        id="menu-lateral"
        className={cn('sidebar-v2', recolhida && 'collapsed', aberto && 'open')}
        {...(aberto ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menu' } : {})}
      >
        {/* Logo + toggle — inalterado: foto e nome da decoradora. */}
        <div className="sidebar-v2-logo">
          <div className="sidebar-v2-brand">
            <div className="sidebar-v2-logo-icon">
              {decorator?.avatar_url ? (
                <img src={decorator.avatar_url} alt={decorator.name || 'Avatar'} />
              ) : (
                getInitials(decorator?.name)
              )}
            </div>
            <span className="sidebar-v2-logo-text">{decorator?.name || 'SB GESTOR'}</span>
          </div>
          <button
            type="button"
            className="sidebar-v2-toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* No celular o "recolher" não faz sentido: no lugar dele, fechar. */}
          <button
            type="button"
            ref={fecharRef}
            className="sidebar-v2-fechar"
            onClick={fechar}
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="sidebar-v2-nav" aria-label="Menu principal">
          {secoes.map((secao) => (
            <div key={secao.id} className="sidebar-v2-secao">
              <p id={`menu-secao-${secao.id}`} className={cn('sidebar-v2-secao-rotulo', secao.tom === 'rede' && 'rede')}>
                {secao.rotulo}
              </p>
              <ul className="sidebar-v2-menu" aria-labelledby={`menu-secao-${secao.id}`}>
                {secao.itens.map((item) => {
                  const ativo = estaAtivo(item.href, pathname);
                  const qtdPecas = item.contador === 'pecas' ? pecas : 0;
                  const qtdNaoLidas = item.contador === 'naoLidas' ? naoLidas : 0;
                  // Nome acessível começa pelo rótulo visível (quem usa comando de
                  // voz fala o que vê) e carrega o contador, que é aria-hidden.
                  // Com a barra recolhida o texto some; o nome continua aqui.
                  const nome = [
                    item.label,
                    qtdPecas > 0 && rotuloDePecas(qtdPecas),
                    qtdNaoLidas > 0 && rotuloDeNaoLidas(qtdNaoLidas),
                    item.externo && 'abre em nova aba',
                  ].filter(Boolean).join(', ');

                  const conteudo = (
                    <>
                      <item.icon className="sidebar-v2-link-icon" aria-hidden="true" />
                      <span className="sidebar-v2-link-rotulo">{item.label}</span>
                      {qtdPecas > 0 && (
                        <span className="sidebar-v2-pilula" aria-hidden="true">{rotuloDePecas(qtdPecas)}</span>
                      )}
                      {qtdNaoLidas > 0 && (
                        <span className="sidebar-v2-contador" aria-hidden="true">{formatarContador(qtdNaoLidas)}</span>
                      )}
                      {item.externo && <ExternalLink className="sidebar-v2-externo" aria-hidden="true" />}
                    </>
                  );

                  return (
                    <li key={item.href}>
                      {item.externo ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-v2-link"
                          aria-label={nome}
                          title={recolhida ? nome : undefined}
                        >
                          {conteudo}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className={cn('sidebar-v2-link', ativo && 'active')}
                          aria-current={ativo ? 'page' : undefined}
                          aria-label={nome}
                          title={recolhida ? nome : undefined}
                        >
                          {conteudo}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bloco inferior, fixo e separado: suporte e configurações. */}
        <div className="sidebar-v2-bottom">
          <div className="sidebar-v2-bottom-links">
            <a href="#" className="sidebar-v2-bottom-link" aria-label="Suporte" title={recolhida ? 'Suporte' : undefined}>
              <LifeBuoy className="sidebar-v2-link-icon" aria-hidden="true" />
              <span>Suporte</span>
            </a>
            <Link
              href="/settings"
              className={cn('sidebar-v2-bottom-link', configAtivo && 'active')}
              aria-current={configAtivo ? 'page' : undefined}
              aria-label="Configurações"
              title={recolhida ? 'Configurações' : undefined}
            >
              <Settings className="sidebar-v2-link-icon" aria-hidden="true" />
              <span>Configurações</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
