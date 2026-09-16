// Casca da vitrine pública: página aberta a qualquer pessoa, sem login.
//
// SEM o rodapé legal, por decisão da dona: o formulário de orçamento pede dados
// da cliente e por isso carrega Política e Termos; a vitrine não pede nada —
// quem abre só olha as decorações.
export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return <div className="vitrine-shell">{children}</div>;
}
