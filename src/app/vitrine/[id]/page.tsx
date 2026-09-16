'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { formatCurrency, getInitials } from '@/lib/utils';
import { carregarVitrine, rotaDoItem, type Vitrine } from '@/lib/vitrine';

// VITRINE PÚBLICA — o que a decoradora compartilha pela Minha Página. Quem abre
// vê a marca dela (capa da Minha Página ao fundo, logo na frente) e os temas
// publicados, com foto e valor; tocar num tema abre o detalhe. Sem carrinho, sem
// pedido e sem botão de contato: é só para olhar e passar o link adiante.
//
// O rótulo embaixo do nome é o que o dado diz — Kit ou Peça. Nada de categoria
// inventada: a vitrine só mostra o que existe no acervo.
export default function VitrinePage() {
  const { id } = useParams<{ id: string }>();
  const [vitrine, setVitrine] = useState<Vitrine | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    carregarVitrine(id)
      .then((v) => { if (vivo) setVitrine(v); })
      .catch(() => { if (vivo) setVitrine(null); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id]);

  if (carregando) {
    return (
      <main className="vitrine-page">
        <p className="vitrine-aviso">Carregando…</p>
      </main>
    );
  }

  if (!vitrine) {
    return (
      <main className="vitrine-page">
        <div className="vitrine-vazia">
          <h1>Página não encontrada</h1>
          <p>Este link não existe ou foi desativado.</p>
        </div>
      </main>
    );
  }

  const total = vitrine.itens.length;

  return (
    <main className="vitrine-page">
      {/* Topo: a capa que ela escolheu na Minha Página, com a logo por cima. O véu
          escuro existe para o nome continuar legível sobre qualquer foto. */}
      <header
        className="vitrine-capa"
        style={vitrine.capa ? { backgroundImage: `url(${vitrine.capa})` } : undefined}
      >
        <div className="vitrine-capa-veu" aria-hidden="true" />
        <div className="vitrine-marca">
          <span className="vitrine-logo">
            {vitrine.avatar
              ? <img src={vitrine.avatar} alt="" />
              : <span aria-hidden="true">{getInitials(vitrine.nome)}</span>}
          </span>
          <div className="vitrine-marca-texto">
            <h1 className="vitrine-titulo">{vitrine.nome}</h1>
            {vitrine.local && <p className="vitrine-local">{vitrine.local}</p>}
          </div>
        </div>
      </header>

      <section className="vitrine-corpo">
        <div className="vitrine-secao">
          <h2 className="vitrine-secao-titulo">Temas disponíveis</h2>
          <span className="vitrine-secao-contagem">{total} {total === 1 ? 'item' : 'itens'}</span>
        </div>

        {total === 0 ? (
          <p className="vitrine-aviso">Nenhum item publicado ainda.</p>
        ) : (
          <ul className="vitrine-grade">
            {vitrine.itens.map((item) => (
              <li key={`${item.tipo}-${item.id}`}>
                <Link href={rotaDoItem(id, item)} className="vitrine-card">
                  <span className="vitrine-foto">
                    {item.imagem ? (
                      <img src={item.imagem} alt="" loading="lazy" />
                    ) : (
                      <Package className="vitrine-foto-vazia" aria-hidden="true" />
                    )}
                    <span className="vitrine-preco">{formatCurrency(item.preco)}</span>
                  </span>
                  <span className="vitrine-card-nome">{item.nome}</span>
                  <span className="vitrine-card-tipo">{item.tipo === 'kit' ? 'Kit' : 'Peça'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
