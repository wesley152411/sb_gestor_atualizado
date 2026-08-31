// Sinal de "aceite legal exigido" vindo do SERVIDOR, em tempo real.
//
// O problema que isto resolve: o AuthProvider só consulta o aceite quando monta
// (carregamento de página) ou quando a sessão muda. Numa aba já aberta, um bump
// de versão dos documentos passa a devolver 403 em toda rota de dados, mas a
// tela continua achando que está tudo bem — a decoradora vê listas vazias e erros
// de carregamento em vez do gate. Isso se repetiria a cada nova versão.
//
// Por que interceptar o fetch em vez de tratar rota por rota: as chamadas estão
// espalhadas entre services/api.ts e várias páginas. Um ponto único cobre todas,
// inclusive as que forem escritas depois — não há como esquecer de ligar uma.
//
// O escopo é deliberadamente estreito: só same-origin /api/*, só 403, e só quando
// o corpo traz o código do gate. Qualquer outra resposta passa intacta, e o corpo
// original nunca é consumido (a checagem é feita num clone).

type Listener = () => void;

const listeners = new Set<Listener>();
let instalado = false;

function pathnameDe(input: RequestInfo | URL): string | null {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function instalar() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    if (response.status !== 403 || listeners.size === 0) return response;
    try {
      const path = pathnameDe(input);
      if (path?.startsWith('/api/')) {
        const body = await response.clone().json();
        if (body?.code === 'LEGAL_ACCEPTANCE_REQUIRED') listeners.forEach((listener) => listener());
      }
    } catch {
      // Corpo não-JSON ou clone indisponível: não é o 403 do gate. Segue o jogo.
    }
    return response;
  };
}

export function onLegalAcceptanceRequired(listener: Listener): () => void {
  if (typeof window === 'undefined') return () => {};
  instalar();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
