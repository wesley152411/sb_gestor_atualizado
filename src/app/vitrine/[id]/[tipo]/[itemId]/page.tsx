'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';
import { formatCurrency, getInitials } from '@/lib/utils';
import { carregarVitrine, rotaDaVitrine, type Vitrine } from '@/lib/vitrine';

// Detalhe de um tema da vitrine: foto grande, valor, descrição e o que vem
// dentro, quando é kit. Rota própria em vez de janela sobreposta: o link de um
// item pode ser enviado sozinho, e o "voltar" do celular volta para a grade.
export default function VitrineItemPage() {
  const params = useParams<{ id: string; tipo: string; itemId: string }>();
  const { id, tipo } = params;
  const itemId = decodeURIComponent(params.itemId);
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

  const item = vitrine?.itens.find((i) => i.tipo === tipo && i.id === itemId);

  return (
    <main className="vitrine-page">
      {vitrine && (
        <header className="vitrine-barra">
          <Link href={rotaDaVitrine(id)} className="vitrine-voltar" aria-label={`Voltar para ${vitrine.nome}`}>
            <ArrowLeft aria-hidden="true" />
          </Link>
          <span className="vitrine-barra-nome">{vitrine.nome}</span>
          <span className="vitrine-logo vitrine-logo-pequena">
            {vitrine.avatar
              ? <img src={vitrine.avatar} alt="" />
              : <span aria-hidden="true">{getInitials(vitrine.nome)}</span>}
          </span>
        </header>
      )}

      {!item ? (
        <div className="vitrine-vazia">
          <h1>Item não encontrado</h1>
          <p>Este item não está mais disponível.</p>
        </div>
      ) : (
        <article className="vitrine-detalhe">
          <div className="vitrine-foto vitrine-detalhe-foto">
            {item.imagem ? (
              <img src={item.imagem} alt={item.nome} />
            ) : (
              <Package className="vitrine-foto-vazia" aria-hidden="true" />
            )}
          </div>

          <div className="vitrine-detalhe-texto">
            <p className="vitrine-detalhe-tipo">{item.tipo === 'kit' ? 'Kit' : 'Peça'}</p>
            <h1 className="vitrine-detalhe-nome">{item.nome}</h1>
            <p className="vitrine-detalhe-preco">{formatCurrency(item.preco)}</p>
            {item.descricao && <p className="vitrine-detalhe-descricao">{item.descricao}</p>}

            {item.tipo === 'kit' && item.pecas.length > 0 && (
              <>
                <h2 className="vitrine-detalhe-sub">Itens do kit</h2>
                <ol className="vitrine-detalhe-pecas">
                  {item.pecas.map((p, i) => (
                    <li key={i}>
                      <span className="vitrine-peca-ordem" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                      <span className="vitrine-peca-nome">{p.nome}</span>
                      <span className="vitrine-peca-qtd">×{p.quantidade}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </article>
      )}
    </main>
  );
}
