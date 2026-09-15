'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { formatCurrency, getInitials } from '@/lib/utils';
import { carregarVitrine, rotaDoItem, type Vitrine } from '@/lib/vitrine';

// VITRINE PÚBLICA — o que a decoradora compartilha pela Minha Página. Grade no
// jeito de perfil do Instagram: quem abre vê as peças e os kits publicados, com
// foto e valor, e toca num item para ver o detalhe. Sem carrinho, sem pedido e
// sem botão de contato: é só para olhar e passar o link adiante.
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
      <header className="vitrine-perfil">
        {vitrine.avatar ? (
          <img className="vitrine-avatar" src={vitrine.avatar} alt="" />
        ) : (
          <div className="vitrine-avatar vitrine-avatar-iniciais" aria-hidden="true">
            {getInitials(vitrine.nome)}
          </div>
        )}
        <div className="vitrine-perfil-texto">
          <h1 className="vitrine-nome">{vitrine.nome}</h1>
          {vitrine.local && <p className="vitrine-local">{vitrine.local}</p>}
          <p className="vitrine-contagem">{total} {total === 1 ? 'item' : 'itens'}</p>
        </div>
      </header>

      {total === 0 ? (
        <p className="vitrine-aviso">Nenhum item publicado ainda.</p>
      ) : (
        <ul className="vitrine-grade">
          {vitrine.itens.map((item) => (
            <li key={`${item.tipo}-${item.id}`}>
              <Link href={rotaDoItem(id, item)} className="vitrine-tile">
                <span className="vitrine-foto">
                  {item.imagem ? (
                    <img src={item.imagem} alt="" loading="lazy" />
                  ) : (
                    <Package className="vitrine-foto-vazia" aria-hidden="true" />
                  )}
                </span>
                <span className="vitrine-tile-nome">{item.nome}</span>
                <span className="vitrine-tile-preco">{formatCurrency(item.preco)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
