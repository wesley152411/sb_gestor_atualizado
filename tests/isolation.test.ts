import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestAccount, setEmailConfirmed, rawSignUp, deleteAuthUser, sweepTestAccounts, api, post, cleanupAccounts, prisma, type TestAccount } from './helpers';

let A: TestAccount;
let B: TestAccount;
let C: TestAccount;

beforeAll(async () => {
  await sweepTestAccounts(); // limpa resíduo de execuções anteriores
  [A, B, C] = await Promise.all([
    createTestAccount('A'),
    createTestAccount('B'),
    createTestAccount('C'),
  ]);
  // Dados só da conta A: um cliente e um evento.
  await post('/api/clients', A.cookie, { id: `cli_${Date.now()}`, name: 'Cliente de A', phone: '11999990000' });
  await post('/api/party-events', A.cookie, { id: `evt_${Date.now()}`, client_name: 'Festa de A', event_date: '2026-09-01', status: 'Aguardando confirmação' });
});

afterAll(async () => {
  await cleanupAccounts([A?.id, B?.id, C?.id].filter(Boolean) as string[]);
  await sweepTestAccounts(); // rede final: apaga qualquer conta de teste que sobrou
  await prisma.$disconnect();
});

describe('Isolamento multi-conta', () => {
  it('401 em todas as rotas sensíveis sem sessão', async () => {
    const paths = ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits', '/api/orders', '/api/calendar?year=2026&month=9', '/api/decorators/me'];
    for (const p of paths) {
      const r = await api(p, null);
      expect(r.status, `sem sessão: ${p}`).toBe(401);
    }
  });

  it('A vê os próprios clientes; B não vê nenhum de A', async () => {
    const da = await (await api('/api/clients', A.cookie)).json();
    expect(da.length).toBeGreaterThan(0);
    expect(da.every((c: any) => c.decorator_id === A.id)).toBe(true);

    const db = await (await api('/api/clients', B.cookie)).json();
    expect(db.some((c: any) => c.decorator_id === A.id)).toBe(false);
  });

  it('parâmetro forjado não vaza: B pedindo ?decoratorId=A não traz dados de A', async () => {
    const d = await (await api(`/api/clients?decoratorId=${A.id}`, B.cookie)).json();
    expect(d.some((c: any) => c.decorator_id === A.id)).toBe(false);

    const ev = await (await api(`/api/party-events?decoratorId=${A.id}`, B.cookie)).json();
    expect(ev.length).toBe(0);
  });

  it('chat: C não lê a conversa entre A e B (403), mesmo forjando os ids', async () => {
    const r = await api(`/api/chats?decoratorA=${A.id}&decoratorB=${B.id}`, C.cookie);
    expect(r.status).toBe(403);
  });

  it('chat: remetente é sempre a sessão (não posta em nome de outra conta)', async () => {
    // B envia msg para C, mas tenta forjar sender_id = A no corpo.
    await post('/api/chats', B.cookie, { id: `msg_${Date.now()}`, sender_id: A.id, receiver_id: C.id, message: 'oi de B' });

    // Conversa C<->B: existe e o remetente gravado é B (não A).
    const mCB = await (await api(`/api/chats?decoratorA=${C.id}&decoratorB=${B.id}`, C.cookie)).json();
    expect(mCB.length).toBeGreaterThan(0);
    expect(mCB.every((m: any) => m.sender_id === B.id || m.receiver_id === B.id)).toBe(true);

    // Conversa C<->A: NÃO deve conter a mensagem (o servidor ignorou o sender forjado).
    const mCA = await (await api(`/api/chats?decoratorA=${C.id}&decoratorB=${A.id}`, C.cookie)).json();
    expect(mCA.length).toBe(0);
  });

  it('DELETE de item alheio é bloqueado (403) e o próprio dono consegue (200)', async () => {
    const itemId = `itm_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: itemId, name: 'Peça de A', status: 'Privado', stock_quantity: 1, rental_price: 10 });

    const blocked = await api(`/api/inventory/${itemId}`, B.cookie, { method: 'DELETE' });
    expect(blocked.status).toBe(403);

    const ok = await api(`/api/inventory/${itemId}`, A.cookie, { method: 'DELETE' });
    expect(ok.status).toBe(200);
  });

  it('feed do Marketplace: item público de A aparece para B, mas item privado não', async () => {
    const pubId = `pub_${Date.now()}`;
    const privId = `prv_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: pubId, name: 'Publica de A', status: 'Público', stock_quantity: 2, rental_price: 20 });
    await post('/api/inventory', A.cookie, { id: privId, name: 'Privada de A', status: 'Privado', stock_quantity: 2, rental_price: 20 });

    // B pede o feed (sem decoratorId): vê a pública de A, não a privada, e não a própria.
    const feed = await (await api('/api/inventory', B.cookie)).json();
    const ids = feed.map((i: any) => i.id);
    expect(ids).toContain(pubId);
    expect(ids).not.toContain(privId);
    expect(feed.every((i: any) => i.decorator_id !== B.id)).toBe(true);
  });

  it('is_internal: some da vitrine, mas a flag NÃO é privilégio (segue 401/403)', async () => {
    // Conta interna criada como qualquer outra; a flag só é ligada DIRETO no banco
    // (nenhuma rota escreve). Ela dá dados próprios para provar o isolamento.
    const D = await createTestAccount('D');
    await post('/api/clients', D.cookie, { id: `cliD_${Date.now()}`, name: 'Cliente de D', phone: '11888880000' });
    await prisma.decorator.update({ where: { id: D.id }, data: { is_internal: true } });

    // LADO 1 — a flag controla a vitrine nos DOIS sentidos (contas de teste
    // nascem internas, então provamos ligando/desligando na própria D).
    let listIds = (await (await api('/api/decorators', A.cookie)).json()).map((d: any) => d.id);
    expect(listIds).not.toContain(D.id);   // interna: não aparece
    await prisma.decorator.update({ where: { id: D.id }, data: { is_internal: false } });
    listIds = (await (await api('/api/decorators', A.cookie)).json()).map((d: any) => d.id);
    expect(listIds).toContain(D.id);       // visível: aparece
    await prisma.decorator.update({ where: { id: D.id }, data: { is_internal: true } }); // restaura

    // LADO 2 — a flag não virou privilégio: os MESMOS bloqueios das demais contas.
    // 2a) sem sessão continua 401
    expect((await api('/api/clients', null)).status).toBe(401);
    // 2b) D não lê dados de A (isolamento intacto)
    const dSeesA = await (await api(`/api/clients?decoratorId=${A.id}`, D.cookie)).json();
    expect(dSeesA.some((c: any) => c.decorator_id === A.id)).toBe(false);
    // 2c) A não lê dados de D (a conta interna não é "aberta")
    const aSeesD = await (await api(`/api/clients?decoratorId=${D.id}`, A.cookie)).json();
    expect(aSeesD.some((c: any) => c.decorator_id === D.id)).toBe(false);
    // 2d) D não apaga item de A (403), mesmo sendo interna
    const itmId = `itmAD_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: itmId, name: 'Peça de A', status: 'Privado', stock_quantity: 1, rental_price: 10 });
    expect((await api(`/api/inventory/${itmId}`, D.cookie, { method: 'DELETE' })).status).toBe(403);
    await api(`/api/inventory/${itmId}`, A.cookie, { method: 'DELETE' }); // limpa

    // LADO 3 — a flag não é setável pela API: A tentar DESLIGAR a própria não
    // persiste (a rota descarta is_internal). A nasce interna (conta de teste).
    await post('/api/decorators', A.cookie, { id: A.id, is_internal: false });
    const aRow = await prisma.decorator.findUnique({ where: { id: A.id } });
    expect(aRow?.is_internal).toBe(true);

    await cleanupAccounts([D.id]);
  });

  it('conta com e-mail NÃO confirmado é recusada pelas rotas de dados (servidor)', async () => {
    // createTestAccount confirma + loga; aqui desconfirmamos para simular quem
    // tem sessão mas ainda não clicou no link.
    const U = await createTestAccount('U');
    await setEmailConfirmed(U.id, false);

    // Rotas de dados recusam a sessão não confirmada, igual a sem sessão (401).
    for (const p of ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits']) {
      const r = await api(p, U.cookie);
      expect(r.status, `não confirmado: ${p}`).toBe(401);
    }
    // Criação preguiçosa do perfil NÃO roda para conta não confirmada (403).
    const me = await post('/api/decorators/me', U.cookie, {});
    expect(me.status).toBe(403);

    // Depois de confirmar (equivale ao clique no link), passa a funcionar.
    await setEmailConfirmed(U.id, true);
    const okClients = await api('/api/clients', U.cookie);
    expect(okClients.status).toBe(200);

    await cleanupAccounts([U.id]);
  });

  // PROD-ONLY: esta sentinela verifica uma configuração do PAINEL da PRODUÇÃO
  // (mailer_autoconfirm=false). O projeto de TESTE deliberadamente tem autoconfirm
  // LIGADO (para não bater no rate limit do Auth), então ela não faz sentido lá e
  // é pulada nas execuções contra o banco de teste. Rode-a manualmente contra a
  // produção quando quiser reconferir o painel (signUp de leitura, sem criar dados).
  it.skipIf(process.env.HARNESS_ALLOW_TEST_DB === 'true')('SENTINELA: mailer_autoconfirm está DESLIGADO (conta nova nasce não confirmada)', async () => {
    // Se religarem o autoconfirm no painel, o signUp passa a devolver sessão e
    // e-mail já confirmado, e este teste falha na hora. mailer_autoconfirm=false
    // é configuração crítica de lançamento.
    const s = await rawSignUp('conf');
    expect(s.session, 'signUp devolveu sessão => autoconfirm LIGADO (barreira desfeita no painel)').toBeNull();
    expect(s.emailConfirmedAt, 'conta nasceu confirmada => autoconfirm LIGADO no painel').toBeFalsy();
    await deleteAuthUser(s.id);
  });

  it('callback: token inválido não loga e não cai na sessão anterior', async () => {
    // Conta M com sessão válida no navegador; o link (code) chega inválido.
    // O callback tem que mandar para /login com erro, NUNCA renderizar o app na
    // sessão preexistente. (O caminho de code VÁLIDO é PKCE e só roda no
    // navegador — fica para o teste manual.)
    const M = await createTestAccount('M');
    const r = await api('/auth/callback?code=invalido_xyz', M.cookie, { redirect: 'manual' });
    expect([302, 303, 307, 308]).toContain(r.status);
    const loc = r.headers.get('location') || '';
    expect(loc).toContain('/login');
    expect(loc).toContain('erro=confirmacao');
    await cleanupAccounts([M.id]);
  });

  it('confirm (token_hash): token inválido não loga e vai a /login', async () => {
    // Caminho de erro do /auth/confirm. O sucesso (verifyOtp com token_hash real)
    // é confirmação de e-mail e só roda com o token do e-mail — teste manual.
    const M = await createTestAccount('N');
    const r = await api('/auth/confirm?token_hash=invalido&type=signup', M.cookie, { redirect: 'manual' });
    expect([302, 303, 307, 308]).toContain(r.status);
    const loc = r.headers.get('location') || '';
    expect(loc).toContain('/login');
    expect(loc).toContain('erro=confirmacao');
    await cleanupAccounts([M.id]);
  });
});

// Regressão do link de orçamento público: a rota é aberta (sem sessão), então
// precisa devolver SÓ o card + a decoradora, nunca dados sensíveis; e só o dono
// age sobre o próprio evento.
describe('Isolamento — link de orçamento público (/api/public/quote)', () => {
  it('token válido lê só o próprio orçamento e o payload é enxuto (sem e-mail/custo/listas)', async () => {
    // A cria uma peça e gera o link de orçamento dela.
    const itemId = `inv_${Date.now()}`;
    await post('/api/inventory', A.cookie, {
      id: itemId, name: 'Peça Link A', description: 'x', image_url: '',
      status: 'Privado', stock_quantity: 5, rental_price: 100, internal_cost: 40,
    });
    const linkRes = await post('/api/quote-links', A.cookie, { itemId });
    expect(linkRes.status).toBe(200);
    const { token } = await linkRes.json();
    expect(token).toBeTruthy();

    // GET público (SEM cookie) — contrato mínimo.
    const res = await api(`/api/public/quote/${token}`, null);
    expect(res.status).toBe(200);
    const pub = await res.json();
    expect(pub.card?.name).toBe('Peça Link A');
    expect(pub.decorator?.name).toBeTruthy();

    // A decoradora só expõe nome + whatsapp.
    expect(Object.keys(pub.decorator).sort()).toEqual(['name', 'whatsapp']);
    // Top-level restrito ao contrato — nada de clients/events/acervo.
    const allowedTop = ['token', 'status', 'decorator', 'card', 'client_name', 'phone', 'address', 'event_date', 'setup_time', 'start_time', 'observation'];
    expect(Object.keys(pub).every((k) => allowedTop.includes(k))).toBe(true);
    // Nunca vaza e-mail de login nem custo interno.
    const raw = JSON.stringify(pub);
    expect(raw).not.toContain('internal_cost');
    expect(raw).not.toContain(A.email);
    expect(pub.client_name).toBe(''); // rascunho, ainda não preenchido
  });

  it('token alterado não devolve nada (404)', async () => {
    const itemId = `inv_${Date.now()}`;
    await post('/api/inventory', A.cookie, {
      id: itemId, name: 'Peça Link A2', description: 'x', image_url: '',
      status: 'Privado', stock_quantity: 5, rental_price: 100, internal_cost: 40,
    });
    const { token } = await (await post('/api/quote-links', A.cookie, { itemId })).json();
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const res = await api(`/api/public/quote/${tampered}`, null);
    expect(res.status).toBe(404);
  });

  it('B não confirma, cancela nem descarta um evento de A (403)', async () => {
    const ev = await prisma.partyEvent.findFirst({ where: { decorator_id: A.id }, orderBy: { created_at: 'desc' } });
    expect(ev).toBeTruthy();
    for (const action of ['confirm', 'cancel', 'discard'] as const) {
      const r = await post(`/api/party-events/${ev!.id}`, B.cookie, { action });
      expect(r.status, action).toBe(403);
    }
  });

  it('gerar link exige sessão e a posse da peça (401 sem sessão; 403 de peça alheia)', async () => {
    const itemId = `inv_${Date.now()}`;
    await post('/api/inventory', A.cookie, {
      id: itemId, name: 'Peça de A', description: 'x', image_url: '',
      status: 'Privado', stock_quantity: 5, rental_price: 100, internal_cost: 40,
    });
    // sem sessão
    expect((await post('/api/quote-links', null, { itemId })).status).toBe(401);
    // B tentando gerar link de uma peça de A
    expect((await post('/api/quote-links', B.cookie, { itemId })).status).toBe(403);
  });
});

// Reativação promocional (client_promo_messages). A rota vive atrás de uma
// feature flag: LIGADA, precisa do mesmo isolamento das demais rotas de dados;
// DESLIGADA, nem existe (404), inclusive para sessão válida — a guarda de flag
// roda ANTES da checagem de sessão. O harness sobe em `next dev`, onde a flag
// nasce LIGADA (fallback de dev); para exercitar o 404 da flag desligada, rode
// com NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP=false (há um job de CI dedicado a isso).
// Cada teste detecta o estado real da flag NESTE servidor e afirma o contrato
// correspondente, pulando o outro — assim o arquivo passa nos dois modos.
describe('Isolamento — reativação promocional (/api/promo-messages)', () => {
  // A rota responde 404 quando a flag está desligada (flagGuard antes de tudo).
  async function flagIsOn(): Promise<boolean> {
    return (await api('/api/promo-messages', A.cookie)).status !== 404;
  }

  it('sem sessão nunca devolve dados (401 com a flag ligada; 404 com ela desligada)', async () => {
    const r = await api('/api/promo-messages', null);
    // Ligada: a guarda de sessão responde 401. Desligada: a guarda de flag
    // responde 404 antes de checar a sessão. Em nenhum caso 200.
    expect([401, 404]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });

  it('FLAG LIGADA: decorator vem da sessão, posse do cliente é exigida e B não lê os envios de A', async ({ skip }) => {
    if (!(await flagIsOn())) return skip();

    // Cliente pertencente à A.
    const clientId = `cli_promo_${Date.now()}`;
    await post('/api/clients', A.cookie, { id: clientId, name: 'Cliente Promo A', phone: '11999990000' });

    // 1) A registra envio no PRÓPRIO cliente, mas FORJA o dono no corpo (id de B,
    //    nas duas grafias) → 200 e a linha carimba decorator_id=A: o servidor
    //    IGNORA o parâmetro e usa a sessão (exatamente o buraco corrigido na Etapa 1).
    const ok = await post('/api/promo-messages', A.cookie, {
      clientId, phone: '11999990000', message: 'Oi Maria',
      decoratorId: B.id, decorator_id: B.id,
    });
    expect(ok.status).toBe(200);
    const row = await ok.json();
    expect(row.decorator_id).toBe(A.id);   // sessão venceu o corpo forjado
    expect(row.decorator_id).not.toBe(B.id);
    expect(row.client_id).toBe(clientId);

    // 2) B tentando registrar envio no cliente de A → 403 (posse checada no servidor).
    const cross = await post('/api/promo-messages', B.cookie, { clientId, phone: '11999990000', message: 'invasao' });
    expect(cross.status).toBe(403);

    // 3) GET de B não enxerga nenhum envio de A (isolamento por sessão).
    const bList = await (await api('/api/promo-messages', B.cookie)).json();
    expect(Array.isArray(bList)).toBe(true);
    expect(bList.some((m: any) => m.decorator_id === A.id)).toBe(false);

    // 4) A enxerga o próprio envio.
    const aList = await (await api('/api/promo-messages', A.cookie)).json();
    expect(aList.some((m: any) => m.id === row.id && m.decorator_id === A.id)).toBe(true);
  });

  it('FLAG DESLIGADA: a rota não existe nem para sessão válida (404 no GET e no POST)', async ({ skip }) => {
    if (await flagIsOn()) return skip();
    expect((await api('/api/promo-messages', A.cookie)).status).toBe(404);
    const clientId = `cli_promo_off_${Date.now()}`;
    await post('/api/clients', A.cookie, { id: clientId, name: 'Cliente Off', phone: '11999990000' });
    const r = await post('/api/promo-messages', A.cookie, { clientId, phone: '11999990000', message: 'x' });
    expect(r.status).toBe(404);
  });
});
