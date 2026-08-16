// Logo oficial do SB Gestor (losango azul-petróleo, anel branco, centro magenta).
// Fonte ÚNICA da marca: qualquer troca de identidade futura é feita só aqui.
export function Logo({
  size = 40,
  className,
  title = 'SB Gestor',
}: {
  size?: number | string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 260 260"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: 'block' }}
    >
      <polygon points="130,0 260,130 130,260 0,130" fill="#0088B0" />
      <polygon points="130,69 191,130 130,191 69,130" fill="#FFFFFF" />
      <polygon points="130,97 163,130 130,163 97,130" fill="#D6006C" />
    </svg>
  );
}
