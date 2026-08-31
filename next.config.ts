import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.80"],
  // Os documentos legais sao lidos do disco em tempo de execucao (src/lib/
  // legal-documents.ts) por um caminho MONTADO — o file tracing do Next nao
  // consegue enxergar isso sozinho e deixaria docs/politicas/ fora do deploy.
  // Sem estes arquivos nao ha versao nem hash: o gate e a rota de aceite caem.
  outputFileTracingIncludes: {
    "/*": ["docs/politicas/**"],
    "/api/**": ["docs/politicas/**"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
