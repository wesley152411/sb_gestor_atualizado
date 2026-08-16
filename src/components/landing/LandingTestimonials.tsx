// Depoimentos — construído como componente, mas NÃO publicado enquanto não houver
// depoimentos reais autorizados por clientes. Passe `items` reais para renderizar;
// lista vazia => a seção não aparece na página (sem depoimentos fictícios).

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  avatar?: string;
};

export function LandingTestimonials({ items = [] }: { items?: Testimonial[] }) {
  if (!items.length) return null;

  return (
    <section id="depoimentos" className="lp-section" style={{ scrollMarginTop: 80 }}>
      <h2 className="lp-section-title">O que dizem as decoradoras</h2>
      <div className="lp-testi-grid">
        {items.map((t) => (
          <div className="lp-testi" key={t.name}>
            <p className="lp-testi-quote">“{t.quote}”</p>
            <div className="lp-testi-author">
              {t.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lp-testi-avatar" src={t.avatar} alt={t.name} />
              ) : (
                <div className="lp-testi-avatar" />
              )}
              <div>
                <div className="lp-testi-name">{t.name}</div>
                <div className="lp-testi-role">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
